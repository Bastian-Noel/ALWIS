# HTTP PHP dans le navigateur

`src/http-stream.c` enregistre les wrappers natifs PHP `http` et `https`. Les appels usuels `file_get_contents()` et `fopen()` utilisent Fetch dans le Worker propriétaire ; Asyncify suspend PHP pendant la lecture. Les requêtes SQL restent des appels C directs et ne passent pas par ce transport.

Les options prises en charge sont méthode, corps, en-têtes sous forme de chaîne ou tableau, délai et `ignore_errors`. Les en-têtes de la réponse finale alimentent le stream et `$http_response_header`. Les règles du navigateur s'appliquent : CORS, en-têtes réservés, cookies et redirections. Les redirections intermédiaires et la version HTTP réellement négociée ne sont pas exposées ; la ligne `HTTP/1.1` est une représentation de compatibilité.

## Réception bornée

- Corps de requête limité à 8 Mio avant Fetch.
- Corps de réponse limité à 16 Mio **pendant la lecture** de `ReadableStream`, y compris après décompression par le navigateur.
- `Content-Length` trop grand refusé dès les en-têtes, sauf HEAD qui n'a pas de corps. La taille réellement lue est contrôlée même si cette indication manque ou ne correspond pas au corps décodé.
- Réponse accumulée dans au plus 256 blocs possédés de 64 Kio. Les vues des chunks réseau ne sont pas conservées ; leur taille et leur nombre ne créent pas une liste de petits buffers non bornée.
- Dépassement ou délai : `AbortController` annule le transfert et les blocs accumulés sont abandonnés. Le délai, 30 secondes par défaut et 180 maximum, couvre les en-têtes et le corps.
- En-têtes de réponse limités à 64 Kio et erreurs sérialisées limitées à 512 caractères.

Le transfert vers C utilise un frame binaire borné, puis un stream PHP en mémoire. Il reste donc des copies temporaires JS/WASM/PHP, même lorsque la réponse est autorisée. Ce n'est pas un stream PHP progressif ni une borne globale de RAM : buffers réseau et décompression internes au navigateur ne sont pas contrôlables depuis Fetch. Les limites applicatives arrêtent la consommation dès le premier chunk qui ferait dépasser le budget.

## Validation reproductible

Après compilation du target `pbl-runtime` :

```bash
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node tests/browser/network-native.mjs
```

Le harness vérifie le corps binaire exact de 16 Mio, l'annulation observée par un producteur de 64 Mio sans taille annoncée, le refus de Content-Length trop grand, une réponse gzip décompressée de 17 Mio, les délais avant en-têtes et pendant le corps, le refus d'un corps de requête trop grand, les erreurs HTTP, HEAD, 204 et les redirections. Il vérifie ensuite que MariaDB peut démarrer et que PHP HTTP fonctionne encore. Les reçus sont écrits dans le dossier de compilation ; seuls les résultats effectivement exécutés doivent être archivés comme preuves.

Le parcours natif général conserve aussi le test POST avec corps et en-tête personnalisé. La parité complète du wrapper PHP reste à approfondir, notamment les options de proxy, les politiques de redirection et les connexions réseau autres que HTTP/HTTPS.
