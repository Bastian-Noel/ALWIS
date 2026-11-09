// Header presence: avatar stack, invite popover, status banner, join dialog, loading overlays.
import { cssVars, initial } from "./colors.mjs";

const NAME_KEY = "alwis-collab-name";
const MAX_VISIBLE = 4;
const svg = (id) => `<svg class="ic" aria-hidden="true" focusable="false"><use href="#i-${id}"/></svg>`;
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "style") n.style.cssText = v;
    else if (k === "html") n.innerHTML = v; // only ever static icon markup
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : document.createTextNode(k));
  return n;
}
export const savedName = () => { try { return localStorage.getItem(NAME_KEY) ?? ""; } catch { return ""; } };
const saveName = (v) => { try { localStorage.setItem(NAME_KEY, v); } catch {} };

export function avatar(peer, { size = "md", me = false } = {}) {
  const state = peer.state === "away" ? "reconnexion" : "en ligne";
  return el("span", {
    class: `cb-av cb-${size}${peer.state === "away" ? " away" : ""}${me ? " me" : ""}`,
    style: cssVars(peer.name, peer.variant),
    "data-peer": peer.id,
    role: "img",
    "aria-label": `${peer.name}${me ? " (vous)" : ""}, ${state}`,
    title: `${peer.name}${me ? " (vous)" : ""}`,
  }, initial(peer.name));
}

