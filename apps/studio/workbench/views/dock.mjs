/** Panneau Serveur : requêtes (journal d'accès), journal d'événements, ressources. */
import { $, $$, esc, plural, toast } from "../ui.mjs";
import { S, A, ctx, eng, sessionOf } from "../state.mjs";

export function drawDock() {
  const d = $("#dock"),
    k = S.dock;
  d.classList.toggle("on", !!k && S.mode === "work");
  if (!k) return;
  $$("#dock [role=tab]").forEach((b) => {
    b.setAttribute("aria-selected", b.dataset.arg === k);
  });
  $("#lvl").hidden = k !== "log";
  const B = $("#dockB");
  if (k === "req")
    B.innerHTML = S.reqs.length
      ? [...S.reqs]
          .reverse()
          .map((r) => {
            const s = r.session ? sessionOf(r.session) : null;
            return `<div class="req"><span class="mut num">${r.t}</span><span class="sw" ${s ? `style="background:${s.hue}" title="${esc(s.label)}"` : 'style="background:var(--off)"'}></span><span>${esc(r.method)}</span><span class="st2 s${String(r.status)[0]} num">${r.status}</span><span class="trunc">${esc(r.path)}</span><span class="num mut" style="text-align:right">${r.ms} ms</span></div>`;
          })
          .join("")
      : '<div class="empty"><b>Aucune requête</b><span>Chaque page, image ou script servi par PHP apparaît ici, comme dans un journal d’accès, avec la session qui l’a demandé.</span></div>';
  else if (k === "log") {
    const L = S.logs
      .map((l, i) => ({ ...l, i }))
      .filter((l) => !S.lvl || l.l === S.lvl)
      .reverse();
    B.innerHTML = L.length
      ? L.map(
          (l) =>
            `<button class="log" data-act="logOpen" data-arg="${l.i}" ${l.detail ? "" : 'style="cursor:default"'} aria-expanded="${S.openLog.has(l.i)}"><span class="mut num">${l.t}</span><span class="${l.l}">${{ e: "Erreur", w: "Avertissement", i: "Info" }[l.l]}</span><span>${esc(l.msg)}${l.detail ? ' <span class="mut">▾</span>' : ""}</span></button>${S.openLog.has(l.i) && l.detail ? `<div class="log-d">${esc(l.detail)}</div>` : ""}`,
        ).join("")
      : '<div class="empty"><b>Journal vide</b><span>Les erreurs PHP et SQL s’afficheront ici avec leur piste de récupération. 200 événements conservés dans cet onglet.</span></div>';
  } else {
    const m = eng().memory();
    if (!m) {
      B.innerHTML =
        '<div class="empty"><b>Mesure indisponible</b><span>Ce moteur n’expose pas encore la mémoire au studio.</span></div>';
      return;
    }
    B.innerHTML = `<div class="resource-tools"><button class="btn" data-act="measure">Actualiser les mesures</button>${[
      ["editor", "Éditeur"],
      ["sql", "Console SQL"],
    ]
      .map(
        ([key, label]) =>
          `<label>${label}<select class="in" data-resource="${key}" aria-label="État ${label}">${[
            ["active", "Actif"],
            ["sleep", "En veille"],
            ["unloaded", "Déchargé"],
          ]
            .map(
              ([value, text]) =>
                `<option value="${value}" ${(S.toolModes?.[key] ?? "active") === value ? "selected" : ""}>${text}</option>`,
            )
            .join("")}</select></label>`,
      )
      .join(
        "",
      )}</div><div class="meter"><div><span>Tas C occupé</span><span class="num">${m.heap.toFixed(0)} / ${m.cap} Mio</span></div><div class="mbar"><i style="width:${(m.heap / m.cap) * 100}%"></i></div></div><div class="meter"><div><span>Fichiers du projet</span><span class="num">${(m.vfs / 1024).toFixed(0)} Kio</span></div><div class="mbar"><i style="width:${Math.min(100, m.vfs / 1024 / 80)}%"></i></div></div><div class="meter"><div><span>MariaDB</span><span>${eng().db.ready ? "Active" : "Non initialisée (démarre à la demande)"}</span></div></div><p class="hint" style="margin:6px 14px;max-width:62ch">La capacité WASM n’est pas la mémoire totale du navigateur. Le déchargement arrête les services de l’outil et conserve les brouillons. Les gains de RAM du navigateur restent à mesurer.</p>`;
  }
}
Object.assign(A, {
  dockToggle() {
    S.dock ? A.dockClose() : A.dockTab("req");
  },
  dockClose() {
    S.dock = null;
    ctx.draw();
  },
  dockTab(t) {
    S.dock = t;
    S.dockTab = t;
    ctx.draw();
  },
  logClear() {
    if (S.dock === "req") S.reqs.length = 0;
    else S.logs.length = 0;
    drawDock();
    ctx.shell();
  },
  logExport() {
    try {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(
        new Blob(
          [JSON.stringify({ requests: S.reqs, journal: S.logs }, null, 1)],
          { type: "application/json" },
        ),
      );
      a.download = "journal.json";
      a.click();
    } catch {
      /* indisponible */
    }
    toast("Journal exporté en JSON (sans corps de requête ni cookies)");
  },
  logOpen(i) {
    S.openLog.has(+i) ? S.openLog.delete(+i) : S.openLog.add(+i);
    drawDock();
  },
});
export function bindDock() {
  $("#dock").addEventListener("change", (e) => {
    if (e.target.dataset.resource)
      A.toolState(e.target.dataset.resource, e.target.value).catch((error) => {
        S.alert = { title: "Ressources", msg: error.message };
        ctx.draw();
      });
  });
  $("#lvl").addEventListener("change", (e) => {
    S.lvl = e.target.value;
    drawDock();
  });
  let gd = null,
    g = $("#grip");
  g.addEventListener("pointerdown", (e) => {
    gd = { y: e.clientY, h: $("#dock").offsetHeight };
    g.setPointerCapture?.(e.pointerId);
  });
  g.addEventListener("pointermove", (e) => {
    if (gd)
      $("#dock").style.setProperty(
        "--dh",
        Math.max(120, Math.min(innerHeight * 0.7, gd.h + gd.y - e.clientY)) +
          "px",
      );
  });
  g.addEventListener("pointerup", () => (gd = null));
}
