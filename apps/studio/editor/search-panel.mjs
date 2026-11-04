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
const searchIcon = (name) => {
  const paths = {
    expand: "m9 5 7 7-7 7",
    collapse: "m5 9 7 7 7-7",
    previous: "M12 20V4m-7 7 7-7 7 7",
    next: "M12 4v16m-7-7 7 7 7-7",
    close: "m6 6 12 12M6 18 18 6",
    replace: "M4 5h10a4 4 0 0 1 0 8H6m4-4-4 4 4 4M4 20h16",
    all: "M4 5h10a4 4 0 0 1 0 8H6m4-4-4 4 4 4M4 20h6m4 0h6",
  };
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
};
/** A fixed, compact search panel using CodeMirror's matching/replacement engine. */
export const editorSearch = search({
  top: true,
  createPanel(view) {
    const dom = document.createElement("div");
    dom.className = "cm-search alwis-search";
    dom.setAttribute("role", "search");
    dom.setAttribute("aria-label", "Rechercher dans le fichier");
    dom.innerHTML = `<div class="search-row"><button type="button" data-toggle title="Afficher le remplacement" aria-label="Afficher le remplacement" aria-expanded="false">${searchIcon("expand")}</button><input name="search" main-field placeholder="Rechercher" aria-label="Rechercher"><button type="button" data-option="caseSensitive" title="Respecter la casse" aria-label="Respecter la casse" aria-pressed="false">Aa</button><button type="button" data-option="wholeWord" title="Mot entier" aria-label="Mot entier" aria-pressed="false">ab</button><button type="button" data-option="regexp" title="Expression régulière" aria-label="Expression régulière" aria-pressed="false">.*</button><button type="button" data-command="previous" title="Occurrence précédente (Maj Entrée)" aria-label="Occurrence précédente">${searchIcon("previous")}</button><button type="button" data-command="next" title="Occurrence suivante (Entrée)" aria-label="Occurrence suivante">${searchIcon("next")}</button><button type="button" data-command="close" title="Fermer (Échap)" aria-label="Fermer la recherche">${searchIcon("close")}</button></div><div class="search-row replace-row" hidden><input name="replace" placeholder="Remplacer" aria-label="Remplacer"><button type="button" data-command="replace" title="Remplacer l’occurrence" aria-label="Remplacer l’occurrence">${searchIcon("replace")}</button><button type="button" data-command="all" title="Tout remplacer" aria-label="Tout remplacer">${searchIcon("all")}</button></div><span class="search-count" role="status"></span>`;
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
    const matchActions = (available) => {
      dom.querySelectorAll("[data-command]").forEach((button) => {
        if (button.dataset.command !== "close")
          button.disabled =
            !available ||
            (view.state.readOnly &&
              ["replace", "all"].includes(button.dataset.command));
      });
    };
    const report = () => {
      input.setAttribute(
        "aria-invalid",
        String(!!query.search && !query.valid),
      );
      if (!query.valid) {
        matchActions(false);
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
      matchActions(n > 0);
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
        b.innerHTML = searchIcon(expanded ? "collapse" : "expand");
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
