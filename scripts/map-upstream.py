#!/usr/bin/env python3
"""Create a navigable, commit-pinned extraction map from real local source."""
import csv, hashlib, io, json, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[1]
entries = []
def add(repo, target, action, path, needle, purpose):
    entries.append(dict(repo=repo, target=target, action=action, path=path, needle=needle, purpose=purpose))

r='seanmorris/php-wasm'; t='packages/runtime/adapters/seanmorris (à créer)'
for p,n,why in [
 ('source/PhpCgiBase.mjs','async request(request)','CGI et cycle HTTP ; sortir les moteurs du Service Worker'),
 ('source/PhpCgiBase.mjs','async _request(request, php)','Construire les variables CGI et préserver POST/cookies/en-têtes'),
 ('source/PhpCgiBase.mjs','handleMessageEvent(event)','Réutiliser le protocole de commandes plutôt que doubler les bus'),
 ('source/PhpCgiBase.mjs','async _enqueue(','Comparer la file existante à notre admission bornée'),
 ('source/PhpCgiBase.mjs','async _afterRequest(','Point de persistance et de nettoyage par requête'),
 ('source/fsOps.mjs','static async readFile','Interface de lecture de fichiers à remplacer par OPFS/cache borné'),
 ('source/fsOps.mjs','static async writeFile','Écriture, invalidation et barrière avant requête suivante'),
 ('source/idbfsSync.mjs','async function flush','Journal incrémental : conserver les mutations après erreur/quota'),
 ('source/idbfsSync.mjs','backend.syncfs =','Comparer persistance incrémentale et backend OPFS'),
 ('source/parseResponse.mjs','export','Parsing des réponses CGI ; vérifier en-têtes répétés et binaire'),
 ('test/perf/wasmfs-opfs/README.md','#','Réutiliser la méthode comparative OPFS/IDBFS, pas les chiffres comme promesse'),
 ('test/perf/wasmfs-opfs/results/2026-09-20-incremental-idbfs/README.md','## Results','Résultats amont : IDBFS incrémental peut concurrencer OPFS'),
 ('php.mk','include','Entrée des recettes de compilation ; suivre les includes pour le profil PHP'),
]: add(r,t,'adapter / comparer',p,n,why)

r='joomengine/mariadb-wasm-bridge'; t='packages/sql-native + adaptateur PDO (à implémenter)'
for p,n,why in [
 ('native/pdo_mariadb_wasm.c','static bool wm_call(','Remplacer sérialisation JSON et hostcall par API native commune'),
 ('native/pdo_mariadb_wasm.c','php_base64_decode_ex','Supprimer décodage base64 dans le transport cible'),
 ('native/pdo_mariadb_wasm.c','static bool wm_prepare(','Conserver le contrat PDO ; distinguer préparations émulées et natives'),
 ('native/pdo_mariadb_wasm.c','static int wm_statement_column(','Respecter types, NULL et durée de vie des zval'),
 ('native/pdo_mariadb_wasm.c','static int wm_factory(','DSN mysql, charset, connexion et erreurs PDO'),
 ('native/pdo_mariadb_wasm.c','PDO_DRIVER_HEADER(mysql)','Éviter le double enregistrement de pdo_mysql et du pilote adapté'),
 ('src/protocol.mjs','async query(payload)','Mesurer les requêtes auxiliaires SET NAMES/sql_mode/statut'),
 ('src/protocol.mjs','function encodeCell','Remplacer les copies de cellules/base64 par buffers typés'),
 ('src/protocol.mjs','async reset()','Changer reset global en nettoyage limité au propriétaire PHP'),
 ('src/engine.mjs','openSession()','Sessions MariaDB réelles distinctes pour PDO/MySQLi/console'),
 ('src/engine.mjs','async flush()','Checkpoint InnoDB avant sauvegarde IDBFS ; durabilité à vérifier'),
 ('src/index.mjs','maxQueuedBytes:','Réutiliser validation des limites ; réduire les budgets pour projet scolaire'),
 ('adapters/php-wasm.mjs','createPhpWasmAdapter','Assembler le hostcall natif avec Sean Morris'),
 ('patches/engine/independent-sessions.patch','--innodb-buffer-pool-size=64M','Référence historique : patch GPL-2.0-only selon patches/NOTICE au même commit ; conserver sa notice si repris'),
 ('native/tests/database-contract.php','<?php','Porter les tests de conformité avant optimisation du transport'),
 ('native/upstream-versions.json','"emscriptenVersion"','Épinglage de compatibilité Sean Morris/PHP/SDK'),
]: add(r,t,'adapter ; garder les tests',p,n,why)

