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

const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
const secondsLeft = (until) => Math.max(0, Math.round((until - Date.now()) / 1000));

export class PresenceUI {
  constructor({ slot, onStart, onJoin, onLeave, onFollow, onFollowToggle, getFollowing, onKick, onLock,
    onPreviewPermission, getPreviewPermission, config }) {
    this.slot = slot;
    this.cb = { onStart, onJoin, onLeave, onFollow, onFollowToggle, getFollowing, onKick, onLock,
      onPreviewPermission, getPreviewPermission };
    this.config = config;
    this.session = null;
    this.open = false;
    this.root = el("div", { class: "cb-root", "data-state": "idle" });
    this.stack = el("div", { class: "cb-stack", role: "group", "aria-label": "Personnes connectées" });
    this.trigger = el("button", { class: "iconbtn cb-trigger", type: "button", "aria-haspopup": "dialog", "aria-expanded": "false", "aria-label": "Travailler à plusieurs", title: "Travailler à plusieurs", html: svg("users") + '<i class="cb-dot" aria-hidden="true"></i>', onclick: () => this.toggle() });
    this.pop = el("div", { class: "cb-pop", role: "dialog", "aria-label": "Travailler à plusieurs", hidden: true });
    this.live = el("div", { class: "cb-sr", "aria-live": "polite", role: "status" });
    this.root.append(this.stack, this.trigger, this.pop, this.live);
    slot.append(this.root);
    document.addEventListener("pointerdown", (e) => this.open && !this.root.contains(e.target) && this.toggle(false));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && this.open) { this.toggle(false); this.trigger.focus(); } });
    this.banner = el("div", { class: "cb-banner", role: "status", "aria-live": "polite", hidden: true });
    // Element.before() returns undefined, so optional chaining followed by
    // "?? document.body.append(...)" always moved the banner out of view.
    const alerts = document.querySelector("#alertHost");
    if (alerts?.parentElement) alerts.before(this.banner);
    else (document.querySelector("#main") ?? document.body).prepend(this.banner);
    this.renderPop();
    this.syncAvailability();
    this.modeObserver = new MutationObserver(() => this.syncAvailability());
    const ws = document.querySelector("#ws");
    if (ws) this.modeObserver.observe(ws, { attributes: true, attributeFilter: ["hidden"] });
  }
  announce(text) { this.live.textContent = ""; setTimeout(() => (this.live.textContent = text), 30); }
  get running() { return !!this.session && ["live", "reconnecting", "connecting"].includes(this.session.status); }
  syncAvailability() {
    const canStart = this.config.canStart?.() ?? true;
    this.trigger.hidden = !this.running && !canStart;
    this.stack.hidden = !this.running;
    const go = this.pop.querySelector(".cb-form .btn.pri");
    if (go) go.disabled = !canStart;
  }
  showNoProject() {
    const err = this.pop.querySelector(".cb-form .cb-err");
    if (err) { err.textContent = "Ouvrez d’abord un projet, puis relancez le partage."; err.hidden = false; }
  }
  toggle(force) {
    this.open = force ?? !this.open;
    this.pop.hidden = !this.open;
    this.trigger.setAttribute("aria-expanded", String(this.open));
    if (this.open) { this.renderPop(); this.pop.querySelector("input:not([readonly]),button")?.focus(); }
  }
  refresh() { this.renderStack(); if (this.open) this.renderPop(); this.renderBanner(); this.syncAvailability(); }
  attach(session) {
    this.session = session;
    const refresh = () => this.refresh();
    session.on("roster", refresh);
    session.on("ready", refresh);
    session.on("status", () => { this.root.dataset.state = session.status; refresh(); });
    session.on("link", refresh);
    session.on("mode", refresh);
    session.on("peer-away", ({ id }) => this.announce(`${session.peer(id)?.name ?? "Une personne"} a perdu la connexion. Sa place est gardée quelques instants.`));
    session.on("peer-down", ({ id, reason }) => reason === "grace-expired" && this.announce("Une place s’est libérée."));
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      const waiting = this.session?.peers.some((p) => p.state === "away") || this.session?.hostState === "away";
      if (waiting) { this.renderBanner(); if (this.open) this.renderPop(); }
    }, 1000);
    refresh();
  }
  /* --- avatar stack: overlapping circles, "+N" overflow, click = go to that person --- */
  renderStack() {
    this.stack.replaceChildren();
    const s = this.session;
    if (!s || !["live", "reconnecting"].includes(s.status)) return;
    const following = this.cb.getFollowing?.();
    const peers = [...s.peers].filter((p) => p.id !== s.me?.id).sort((a, b) => (a.id === "h" ? -1 : b.id === "h" ? 1 : 0));
    const shown = peers.slice(0, MAX_VISIBLE);
    for (const p of shown) {
      const a = avatar(p);
      a.classList.toggle("following", following === p.id);
      a.title = `${p.name}${p.state === "away" ? " (reconnexion en cours)" : ""} — cliquer pour aller là où cette personne travaille`;
      a.tabIndex = 0;
      a.setAttribute("role", "button");
      a.addEventListener("click", () => this.cb.onFollow?.(p.id));
      a.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), a.click()));
      this.stack.append(a);
    }
    if (peers.length > shown.length) this.stack.append(el("button", { class: "cb-av cb-md cb-more", type: "button", "aria-label": `${peers.length - shown.length} autres personnes`, onclick: () => this.toggle(true) }, `+${peers.length - shown.length}`));
  }
  renderBanner() {
    const s = this.session;
    const b = this.banner;
    b.replaceChildren();
    if (!s) return (b.hidden = true);
    let text = "", kind = "";
    const following = this.cb.getFollowing?.();
    if (s.status === "reconnecting") { text = "Connexion perdue : nouvelle tentative en cours. Votre place reste réservée."; kind = "warn"; }
    else if (s.status === "connecting") { text = "Connexion à la session…"; kind = "info"; }
    else if (s.role === "guest" && s.hostState === "away") {
      const left = secondsLeft(s.peer("h")?.awayUntil ?? 0);
      text = `L’hôte s’est déconnecté. La session reprendra à son retour${left ? ` (au plus tard dans ${left} s)` : ""}.`;
      kind = "warn";
    } else if (s.status === "closed" && s.closedReason && s.closedReason !== "left") { text = closedMessage(s.closedReason); kind = "err"; }
    else if (following && s.peer(following)) {
      text = `Vous suivez ${s.peer(following).name} : votre écran va là où cette personne travaille.`;
      kind = "follow";
      b.append(el("span", {}, text), el("button", { class: "cb-banner-btn", type: "button", onclick: () => this.cb.onFollowToggle?.(following) }, "Arrêter de suivre"));
    }
    if (kind !== "follow") b.textContent = text;
    b.hidden = !text;
    b.dataset.kind = kind;
  }
  renderPop() {
    const s = this.session;
    const p = this.pop;
    p.replaceChildren();
    if (!this.running) return p.append(this.startForm());
    if (s.isHost && !s.room) return p.append(el("div", { class: "cb-pending", role: "status" }, el("span", { class: "cb-spin", "aria-hidden": "true" }), "Création de la session…"));
    p.append(this.sessionView());
  }
  /* --- before sharing: pick a name --- */
  startForm() {
    const project = this.config.projectName?.();
    const input = el("input", { id: "cbName", class: "cb-input", value: savedName(), maxlength: "32", autocomplete: "nickname", placeholder: "Par exemple : Camille", "aria-describedby": "cbNameHint" });
    const err = el("p", { class: "cb-err", role: "alert", hidden: true });
    const go = el("button", { class: "btn pri cb-wide", type: "button" }, "Créer le lien d’invitation");
    const run = () => {
      const name = input.value.replace(/\s+/g, " ").trim();
      if (!name) { err.textContent = "Choisissez le nom que les autres verront."; err.hidden = false; return input.focus(); }
      saveName(name);
      this.cb.onStart(name);
    };
    go.addEventListener("click", run);
    input.addEventListener("keydown", (e) => e.key === "Enter" && run());
    return el("div", { class: "cb-form" },
      el("h2", { class: "cb-h" }, "Travailler à plusieurs"),
      el("p", { class: "cb-p" }, project ? `Invitez des personnes à travailler avec vous sur « ${project} » : elles verront vos fichiers, vos tables et l’aperçu, et pourront les modifier en même temps que vous.` : "Invitez des personnes à travailler avec vous sur ce projet, en même temps."),
      el("label", { class: "cb-l", for: "cbName" }, "Votre nom"),
      input,
      el("p", { class: "cb-hint", id: "cbNameHint" }, "Il s’affiche, avec une couleur, à côté de votre curseur."),
      err, go,
      el("p", { class: "cb-foot" }, `Jusqu’à ${plural(this.config.maxGuests, "invité", "invités")}. Vos fichiers restent sur votre ordinateur : le serveur ne les enregistre pas.`));
  }
  /* --- while sharing --- */
  sessionView() {
    const s = this.session;
    const max = s.limits?.maxGuests ?? this.config.maxGuests;
    const guests = s.peers.filter((x) => x.id !== "h").length;
    const free = Math.max(0, max - guests);
    const wrap = el("div", { class: "cb-session" });
    const status = s.status === "reconnecting" ? ["warn", "Reconnexion…"] : ["ok", "En ligne"];
    wrap.append(el("div", { class: "cb-head" },
      el("div", {}, el("h2", { class: "cb-h" }, s.isHost ? "Votre session" : `Session de ${s.peer("h")?.name ?? "l’hôte"}`), el("p", { class: "cb-sub" }, this.config.projectName?.() ?? "Projet partagé")),
      el("span", { class: `cb-pill ${status[0]}` }, status[1])));
    if (s.isHost) {
      const url = s.inviteUrl();
      const field = el("input", { class: "cb-input cb-url", readonly: true, value: url, "aria-label": "Lien d’invitation", onfocus: (e) => e.target.select() });
      const copy = el("button", { class: "btn pri cb-wide", type: "button", html: svg("link") + "<span>Copier le lien d’invitation</span>" });
      copy.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(url); } catch { field.select(); document.execCommand?.("copy"); }
        const label = copy.querySelector("span");
        label.textContent = "Lien copié";
        copy.classList.add("done");
        this.announce("Lien d’invitation copié");
        setTimeout(() => { if (copy.isConnected) { label.textContent = "Copier le lien d’invitation"; copy.classList.remove("done"); } }, 1800);
      });
      const lock = el("label", { class: "cb-check" }, el("input", { type: "checkbox", checked: s.locked, onchange: (e) => this.cb.onLock(e.target.checked) }), el("span", {}, "Bloquer les nouvelles arrivées"));
      wrap.append(el("section", { class: "cb-sec" },
        el("p", { class: "cb-label" }, "Inviter"),
        field, copy,
        el("p", { class: "cb-hint" }, s.locked ? "Les nouvelles personnes sont refusées pour le moment." : `Toute personne ayant ce lien peut rejoindre : ${free > 0 ? plural(free, "place libre", "places libres") : "session complète"}.`),
        lock));
      wrap.append(el("section", { class: "cb-sec" },
        el("p", { class: "cb-label" }, "Aperçu HTTP des invités"),
        el("label", { class: "cb-check" },
          el("input", { type: "checkbox", checked: !!this.cb.getPreviewPermission?.(),
            onchange: e => this.cb.onPreviewPermission?.(e.target.checked) }),
          el("span", {}, "Autoriser le PHP interactif pour les invités")),
        el("p", { class: "cb-hint" }, "Les invités pourront soumettre des formulaires et modifier la base via PHP, même sans modifier les fichiers. Désactivé par défaut.")));

    }
    const list = el("ul", { class: "cb-list" });
    const following = this.cb.getFollowing?.();
    const ordered = [...s.peers].sort((a, b) => (a.id === s.me?.id ? -1 : b.id === s.me?.id ? 1 : a.id === "h" ? -1 : b.id === "h" ? 1 : 0));
    for (const peer of ordered) {
      const link = s.links.get(peer.id);
      const me = peer.id === s.me?.id;
      const role = peer.id === "h" ? "Hôte" : "Invité";
      let status;
      if (peer.state === "away") status = `Connexion perdue · place gardée ${secondsLeft(peer.awayUntil)} s`;
      else if (me) status = `Vous · ${role.toLowerCase()}`;
      else if (!link) status = `${role} · connexion…`;
      else status = `${role} · ${link.mode === "p2p" ? "connexion directe" : "via le serveur (plus lent)"}`;
      const row = el("li", { class: "cb-row" + (peer.state === "away" ? " away" : "") }, avatar(peer, { me }), el("span", { class: "cb-who" }, el("b", {}, peer.name), el("small", {}, status)));
      const actions = el("span", { class: "cb-acts" });
      if (!me && peer.state === "online") {
        actions.append(
          el("button", { class: "cb-act", type: "button", title: "Afficher une fois ce que cette personne regarde", onclick: () => { this.cb.onFollow(peer.id); this.toggle(false); } }, "Aller voir"),
          el("button", { class: "cb-act" + (following === peer.id ? " on" : ""), type: "button", "aria-pressed": String(following === peer.id), title: "Rester sur son écran, où qu’elle aille", onclick: () => this.cb.onFollowToggle?.(peer.id) }, following === peer.id ? "Suivie" : "Suivre"));
      }
      if (s.isHost && !me) actions.append(el("button", { class: "cb-act danger", type: "button", "aria-label": `Retirer ${peer.name} de la session`, title: "Retirer de la session", onclick: () => this.cb.onKick(peer.id) }, "Retirer"));
      row.append(actions);
      list.append(row);
    }
    wrap.append(el("section", { class: "cb-sec" }, el("p", { class: "cb-label" }, `Participants · ${s.peers.length}`), list));
    wrap.append(el("button", { class: "btn cb-wide cb-leave", type: "button", onclick: () => this.cb.onLeave() }, s.isHost ? "Arrêter le partage" : "Quitter la session"));
    if (s.isHost) wrap.append(el("p", { class: "cb-foot" }, "Arrêter le partage déconnecte tout le monde. Vos fichiers ne sont pas modifiés."));
    return wrap;
  }
  /* --- guest join dialog (from ?collab=CODE) --- */
  askJoin(room, { error } = {}) {
    return new Promise((resolve) => {
      const input = el("input", { id: "cbJoinName", class: "cb-input", value: savedName(), maxlength: "32", autocomplete: "nickname", placeholder: "Par exemple : Camille", "aria-describedby": "cbJoinHint" });
      const err = el("p", { class: "cb-err", role: "alert", hidden: !error }, error ?? "");
      const go = el("button", { class: "btn pri", type: "button" }, "Rejoindre le projet");
      const cancel = el("button", { class: "btn", type: "button" }, "Annuler");
      const dlg = el("div", { class: "cb-modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "cbJoinTitle" },
        el("div", { class: "cb-card" },
          el("div", { class: "cb-card-icon", html: svg("users") }),
          el("h2", { class: "cb-h", id: "cbJoinTitle" }, "Vous êtes invité à travailler à plusieurs"),
          el("p", { class: "cb-p" }, "Vous allez voir le projet de la personne qui vous a invité, et le modifier en même temps qu’elle."),
          el("label", { class: "cb-l", for: "cbJoinName" }, "Votre nom"), input,
          el("p", { class: "cb-hint", id: "cbJoinHint" }, "Les autres le verront à côté de votre curseur."),
          err,
          el("div", { class: "cb-actions" }, cancel, go)));
      const done = (v) => { dlg.remove(); resolve(v); };
      const run = () => { const n = input.value.replace(/\s+/g, " ").trim(); if (!n) { err.textContent = "Indiquez votre nom pour continuer."; err.hidden = false; return input.focus(); } saveName(n); done(n); };
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
    full: "Cette session est complète. Demandez à l’hôte de libérer une place.",
    locked: "L’hôte a fermé l’accès à la session.",
    "no-room": "Cette session n’existe plus ou le lien est incorrect.",
    "host-timeout": "L’hôte ne s’est pas reconnecté à temps : la session est terminée.",
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
