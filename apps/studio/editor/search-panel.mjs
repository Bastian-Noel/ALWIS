import {
  search,
  SearchQuery,
  getSearchQuery,
  setSearchQuery,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll,
  closeSearchPanel,
} from "@codemirror/search";
/** A fixed, compact search panel using CodeMirror's matching/replacement engine. */
export const editorSearch = search({
  top: true,
  createPanel(view) {
    const dom = document.createElement("div");
    dom.className = "cm-search alwis-search";
    dom.setAttribute("role", "search");
    dom.setAttribute("aria-label", "Rechercher dans le fichier");
    dom.innerHTML = `<div class="search-row"><button type="button" data-toggle title="Afficher le remplacement" aria-label="Afficher le remplacement" aria-expanded="false">›</button><input name="search" main-field placeholder="Rechercher" aria-label="Rechercher"><button type="button" data-option="caseSensitive" title="Respecter la casse" aria-label="Respecter la casse" aria-pressed="false">Aa</button><button type="button" data-option="wholeWord" title="Mot entier" aria-label="Mot entier" aria-pressed="false">ab</button><button type="button" data-option="regexp" title="Expression régulière" aria-label="Expression régulière" aria-pressed="false">.*</button><button type="button" data-command="previous" title="Occurrence précédente (Maj Entrée)" aria-label="Occurrence précédente">↑</button><button type="button" data-command="next" title="Occurrence suivante (Entrée)" aria-label="Occurrence suivante">↓</button><button type="button" data-command="close" title="Fermer (Échap)" aria-label="Fermer la recherche">×</button></div><div class="search-row replace-row" hidden><input name="replace" placeholder="Remplacer" aria-label="Remplacer"><button type="button" data-command="replace" title="Remplacer l’occurrence" aria-label="Remplacer l’occurrence">↦</button><button type="button" data-command="all" title="Tout remplacer" aria-label="Tout remplacer">⇉</button></div><span class="search-count" role="status"></span>`;
    const input = dom.querySelector("[name=search]"),
      replacement = dom.querySelector("[name=replace]"),
      count = dom.querySelector(".search-count");
    let query = getSearchQuery(view.state);
    const sync = () => {
      input.value = query.search;
      replacement.value = query.replace;
      dom
        .querySelectorAll("[data-option]")
        .forEach((b) =>
          b.setAttribute("aria-pressed", String(query[b.dataset.option])),
        );
    };
    const report = () => {
      input.setAttribute(
        "aria-invalid",
        String(!!query.search && !query.valid),
      );
      if (!query.valid) {
        count.textContent = query.search ? "Expression régulière invalide" : "";
        return;
      }
      const cursor = query.getCursor(view.state);
      let n = 0,
        current = 0,
        item;
      while (!(item = cursor.next()).done && n < 10000) {
        n++;
        if (item.value.from === view.state.selection.main.from) current = n;
      }
      count.textContent = n
        ? `${current ? current + " / " : ""}${n}${n === 10000 ? "+" : ""} résultat${n > 1 ? "s" : ""}`
        : "Aucun résultat";
    };
    const commit = () => {
      query = new SearchQuery({
        search: input.value,
        replace: replacement.value,
        literal: true,
        ...Object.fromEntries(
          [...dom.querySelectorAll("[data-option]")].map((b) => [
            b.dataset.option,
            b.getAttribute("aria-pressed") === "true",
          ]),
        ),
      });
      view.dispatch({ effects: setSearchQuery.of(query) });
    };
    dom.addEventListener("input", commit);
    const commands = {
      previous: findPrevious,
      next: findNext,
      replace: replaceNext,
      all: replaceAll,
      close: closeSearchPanel,
    };
    dom.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.hasAttribute("data-toggle")) {
        const expanded = b.getAttribute("aria-expanded") !== "true";
        b.setAttribute("aria-expanded", String(expanded));
        b.textContent = expanded ? "⌄" : "›";
        dom.querySelector(".replace-row").hidden = !expanded;
        view.requestMeasure();
      } else if (b.dataset.option) {
        b.setAttribute(
          "aria-pressed",
          String(b.getAttribute("aria-pressed") !== "true"),
        );
        commit();
      } else if (commands[b.dataset.command]) {
        commands[b.dataset.command](view);
        if (b.dataset.command === "close") view.focus();
      }
    });
    dom.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeSearchPanel(view);
        view.focus();
      } else if (e.key === "Enter") {
        e.preventDefault();
        commit();
        (e.shiftKey ? findPrevious : findNext)(view);
      }
    });
    sync();
    report();
    return {
      dom,
      top: true,
      update(update) {
        const next = getSearchQuery(update.state);
        if (!query.eq(next)) {
          query = next;
          sync();
        }
        if (
          update.docChanged ||
          update.selectionSet ||
          update.transactions.some((t) => t.effects.length)
        )
          report();
      },
      mount() {
        input.select();
      },
    };
  },
});
