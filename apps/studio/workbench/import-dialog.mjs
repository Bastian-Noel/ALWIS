import { storageBudget } from "/packages/runtime/src/project-disk.mjs";
import { modal, esc, toast } from "./ui.mjs";
import {
  exclusion,
  defaultSelection,
  importSummary,
  fitSelection,
  IMPORT_LIMITS,
} from "./import-plan.mjs";
const size = (bytes) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(
    bytes / 1048576,
  ) + " Mio";
export async function chooseImport(
  records,
  {
    title = "Préparer l’import",
    source = "Les fichiers d’origine restent inchangés.",
    selection,
  } = {},
) {
  const entries = records.map((e) => {
    // Backup metadata is not source code and must remain complete for restoration.
    const backup = e.path.startsWith("/.pbl-backup/");
    const rule = backup ? null : exclusion(e.path);
    return {
      ...e,
      backup,
      locked: !!rule?.locked || !!e.locked,
      recommended: !!rule && !rule.locked && !e.includeRecommended,
      group: rule?.group ?? "files",
      reason: e.reason ?? rule?.reason ?? "",
    };
  });
  const defaults = defaultSelection(entries);
  const selected = selection
    ? new Set(
        entries
          .filter(
            (e) =>
              selection.has(e.path) ||
              (e.includeRecommended && defaults.has(e.path)),
          )
          .map((e) => e.path),
      )
    : defaults;
  const groups = new Map();
  for (const entry of entries) {
    const key = entry.group;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  let page = 0,
    filter = "";
  const perPage = 80;
  const result = await modal({
    title,
    wide: true,
    body: `<div class="import-picker"><p>${esc(source)}</p><p class="hint">Aucun contenu n’est chargé avant validation. Gardez les fichiers utiles ; retirez dépendances, archives ou médias pour rester sous 2 Gio et 10 000 fichiers (512 Mio par fichier sur disque).</p><p class="hint">Composer utilise généralement vendor/autoload.php : incluez vendor si votre projet en a besoin et s’il tient dans les limites. Les fichiers exclus d’un dossier restent sur votre PC.</p><p id="importSpace" class="hint" role="status"></p><div id="importGroups"></div><label>Filtrer les chemins<input id="importFilter" class="in" type="search" placeholder="Ex. : .zip, images, vendor…"></label><div class="import-picker-actions"><button class="btn" type="button" id="importNone">Ne rien sélectionner</button><button class="btn" type="button" id="importRecommended">Sélection recommandée</button><button class="btn" type="button" id="importFit">Adapter aux limites</button><button class="btn" type="button" id="importToggle">Inverser les résultats du filtre</button></div><p id="importBudget" role="status" aria-live="polite"></p><div id="importFiles" class="import-file-list"></div><div class="import-picker-actions"><button id="importPrev" class="btn" type="button">Précédent</button><span id="importPage"></span><button id="importNext" class="btn" type="button">Suivant</button></div><p id="importIssue" role="alert"></p></div>`,
    actions: [
      { label: "Annuler", v: "no" },
      { label: "Ouvrir la sélection", v: "open", kind: "pri" },
    ],
    async beforeClose(value, d) {
      if (value === "open") {
        const summary = importSummary(entries, selected);
        if (!summary.valid) return false;
        try {
          const info = await storageBudget(summary.bytes);
          d.querySelector("#importSpace").textContent =
            "Stockage libre : " + size(info.free);
          if (navigator.storage.persist && !info.persistent) {
            navigator.storage
              .persist()
              .then((granted) => {
                if (!granted)
                  toast(
                    "Stockage persistant non accordé : exportez régulièrement vos projets en ZIP.",
                    null,
                    { duration: 12000 },
                  );
              })
              .catch(() => {});
          }
          return true;
        } catch (error) {
          d.querySelector("#importIssue").textContent = error.message;
          return false;
        }
      }
      return true;
    },
    onOpen(d) {
      const $ = (s) => d.querySelector(s);
      const selectable = (e) =>
        !e.locked &&
        !e.backup &&
        e.size <= IMPORT_LIMITS.file &&
        e.path.replace(/^\//, "").split("/").length <= 13;
      function draw() {
        const summary = importSummary(entries, selected);
        $("#importBudget").textContent =
          `${summary.count} fichier(s) retenu(s)${summary.directories ? ` + ${summary.directories} dossier(s) à analyser` : ""} · ${size(summary.bytes)} — ${entries.length - summary.count} écarté(s)`;
        $("#importIssue").textContent =
          summary.issues.join(" ") ||
          (!summary.count && !summary.directories
            ? "Sélectionnez au moins un fichier."
            : "");
        d.querySelector("[data-v=open]").disabled = !summary.valid;
        d.querySelector("[data-v=open]").textContent = summary.directories
          ? "Analyser les dossiers choisis"
          : "Ouvrir la sélection";
        $("#importGroups").innerHTML = [...groups]
          .filter(([key]) => key !== "files")
          .map(([key, list], i) => {
            const allowed = list.filter(selectable),
              kept = allowed.filter((e) => selected.has(e.path)).length;
            return `<label class="import-group"><input type="checkbox" data-group="${i}" ${kept && kept === allowed.length ? "checked" : ""} ${allowed.length ? "" : "disabled"}><span>${esc(key === "archives" ? "Archives et sauvegardes" : key === "hidden" ? "Fichiers cachés" : key)} — ${list.length} fichier(s)<small>${esc(list[0].reason)}</small></span></label>`;
          })
          .join("");
        const visible = entries.filter((e) =>
          e.path.toLowerCase().includes(filter),
        );
        page = Math.min(
          page,
          Math.max(0, Math.ceil(visible.length / perPage) - 1),
        );
        $("#importFiles").innerHTML = visible
          .slice(page * perPage, (page + 1) * perPage)
          .map(
            (e) =>
              `<label class="import-file"><input type="checkbox" data-path="${esc(e.path)}" ${selected.has(e.path) ? "checked" : ""} ${selectable(e) ? "" : "disabled"}><span>${esc(e.path)}<small>${e.directory ? "Dossier non parcouru : cochez-le pour analyser son contenu" : e.backup ? "Sauvegarde SQL : conservée intégralement" : e.locked ? e.reason || "Données réservées, exclues" : e.size > IMPORT_LIMITS.file ? "Trop lourd : exclu (512 Mio maximum)" : e.path.split("/").length > 14 ? "Chemin trop profond" : esc(e.reason)}</small></span><span>${e.directory ? "À analyser" : size(e.size)}</span></label>`,
          )
          .join("");
        $("#importPage").textContent =
          `Page ${page + 1} / ${Math.max(1, Math.ceil(visible.length / perPage))}`;
        $("#importPrev").disabled = page === 0;
        $("#importNext").disabled = (page + 1) * perPage >= visible.length;
      }
      $("#importFilter").onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
        }
      };
      $("#importFilter").oninput = (e) => {
        filter = e.target.value.toLowerCase();
        page = 0;
        draw();
      };
      $("#importPrev").onclick = () => {
        page--;
        draw();
      };
      $("#importNext").onclick = () => {
        page++;
        draw();
      };
      $("#importNone").onclick = () => {
        for (const e of entries) if (!e.backup) selected.delete(e.path);
        draw();
      };
      $("#importRecommended").onclick = () => {
        selected.clear();
        for (const p of defaultSelection(entries)) selected.add(p);
        draw();
      };
      $("#importFit").onclick = () => {
        const fitted = fitSelection(entries, selected);
        selected.clear();
        for (const p of fitted) selected.add(p);
        draw();
      };
      $("#importToggle").onclick = () => {
        for (const e of entries)
          if (selectable(e) && e.path.toLowerCase().includes(filter)) {
            if (selected.has(e.path)) selected.delete(e.path);
            else selected.add(e.path);
          }
        draw();
      };
      $("#importFiles").onchange = (e) => {
        const path = e.target.dataset.path;
        if (path) {
          if (e.target.checked) selected.add(path);
          else selected.delete(path);
          draw();
        }
      };
      const groupList = [...groups].filter(([key]) => key !== "files");
      $("#importGroups").onchange = (e) => {
        const index = e.target.dataset.group;
        if (index === undefined) return;
        for (const row of groupList[Number(index)][1].filter(selectable)) {
          if (e.target.checked) selected.add(row.path);
          else selected.delete(row.path);
        }
        draw();
      };
      draw();
    },
  });
  if (result !== "open") throw new DOMException("Import annulé.", "AbortError");
  return selected;
}
