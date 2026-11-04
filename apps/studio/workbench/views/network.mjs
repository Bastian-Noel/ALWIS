import { $, esc } from "../ui.mjs";
import { A, S, ctx, sessionOf } from "../state.mjs";
import { icon } from "../icons.mjs";
let scheduled = false;
const bytes = (n) => (n < 1024 ? `${n} o` : `${(n / 1024).toFixed(1)} Kio`);
const pairs = (items) =>
  items?.length
    ? `<dl class="network-pairs">${items.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`
    : '<p class="hint">Aucun en-tête.</p>';
const body = (data) =>
  !data || !data.bytes
    ? '<p class="hint">Corps vide.</p>'
    : data.text === null
      ? `<p class="hint">Contenu binaire · ${esc(data.type || "type inconnu")} · ${bytes(data.bytes)}</p>`
      : `${data.truncated ? '<p class="hint">Affichage limité aux 32 premiers Kio.</p>' : ""}<pre class="network-response">${esc(data.text)}</pre>`;
export function drawNetwork() {
  $("#networkPanel").hidden = !S.networkOpen;
  $("#networkResize").hidden = !S.networkOpen;
  $("#pvNetwork").setAttribute("aria-expanded", !!S.networkOpen);
  const toggleLabel = S.networkOpen
    ? "Masquer le panneau Réseau"
    : "Afficher le panneau Réseau";
  $("#pvNetwork").title = toggleLabel;
  $("#pvNetwork").setAttribute("aria-label", toggleLabel);
  if (!S.networkOpen) return;
  const root = $("#networkBody");
  const selected = S.reqs.find((r) => r.id === S.networkSelected);
  if (!selected) S.networkSelected = null;
  const focus = root.contains(document.activeElement)
    ? {
        act: document.activeElement.dataset.act,
        arg: document.activeElement.dataset.arg,
      }
    : null;
  const scroll = root.querySelector(".network-list")?.scrollTop ?? 0;
  const detailScroll = root.querySelector("#networkDetail")?.scrollTop ?? 0;
  $("#networkCount").textContent =
    `${S.reqs.length} requête${S.reqs.length === 1 ? "" : "s"} · ${bytes(S.reqs.reduce((n, r) => n + (r.responseBody?.bytes ?? 0), 0))}`;
  root.classList.toggle("has-selection", !!selected);
  const html = `<div class="network-list"><table><thead><tr><th>Nom</th>${selected ? "" : "<th>Chemin</th><th>Méthode</th><th>État</th><th>Durée</th>"}</tr></thead><tbody>${S.reqs.map((r) => `<tr class="${r === selected ? "selected" : ""}"><td><button data-act="networkSelect" data-arg="${esc(r.id)}" title="${esc(r.method + " " + r.path)}" aria-label="Inspecter ${esc(r.method + " " + r.path)}" aria-pressed="${r === selected}"><span class="network-status s${String(r.status)[0]}" aria-hidden="true">●</span>${esc(r.name ?? r.path)}</button></td>${selected ? "" : `<td title="${esc(r.path)}">${esc(r.path)}</td><td>${esc(r.method)}</td><td class="s${String(r.status)[0]}">${r.status}</td><td>${r.ms} ms</td>`}</tr>`).join("")}</tbody></table>${!S.reqs.length ? '<p class="network-empty">Rechargez la page pour observer ses requêtes, images, scripts et appels API.</p>' : ""}</div>${
    selected
      ? `<section class="network-detail" data-key="${selected.id}-${S.networkTab}" aria-label="Détails de la requête"><div class="network-tabs"><button class="browser-btn" data-act="networkDeselect" title="Revenir à la liste complète" aria-label="Revenir à la liste complète">${icon("x")}</button><div role="tablist" aria-label="Détails de la requête">${[
          ["headers", "En-têtes"],
          ["request", "Requête"],
          ["response", "Réponse"],
        ]
          .map(
            ([key, label]) =>
              `<button id="network-tab-${key}" role="tab" data-act="networkTab" data-arg="${key}" aria-controls="networkDetail" aria-selected="${S.networkTab === key}" tabindex="${S.networkTab === key ? 0 : -1}">${label}</button>`,
          )
          .join(
            "",
          )}</div></div><div id="networkDetail" role="tabpanel" tabindex="0" aria-labelledby="network-tab-${S.networkTab}">${
          S.networkTab === "response"
            ? body(selected.responseBody)
            : S.networkTab === "request"
              ? body(selected.requestBody)
              : `<h3>Général</h3>${pairs([
                  ["URL", selected.url],
                  ["Méthode", selected.method],
                  ["État", String(selected.status)],
                  ["Durée", selected.ms + " ms"],
                  ["Type", selected.destination],
                  [
                    "Session",
                    sessionOf(selected.session)?.label ?? selected.session,
                  ],
                ])}<h3>En-têtes de réponse</h3>${pairs(selected.responseHeaders)}<h3>En-têtes de requête</h3>${pairs(selected.requestHeaders)}`
        }</div></section>`
      : ""
  }`;
  // Keep the inspected response DOM stable while other requests arrive.
  if (
    selected &&
    root.querySelector(".network-detail")?.dataset.key ===
      `${selected.id}-${S.networkTab}`
  ) {
    const template = document.createElement("template");
    template.innerHTML = html;
    root
      .querySelector(".network-list")
      .replaceWith(template.content.querySelector(".network-list"));
  } else root.innerHTML = html;
  root.querySelector(".network-list").scrollTop = scroll;
  if (root.querySelector("#networkDetail"))
    root.querySelector("#networkDetail").scrollTop = detailScroll;
  if (focus?.act)
    [...root.querySelectorAll("[data-act]")]
      .find(
        (el) => el.dataset.act === focus.act && el.dataset.arg === focus.arg,
      )
      ?.focus({ preventScroll: true });
}
export function scheduleNetwork() {
  if (scheduled || !S.networkOpen) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    drawNetwork();
  });
}
Object.assign(A, {
  networkToggle() {
    S.networkOpen = !S.networkOpen;
    drawNetwork();
    if (S.networkOpen) $("#networkPanel [data-act=networkClear]").focus();
    else $("#pvNetwork").focus();
  },
  networkSelect(id) {
    S.networkSelected = id;
    drawNetwork();
    $("#network-tab-" + S.networkTab).focus();
  },
  networkDeselect() {
    const id = S.networkSelected;
    S.networkSelected = null;
    drawNetwork();
    [...document.querySelectorAll("[data-act=networkSelect]")]
      .find((el) => el.dataset.arg === id)
      ?.focus();
  },
  networkTab(tab) {
    S.networkTab = tab;
    drawNetwork();
  },
  networkClear() {
    S.reqs = [];
    if (S.dock === "req") ctx.views.dock?.();
    S.networkSelected = null;
    drawNetwork();
  },
});