r='shyim/lite4mariadb'; t='packages/sql-native/backend + build MariaDB (à créer)'
for p,n,why in [
 ('wasm/CMakeLists.txt','INITIAL_MEMORY=268435456','256 Mio initiaux : matrice de réduction, sans promettre la RAM réelle'),
 ('wasm/CMakeLists.txt','PTHREAD_POOL_SIZE=16','16 pthreads : réduire seulement après test InnoDB/démarrage'),
 ('wasm/CMakeLists.txt','MAXIMUM_MEMORY=2147483648','Plafond 2 Gio et croissance ; vues JS à renouveler après growth'),
 ('wasm/lite4mariadb.c','mysql_store_result(m)','Résultats entièrement bufferisés : un transport par lots seul ne suffit pas'),
 ('wasm/lite4mariadb.c','--innodb-buffer-pool-size=16M','Base amont 16 Mio, comparer au profil JoomEngine 64 Mio'),
 ('wasm/lite4mariadb.c','char *l4m_query','Entrée ABI C actuelle vers JSON ; cible pour curseurs typés'),
 ('wasm/src/index.mjs','mod.FS.mount(mod.FS.filesystems.IDBFS','Montage IDBFS avec miroir ; prototype OPFS distinct'),
 ('wasm/src/index.mjs','async persist()','Sauvegarde explicite distincte du COMMIT'),
 ('wasm/src/worker.mjs','export','API Worker JS, console SQL sans exécuter PHP'),
]: add(r,t,'adapter et mesurer',p,n,why)

r='php/php-src'; t='packages/sql-native/mysqli (à créer)'
for p,n,why in [
 ('ext/mysqli/mysqli_nonapi.c','PHP_FUNCTION(mysqli_connect)','Conserver interface mysqli_connect et connexion objet'),
 ('ext/mysqli/mysqli_api.c','PHP_FUNCTION(mysqli_stmt_bind_param)','Paramètres par référence : lire les valeurs au moment de execute'),
 ('ext/mysqli/mysqli_nonapi.c','PHP_FUNCTION(mysqli_stmt_get_result)','Retour mysqli_result pour prepared statements'),
 ('ext/mysqli/mysqli_api.c','PHP_FUNCTION(mysqli_stmt_execute)','Exécution préparée et gestion des références'),
 ('ext/mysqli/mysqli.c','mysqli_link_free_storage','Libération des objets et cycle de requête'),
 ('ext/mysqlnd/mysqlnd_structs.h','func_mysqlnd_conn_data__connect','Étudier les tables de méthodes ; détourner transport seul serait insuffisant'),
 ('ext/mysqlnd/mysqlnd_result.c','mysqlnd','Contrat résultats/mysqlnd à reproduire si backend adapté'),
 ('ext/pdo/php_pdo_driver.h','struct pdo_stmt_methods','Interface PDO et durées de vie à respecter'),
]: add(r,t,'étudier puis adapter en C',p,n,why)

