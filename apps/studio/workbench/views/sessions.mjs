/** Espace Sessions : une carte par identité (cookies, fenêtres, activité). L'ouverture se fait aussi depuis l'éditeur. */
import { $, esc, plural, toast, confirmDlg } from "../ui.mjs";
import { S, A, ctx, eng, log, sessions, sessionOf } from "../state.mjs";
import { ui } from "../icons.mjs";

export function drawSessions() {
  S.wins = S.wins.filter((w) => w.popup && !w.popup.closed);
  const list = sessions(),
    caps = eng().caps || {};
  $("#sesGrid").innerHTML = list
    .map((s) => {
      const wins = S.wins.filter((w) => w.session === s.id),
        reqs = S.reqs
          .filter((r) => r.session === s.id)
          .slice(-4)
          .reverse(),
        inPv = S.pvSessions.includes(s.id);
      return `<article class="scard" style="--sc:${s.hue}" data-id="${esc(s.id)}"><header><span class="sw big"></span><input class="in lab" value="${esc(s.label)}" data-act-change="sesRename" data-arg="${esc(s.id)}" aria-label="Nom de la session" spellcheck="false"><span class="mono mut" title="Identifiant de session">${esc(s.short || s.id.slice(0, 8))}</span></header>
      <section><h2 class="session-heading">Cookies <span class="mut num">${s.cookies.length}${s.hidden ? ` + ${s.hidden} masqué` : ""}</span></h2>
        <table class="ck2"><tbody>${s.cookies.map((c) => `<tr><td class="mono">${esc(c.name)}</td><td><input class="in" value="${esc(c.value)}" data-act-change="cookieSet" data-arg="${esc(s.id)}|${esc(c.name)}" aria-label="Valeur de ${esc(c.name)}" spellcheck="false"></td><td class="ra"><button data-act="cookieDel" data-arg="${esc(s.id)}|${esc(c.name)}" aria-label="Supprimer ${esc(c.name)}">${ui.trash}</button></td></tr>`).join("") || '<tr><td colspan="3" class="mut">Aucun cookie visible.</td></tr>'}
        <tr class="addrow"><td><input class="in" data-nc="${esc(s.id)}" data-f="n" placeholder="nom" aria-label="Nom du cookie" spellcheck="false"></td><td><input class="in" data-nc="${esc(s.id)}" data-f="v" placeholder="valeur" aria-label="Valeur du cookie" spellcheck="false"></td><td class="ra"><button class="btn sm" aria-label="Ajouter un cookie" data-act="cookieAdd" data-arg="${esc(s.id)}">${ui.plus}</button></td></tr></tbody></table>
        <button class="btn quiet sm" data-act="sesClear" data-arg="${esc(s.id)}" style="margin-top:6px">Vider les cookies (déconnecter)</button></section>
      <section><h2 class="session-heading">Fenêtres <span class="mut num">${wins.length}</span></h2>${wins.map((w) => `<div class="winrow"><span class="mono grow trunc">${esc(w.path)}</span><button class="btn quiet sm" data-act="closeWin" data-arg="${w.id}">Fermer</button></div>`).join("") || '<p class="hint">Aucune fenêtre ouverte.</p>'}
        <div class="openrow"><input class="in" data-wp="${esc(s.id)}" value="${esc(S.pvPath)}" aria-label="Page à ouvrir" spellcheck="false"><button class="btn pri sm" data-act="sesOpen" data-arg="${esc(s.id)}">Ouvrir</button></div></section>
      <section><h2 class="session-heading">Dernières requêtes</h2>${reqs.map((r) => `<div class="req2"><span class="st2 s${String(r.status)[0]} num">${r.status}</span><span class="mono trunc grow">${esc(r.path)}</span><span class="num mut">${r.ms} ms</span></div>`).join("") || '<p class="hint">Rien encore pour cette session.</p>'}</section>
      <footer><button class="btn sm" data-act="sesPreview" data-arg="${esc(s.id)}" aria-pressed="${inPv}">${inPv ? "Dans l’aperçu" : "Afficher dans l’aperçu"}</button>${caps.removeSession && list.length > 1 ? `<button class="btn quiet sm bad" data-act="sesRemove" data-arg="${esc(s.id)}">Supprimer</button>` : ""}</footer></article>`;
    })
    .join("");
}
Object.assign(A, {
  async newIdent() {
    const id = await eng().sessions.create();
    log("i", "Session créée");
    ctx.draw();
    toast("Nouvelle session : cookies et session PHP distincts");
    return id;
  },
  async sesRename(id, el) {
    const v = el.value.trim();
    if (!v) {
      el.value = sessionOf(id).label;
      return;
    }
    await eng().sessions.rename(id, v);
    ctx.draw();
  },
  async cookieSet(arg, el) {
    const [id, name] = arg.split("|");
    await eng().sessions.setCookie(id, name, el.value);
    log("i", `Cookie ${name} modifié (${sessionOf(id).label})`);
    toast("Cookie modifié");
  },
  async cookieDel(arg) {
    const [id, name] = arg.split("|");
    await eng().sessions.deleteCookie(id, name);
    ctx.draw();
  },
  async cookieAdd(id) {
    const n = $(`[data-nc="${CSS.escape(id)}"][data-f=n]`).value.trim(),
      v = $(`[data-nc="${CSS.escape(id)}"][data-f=v]`).value;
    if (!/^[\w!#$%&'*+.^`|~-]+$/.test(n))
      return toast("Nom de cookie invalide.");
    await eng().sessions.setCookie(id, n, v);
    ctx.draw();
  },
  async sesClear(id) {
    if (
      await confirmDlg(
        "Vider les cookies ?",
        `La session « ${esc(sessionOf(id).label)} » sera déconnectée : nouvel identifiant PHP, données de session perdues.`,
        "Vider",
        1,
      )
    ) {
      await eng().sessions.clearCookies(id);
      log("w", "Cookies vidés : " + sessionOf(id).label);
      ctx.draw();
    }
  },
  sesOpen(id) {
    const p = $(`[data-wp="${CSS.escape(id)}"]`).value || "/index.php";
    A.openWindow(id, p.startsWith("/") ? p : "/" + p);
  },
  sesPreview(id) {
    S.pvSessions[0] = id;
    S.pv = true;
    S.view = "code";
    ctx.draw();
    A.pvReload();
  },
  async sesRemove(id) {
    await eng().sessions.remove(id);
    S.pvSessions = S.pvSessions.filter((x) => x !== id);
    if (!S.pvSessions.length) S.pvSessions = [sessions()[0].id];
    S.wins = S.wins.filter((w) => w.session !== id);
    ctx.draw();
  },
  async compare() {
    if (!S.pvDouble) await A.pvDoubleToggle();
    else {
      S.pv = true;
    }
    S.view = "code";
    ctx.draw();
    A.pvReload();
  },
});