export class PresenceUI {
  constructor({ slot, onStart, onJoin, onLeave, onFollow, onKick, onLock, config }) {
    this.slot = slot;
    this.cb = { onStart, onJoin, onLeave, onFollow, onKick, onLock };
    this.config = config;
    this.session = null;
    this.open = false;
    this.root = el("div", { class: "cb-root", "data-state": "idle" });
    this.stack = el("div", { class: "cb-stack", role: "group", "aria-label": "Personnes connectées" });
    this.trigger = el("button", { class: "iconbtn cb-trigger", type: "button", "aria-haspopup": "dialog", "aria-expanded": "false", "aria-label": "Travailler à plusieurs", title: "Travailler à plusieurs", html: svg("users") + '<i class="cb-dot" aria-hidden="true"></i>', onclick: () => this.toggle() });
    this.pop = el("div", { class: "cb-pop", role: "dialog", "aria-label": "Travail à plusieurs", hidden: true });
    this.live = el("div", { class: "cb-sr", "aria-live": "polite", role: "status" });
    this.root.append(this.stack, this.trigger, this.pop, this.live);
    slot.append(this.root);
    document.addEventListener("pointerdown", (e) => this.open && !this.root.contains(e.target) && this.toggle(false));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && this.open) { this.toggle(false); this.trigger.focus(); } });
    this.banner = el("div", { class: "cb-banner", role: "status", "aria-live": "polite", hidden: true });
    document.querySelector("#alertHost")?.before(this.banner) ?? document.body.append(this.banner);
    this.renderPop();
    this.syncAvailability();
    this.modeObserver = new MutationObserver(() => this.syncAvailability());
    const ws = document.querySelector("#ws");
    if (ws) this.modeObserver.observe(ws, { attributes: true, attributeFilter: ["hidden"] });
  }
  announce(text) { this.live.textContent = ""; setTimeout(() => (this.live.textContent = text), 30); }
  syncAvailability() {
    const live = this.session && ["live", "reconnecting", "connecting"].includes(this.session.status);
    const canStart = this.config.canStart?.() ?? true;
    this.trigger.hidden = !live && !canStart;
    this.stack.hidden = !live;
    const go = this.pop.querySelector(".cb-form .btn.pri");
    if (go) go.disabled = !canStart;
  }
  showNoProject() {
    const err = this.pop.querySelector(".cb-form .cb-err");
    if (err) { err.textContent = "Ouvrez un projet avant de démarrer le partage."; err.hidden = false; }
  }
  toggle(force) {
    this.open = force ?? !this.open;
    this.pop.hidden = !this.open;
    this.trigger.setAttribute("aria-expanded", String(this.open));
    if (this.open) { this.renderPop(); this.pop.querySelector("input,button")?.focus(); }
  }
  attach(session) {
    this.session = session;
    const refresh = () => { this.renderStack(); if (this.open) this.renderPop(); this.renderBanner(); };
    session.on("roster", refresh);
    session.on("ready", refresh);
    session.on("status", () => { this.root.dataset.state = session.status; refresh(); this.syncAvailability(); });
    session.on("link", refresh);
    session.on("mode", refresh);
    session.on("peer-away", ({ id }) => this.announce(`${session.peer(id)?.name ?? "Une personne"} a perdu la connexion, sa place est gardée.`));
    session.on("peer-down", ({ id, reason }) => reason === "grace-expired" && this.announce("Une place a été libérée."));
    this.timer = setInterval(() => { if (this.session?.peers.some((p) => p.state === "away") || this.session?.hostState === "away") { this.renderBanner(); if (this.open) this.renderPop(); } }, 1000);
    refresh();
  }
  /* --- avatar stack: overlapping circles, +N overflow --- */
  renderStack() {
    this.stack.replaceChildren();
    const s = this.session;
    if (!s || !["live", "reconnecting"].includes(s.status)) return;
    const peers = [...s.peers].filter((p) => p.id !== s.me?.id).sort((a, b) => (a.id === "h" ? -1 : 0));
    const shown = peers.slice(0, MAX_VISIBLE);
    for (const p of shown) {
      const a = avatar(p, { me: p.id === s.me?.id });
      a.tabIndex = 0;
      a.addEventListener("click", () => p.id !== s.me?.id && this.cb.onFollow?.(p.id));
      a.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), a.click()));
      this.stack.append(a);
    }
    if (peers.length > shown.length) this.stack.append(el("button", { class: "cb-av cb-md cb-more", type: "button", "aria-label": `${peers.length - shown.length} autres personnes`, onclick: () => this.toggle(true) }, `+${peers.length - shown.length}`));
    this.syncAvailability();
  }
  renderBanner() {
    const s = this.session;
    const b = this.banner;
    if (!s) return (b.hidden = true);
    let text = "", kind = "";
    if (s.status === "reconnecting") { text = "Connexion perdue. Nouvelle tentative… Votre place est gardée quelques instants."; kind = "warn"; }
    else if (s.status === "connecting") { text = "Connexion à la session…"; kind = "info"; }
    else if (s.role === "guest" && s.hostState === "away") {
      const host = s.peer("h");
      const left = Math.max(0, Math.round(((host?.awayUntil ?? 0) - Date.now()) / 1000));
      text = `L’hôte a perdu la connexion. La session reprend dès son retour${left ? ` (attente maximale : ${left} s)` : ""}.`;
      kind = "warn";
    } else if (s.status === "closed" && s.closedReason && !["left"].includes(s.closedReason)) { text = closedMessage(s.closedReason); kind = "err"; }
    b.hidden = !text;
    b.dataset.kind = kind;
    b.textContent = text;
  }
  /* --- popover content --- */
  renderPop() {
    const s = this.session;
    const p = this.pop;
    p.replaceChildren();
    const live = s && ["live", "reconnecting", "connecting"].includes(s.status);
    if (!live) return p.append(this.startForm());
    if (s.isHost && !s.room) return p.append(el("div", { class: "cb-pending", role: "status" }, el("span", { class: "cb-spin", "aria-hidden": "true" }), "Connexion au serveur de partage…"));
    p.append(this.sessionView());
  }
  startForm() {
    const input = el("input", { id: "cbName", class: "cb-input", value: savedName(), maxlength: "32", autocomplete: "nickname", placeholder: "Votre prénom", "aria-label": "Votre nom affiché" });
    const err = el("p", { class: "cb-err", role: "alert", hidden: true });
    const go = el("button", { class: "btn pri", type: "button" }, "Démarrer le partage");
    const run = () => {
      const name = input.value.replace(/\s+/g, " ").trim();
      if (!name) { err.textContent = "Indiquez le nom que verront les autres."; err.hidden = false; return input.focus(); }
      saveName(name);
      this.cb.onStart(name);
    };
    go.addEventListener("click", run);
    input.addEventListener("keydown", (e) => e.key === "Enter" && run());
    go.disabled = !(this.config.canStart?.() ?? true);
    return el("div", { class: "cb-form" },
      el("h2", { class: "cb-h" }, "Travailler à plusieurs"),
      el("p", { class: "cb-p" }, `Invitez jusqu’à ${this.config.maxGuests} personnes sur ce projet. Les échanges passent directement d’ordinateur à ordinateur ; le serveur ne garde rien.`),
      el("label", { class: "cb-l", for: "cbName" }, "Votre nom"), input, err, go);
  }
  sessionView() {
    const s = this.session;
    const max = s.limits?.maxGuests ?? this.config.maxGuests;
    const guests = s.peers.filter((x) => x.id !== "h").length;
    const wrap = el("div", { class: "cb-session" });
    const direct = [...s.links.values()].filter((link) => link.mode === "p2p").length;
    const relayed = [...s.links.values()].filter((link) => link.mode === "relay").length;
    wrap.append(
      el("div", { class: "cb-session-head" },
        el("div", {}, el("p", { class: "cb-kicker" }, "SESSION EN COURS"), el("h2", { class: "cb-h" }, s.isHost ? "Votre espace partagé" : "Espace de " + (s.peer("h")?.name ?? "l’hôte")), el("p", { class: "cb-project-line" }, this.config.projectName?.() || "Projet partagé")),
        el("span", { class: "cb-live" }, el("i", { "aria-hidden": "true" }), s.status === "reconnecting" ? "Reconnexion" : "En ligne")),
      el("div", { class: "cb-session-stats", "aria-label": "État de la session" },
        el("div", { class: "cb-stat" }, el("b", {}, `${guests}/${max}`), el("span", {}, "invités")),
        el("div", { class: "cb-stat" }, el("b", {}, String(direct)), el("span", {}, "liaisons directes")),
        el("div", { class: "cb-stat" }, el("b", {}, String(relayed)), el("span", {}, "via le serveur")))
    );
    if (s.isHost) {
      const url = s.inviteUrl();
      const field = el("input", { class: "cb-input cb-url", readonly: true, value: url, "aria-label": "Lien d’invitation", onfocus: (e) => e.target.select() });
      const copy = el("button", { class: "btn pri cb-copy", type: "button", html: svg("link") + "<span>Copier le lien d’invitation</span>" });
      copy.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(url); } catch { field.select(); document.execCommand?.("copy"); }
        copy.querySelector("span").textContent = "Lien copié";
        this.announce("Lien d’invitation copié");
        setTimeout(() => copy.isConnected && (copy.querySelector("span").textContent = "Copier le lien d’invitation"), 1800);
      });
      const code = el("div", { class: "cb-code-row" }, el("span", {}, "Code de session"), el("b", { class: "cb-code" }, s.room), el("button", { class: "cb-copy-code", type: "button", "aria-label": "Copier le code de session", title: "Copier le code", onclick: async () => { try { await navigator.clipboard.writeText(s.room); } catch {} this.announce("Code de session copié"); } }, "Copier"));
      const invite = el("section", { class: "cb-section cb-invite-section", "aria-labelledby": "cb-invite-title" },
        el("div", { class: "cb-section-title" }, el("h3", { id: "cb-invite-title" }, "Inviter une personne"), el("span", {}, "Accès au projet")),
        field, copy, code,
        el("label", { class: "cb-check" }, el("input", { type: "checkbox", checked: s.locked, onchange: (e) => this.cb.onLock(e.target.checked) }), el("span", {}, "Fermer les invitations aux nouvelles personnes")));
      wrap.append(invite);
    } else {
      const peer = s.peer("h");
      const link = s.links.get("h");
      const mode = link?.mode === "p2p" ? "Connexion directe entre appareils" : link?.mode === "relay" ? "Relais serveur actif · débit limité" : "Établissement de la connexion…";
      wrap.append(el("div", { class: "cb-section cb-guest-note" }, el("span", { class: `cb-transport ${link?.mode === "p2p" ? "direct" : link?.mode === "relay" ? "relay" : "pending"}` }, mode), el("p", {}, `Vous travaillez sur le projet de ${peer?.name ?? "l’hôte"}. Les fichiers sont demandés à l’ouverture et restent servis par son appareil.`)));
    }
    const list = el("ul", { class: "cb-list" });
    const now = Date.now();
    for (const peer of s.peers) {
      const link = s.links.get(peer.id);
      const me = peer.id === s.me?.id;
      let status = peer.state === "away" ? `Hors ligne · place gardée ${Math.max(0, Math.round((peer.awayUntil - now) / 1000))} s` : me ? "Votre appareil" : peer.id === "h" ? "Hôte du projet" : link ? (link.mode === "p2p" ? "Connexion directe" : "Relais serveur · débit limité") : "Connexion en cours";
      const transport = !me && peer.state !== "away" && link ? el("span", { class: `cb-transport ${link.mode === "p2p" ? "direct" : "relay"}`, title: link.mode === "p2p" ? "Les données passent directement entre les appareils" : "Les données transitent par le relais serveur" }, link.mode === "p2p" ? "P2P" : "Relais") : null;
      const row = el("li", { class: "cb-row" + (peer.state === "away" ? " away" : "") }, avatar(peer, { me }), el("span", { class: "cb-who" }, el("b", {}, peer.name), el("small", {}, status)), transport);
      if (s.isHost && !me) row.append(el("button", { class: "iconbtn cb-kick", type: "button", "aria-label": `Retirer ${peer.name}`, title: "Retirer de la session", html: svg("x"), onclick: () => this.cb.onKick(peer.id) }));
      else if (!me && peer.state === "online") row.append(el("button", { class: "cb-go", type: "button", onclick: () => { this.cb.onFollow(peer.id); this.toggle(false); } }, "Aller à"));
      list.append(row);
    }
    wrap.append(el("div", { class: "cb-people-title" }, el("h3", {}, `Participants · ${s.peers.length}`), el("span", {}, "Cliquez sur une personne pour la suivre")), list,
      el("p", { class: "cb-privacy-note" }, "Le serveur signale les connexions et relaie les échanges si le P2P échoue. Il ne conserve ni fichiers ni contenu du projet."),
      el("button", { class: s.isHost ? "btn danger cb-stop" : "btn cb-stop", type: "button", onclick: () => this.cb.onLeave() }, s.isHost ? "Arrêter le partage" : "Quitter le projet partagé"));
    return wrap;
  }
  /* --- guest join dialog (from ?collab=CODE) --- */
  askJoin(room, { error } = {}) {
    return new Promise((resolve) => {
      const input = el("input", { class: "cb-input", value: savedName(), maxlength: "32", autocomplete: "nickname", "aria-label": "Votre nom affiché" });
      const err = el("p", { class: "cb-err", role: "alert", hidden: !error }, error ?? "");
      const go = el("button", { class: "btn pri", type: "button" }, "Rejoindre");
      const cancel = el("button", { class: "btn", type: "button" }, "Annuler");
      const dlg = el("div", { class: "cb-modal", role: "dialog", "aria-modal": "true", "aria-label": "Rejoindre une session" },
        el("div", { class: "cb-card" }, el("h2", { class: "cb-h" }, "Rejoindre la session"), el("p", { class: "cb-p" }, "Vous êtes invité à travailler sur un projet partagé."), el("label", { class: "cb-l" }, "Votre nom", input), err, el("div", { class: "cb-actions" }, cancel, go)));
      const done = (v) => { dlg.remove(); resolve(v); };
      const run = () => { const n = input.value.replace(/\s+/g, " ").trim(); if (!n) { err.textContent = "Indiquez votre nom."; err.hidden = false; return input.focus(); } saveName(n); done(n); };
      go.addEventListener("click", run);
      cancel.addEventListener("click", () => done(null));
      dlg.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); if (e.key === "Escape") done(null); });
      document.body.append(dlg);
      input.focus();
      input.select();
    });
  }
}
export function closedMessage(reason) {
  return ({
    kicked: "L’hôte vous a retiré de la session.",
    full: "La session est complète.",
    locked: "L’hôte a fermé l’accès à la session.",
    "no-room": "Cette session n’existe plus ou le lien est incorrect.",
    "host-timeout": "L’hôte ne s’est pas reconnecté : la session est terminée.",
    "host-left": "L’hôte a arrêté la session.",
    "server-stop": "Le serveur redémarre. Réessayez dans un instant.",
    replaced: "Vous êtes connecté depuis un autre onglet.",
    refused: "Connexion refusée par le serveur.",
    "server-full": "Le serveur n’accepte plus de nouvelles sessions pour le moment.",
  })[reason] ?? "La session est terminée.";
}

/** Skeleton + label shown over a container while waiting for the host. Returns a release function. */
export function showLoading(host, label = "Chargement depuis l’hôte…") {
  if (!host) return () => {};
  const layer = el("div", { class: "cb-loading", role: "status", "aria-live": "polite" }, el("span", { class: "cb-spin", "aria-hidden": "true" }), el("span", { class: "cb-loadtext" }, label));
  const pos = getComputedStyle(host).position;
  if (pos === "static") host.style.position = "relative";
  host.append(layer);
  host.setAttribute("aria-busy", "true");
  return () => { layer.remove(); host.removeAttribute("aria-busy"); };
}