r='WordPress/wordpress-playground'; t='apps/studio + packages/http-router (à créer)'
for p,n,why in [
 ('packages/php-wasm/web-service-worker/src/lib/utils.ts','convertFetchEventToPHPRequest','Transformer fetch en requête PHP ; pas de moteur dans le SW'),
 ('packages/php-wasm/web-service-worker/src/lib/utils.ts','broadcastMessageExpectReply','Adapter découverte/broadcast vers un seul propriétaire connu'),
 ('packages/php-wasm/web-service-worker/src/lib/messaging.ts','export function postMessageExpectReply','Corréler requestId et réponse ; nettoyer timeout et ports'),
 ('packages/php-wasm/scopes/src/lib/scope.ts','export function','Routage scoped ; distinguer runtimeId et sessionId'),
 ('packages/php-wasm/universal/src/lib/http-cookie-store.ts','export class','Un cookie jar virtuel par joueur, pas les cookies globaux du site'),
 ('packages/php-wasm/universal/src/lib/php-request-handler.ts','export class','Document root et résolution HTTP/static/PHP'),
]: add(r,t,'reprendre les principes / adapter',p,n,why)

r='joomengine/php-wasm'; t='alternative au runtime principal (décision ouverte)'
for p,n,why in [
 ('versions.json','"pdo_mariadb_wasm"','Le runtime épingle un autre commit du bridge : pas de compatibilité supposée'),
 ('src/index.mjs','export','Alternative API runtime native, pas un deuxième moteur simultané'),
 ('README.md','hostCalls','Contrat hostcall et garanties HTTP documentées'),
]: add(r,t,'comparer',p,n,why)

r='emscripten-core/emscripten'; t='packages/files/native-vfs (à créer)'
for p,n,why in [
 ('system/lib/wasmfs/backends/opfs_backend.cpp','class OPFSFile','Backend fichier WasmFS ; lectures/écritures par offset'),
 ('system/lib/wasmfs/backends/opfs_backend.cpp','class Worker','Proxy et contraintes pthread/JSPI à tester'),
 ('src/lib/libwasmfs_opfs.js','createSyncAccessHandle','Accès OPFS synchrone dans Dedicated Worker'),
 ('system/lib/wasmfs/backends/opfs_backend.cpp','class OPFSDirectory','Renommage, troncature, fichiers ouverts, conformité MariaDB'),
]: add(r,t,'prototype ; ne pas copier un backend sans rebuild',p,n,why)

for r,p,n,why in [
 ('zen-fs/core','src/mixins/async.ts','export function Async','Évaluer les caches et préchargements du VFS async/sync'),
 ('zen-fs/dom','src/access.ts','export class WebAccessFS','Backend handles : index et parcours récursif, pas accès synchrone garanti'),
 ('zen-fs/emscripten','src/plugin.ts','export default class EmscriptenPlugin','Montage ZenFS dans Emscripten ; mesurer copies et caches'),
 ('zen-fs/emscripten','src/backend.ts','export','Sens inverse Emscripten vers ZenFS : choisir un seul VFS'),
 ('kachurun/opfs-worker','src/core/OPFSSync.ts','export class OPFSSync','Gestion des descripteurs et partage du sync handle par fichier'),
 ('kachurun/opfs-worker','src/core/OPFSSync.ts','async readFile','Alloue tout le fichier ; préférer read par blocs pour gros médias'),
 ('kachurun/opfs-worker','src/core/OPFSAsync.ts','export class OPFSAsync','Comparer backend async et opérations disponibles'),
 ('GoogleChromeLabs/comlink','src/comlink.ts','export function transfer','Transferts ArrayBuffer ; ne pas transférer une vue mémoire WASM'),
 ('GoogleChromeLabs/comlink','src/comlink.ts','export function expose','Alternative RPC : éviter empilement avec quickbus'),
]: add(r,'packages/files ou transport (à créer)','référence / comparer',p,n,why)

for r,p,n,why in [
 ('drawdb-io/drawdb','src/components/EditorCanvas/Table.jsx','const','Tables déplaçables : réécrire une interface légère ciblée'),
 ('drawdb-io/drawdb','src/components/EditorCanvas/Relationship.jsx','const','Relations visuelles ; traduire en SQL après validation réelle'),
 ('drawdb-io/drawdb','src/utils/importFrom/schemaQuery/mariadb.js','SELECT','Introspection MariaDB ; conserver détails PK/FK/index composites'),
 ('chartdb/chartdb','src/lib/data/import-metadata/scripts/mysql-script.ts','SELECT','Requête de métadonnées ; à adapter au moteur embarqué'),
 ('chartdb/chartdb','src/pages/editor-page/canvas/table-node/table-node.tsx','export','Présentation colonnes/clés sans inclure toute application'),
 ('chartdb/chartdb','src/pages/editor-page/canvas/relationship-edge/relationship-edge.tsx','export','Arêtes et édition des relations'),
 ('outerbase/studio','src/drivers/mysql/generate-schema.ts','export','Génération SQL de structure à comparer au introspecteur'),
 ('outerbase/studio','src/core/query-pipeline.tsx','export','Chaîne requête/résultats/erreurs ; console native JS'),
 ('outerbase/studio','src/lib/build-table-result.ts','export','Résultats tabulaires ; plafonner pagination et taille cellule'),
 ('xyflow/xyflow','packages/react/src/components/Handle/index.tsx','export','Poignées de liaison entre colonnes'),
 ('xyflow/xyflow','packages/system/src/xyhandle/XYHandle.ts','export','Validation des interactions et nouvelles relations'),
 ('codemirror/lang-sql','src/sql.ts','export const MariaSQL','Dialecte MariaDB pour éditeur SQL chargé à la demande'),
 ('codemirror/lang-sql','src/complete.ts','export','Complétion à partir des métadonnées réelles'),
]: add(r,'apps/database-ui (à créer)','inspiration / adapter des éléments ciblés',p,n,why)

def main():
    lock = {e['repo']:e for e in json.loads((ROOT/'provenance/upstream-lock.json').read_text())['repositories']}
    mapped=[]; missing=[]
    for number, entry in enumerate(entries,1):
        meta=lock[entry['repo']]; path=ROOT/meta['directory']/entry['path']
        if not path.exists(): missing.append(f"{entry['repo']} {entry['path']}: FILE MISSING"); continue
        raw=path.read_bytes(); lines=raw.decode('utf-8').splitlines()
        found=next((i for i,line in enumerate(lines,1) if entry['needle'] in line),None)
        if found is None: missing.append(f"{entry['repo']} {entry['path']}: NEEDLE {entry['needle']}"); continue
        mapped.append(dict(id=f'SRC-{number:03}', **entry, commit=meta['sha'], line=found,
                           file_sha256=hashlib.sha256(raw).hexdigest(),
                           url='https://github.com/'+entry['repo']+'/blob/'+meta['sha']+'/'+entry['path']+'#L'+str(found)))
    if missing: raise SystemExit('\n'.join(missing))
    (ROOT/'provenance/source-map.json').write_text(json.dumps(mapped,indent=2,ensure_ascii=False)+'\n')
    fields=['id','repo','commit','path','line','needle','target','action','purpose','file_sha256','url']
    with (ROOT/'provenance/source-map.csv').open('w',newline='') as f:
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(mapped)
    out=['# Cartographie du code amont','',f'{len(mapped)} points vérifiés sur {len(lock)} dépôts. Les liens épinglent les commits, les empreintes vérifient les fichiers entiers.',
         '', 'Les lignes sont des repères de lecture, pas des plages à copier aveuglément. Les destinations marquées « à créer » ne sont pas implémentées.', '']
    last=None
    for entry in mapped:
        if entry['repo']!=last:
            last=entry['repo'];out += ['## '+last,'','| ID | Source exacte | Intérêt et adaptation | Destination |','|---|---|---|---|']
        out += [f"| {entry['id']} | [{entry['path']}:{entry['line']}]({entry['url']}) — `{entry['needle']}` | {entry['purpose']} | {entry['target']} |"]
    (ROOT/'docs/CODE-MAP.md').write_text('\n'.join(out)+'\n')
    print(str(len(mapped))+' source locations mapped and hashed')
if __name__=='__main__':main()
