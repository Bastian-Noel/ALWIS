import { zipTask } from "./archive-service.mjs";
import { attachDatabaseManager, node, option } from "./database/database-tools.mjs";
import { renderSchemaDesigner } from "./database/schema-designer.mjs";
import { splitSQL, encodeSQLScript } from "./database/sql-script.mjs";
import { createCodeEditor } from "./editor/dist/codemirror.mjs";
import { identifier, literal, editValue, sameValue } from "./database/sql-values.mjs";
import { ProjectHub } from "./project-hub.mjs";
import { readState, writeState } from "./state.mjs";
import { createStudioShell } from "./studio-shell.mjs";
const $ = (selector) => document.querySelector(selector),
  decoder = new TextDecoder();
let hub,
  dirty = false,
  operation = Promise.resolve();
const tools = new Map();
const shell = createStudioShell({
  project: () => hub?.key,
  isDirty: () => dirty,
  refresh: () => action(updateEngine),
  onSelect: (name) => {
    if (["editor", "sql", "schema"].includes(name) && hub)
      action(
        async () => {
          if (!tools.get(name)?.view) {
            await setTool(name, "active");
            const select = document.querySelector(`[data-tool="${name}"]`);
            if (select) select.value = "active";
          }
          const view = tools.get(name)?.view;
          if (name === "sql") await view?.activate?.();
          else if (name === "schema")
            await view?.setDatabase?.(
              tools.get("sql")?.view?.snapshot().database ?? "test",
            );
        },
        { background: true },
      );
  },
});
window.addEventListener("error", (event) =>
  shell.error(event.error ?? Error(event.message), "Interface"),
);
window.addEventListener("unhandledrejection", (event) =>
  shell.error(event.reason, "Interface"),
);
function status(text, error = false) {
  if (error) shell.error(Error(text));
  else shell.status(text);
}
function action(task, { background = false } = {}) {
  const expectedHub = hub;
  const context =
    document.activeElement?.closest("button")?.textContent.trim() ||
    task.name ||
    "Opération";
  operation = operation
    .then(async () => {
      shell.busy(true);
      try {
        if (task !== openProject && hub !== expectedHub)
          throw Error(
            "Le projet a changé. Relancez cette action dans le projet courant.",
          );
        const recovering =
          !background && $("#status").hasAttribute("data-error");
        if (recovering) status("Opération en cours…");
        const value = await task();
        if (recovering && $("#status").textContent === "Opération en cours…")
          status("Opération terminée.");
        shell.record("info", context + " : opération terminée.", {
          context: hub?.key ?? "Studio",
        });
        return value;
      } finally {
        if (hub && !hub.runtime.closed) await updateEngine().catch(() => {});
        shell.busy(false);
        shell.update();
      }
    })
    .catch((error) => shell.error(error, context));
  return operation;
}
const display = (value) =>
  value === null
    ? "NULL"
    : value instanceof Uint8Array
      ? literal(value)
      : String(value);
async function rows(sql, database) {
  return hub.runtime.sql(sql, database);
}
async function files(path = "/workspace", depth = 0) {
  if (depth > 12) throw Error("Arborescence trop profonde");
  const output = [];
  for (const name of await hub.runtime.list(path)) {
    if (
      name === "." ||
      name === ".." ||
      name === ".sessions" ||
      name === ".git" ||
      name.startsWith(".pbl-")
    )
      continue;
    const filename = path + "/" + name;
    const info = await hub.runtime.call("stat", { path: filename });
    if (info.directory) output.push(...(await files(filename, depth + 1)));
    else output.push(filename.slice("/workspace".length));
    if (output.length > 1024) throw Error("Affichage limité à 1 024 fichiers");
  }
  return output;
}
async function renderEditor(container, saved) {
  container.append($("#editor-template").content.cloneNode(true));
  const source = container.querySelector(".source"),
    filename = container.querySelector(".filename"),
    list = container.querySelector(".files"),
    message = container.querySelector(".message");
  const serviceStatus = container.querySelector(".language-status");
  const code = createCodeEditor(source, {
    path: saved?.path ?? "/index.php",
    label: "Code source",
    onNavigate: async ({ path, from }) => {
      if (![...list.options].some((option) => option.value === path)) {
        message.textContent =
          "Le fichier cible n’est plus présent. Actualisez le projet.";
        return;
      }
      list.value = path;
      await list.onchange();
      if (filename.value === path) {
        source.selectionStart = from;
        source.selectionEnd = from;
        code.view.dispatch({ scrollIntoView: true });
        code.view.focus();
      }
    },
    onSave: () => action(write),
    onStatus: (text) => (serviceStatus.textContent = text),
  });
  let base = saved?.base;
  const openFiles = new Set(saved?.openFiles ?? [saved?.path ?? "/index.php"]);
  function drawFileTabs() {
    const tabs = container.querySelector(".file-tabs");
    tabs.replaceChildren(
      ...[...openFiles].map((path) => {
        const wrap = node("div", { class: "file-tab" }),
          tab = node(
            "button",
            { "aria-pressed": String(path === filename.value), title: path },
            (path === filename.value && source.value !== base ? "* " : "") +
              path.split("/").pop(),
          );
        tab.onclick = () => {
          list.value = path;
          list.dispatchEvent(new Event("change"));
        };
        const close = node("button", { "aria-label": "Fermer " + path }, "×");
        close.onclick = () =>
          action(async () => {
            if (path === filename.value) {
              if (snapshot().dirty) {
                if (
                  !confirm(
                    "Écrire le brouillon avant de fermer ce fichier ? Annuler conserve l’onglet.",
                  )
                )
                  return;
                await write();
              }
              await writeState("draft:" + hub.key + ":" + path, snapshot());
            } else {
              const draft = await readState("draft:" + hub.key + ":" + path);
              if (draft?.dirty) {
                if (
                  !confirm(
                    "Écrire " +
                      path +
                      " avant de fermer son onglet ? Annuler conserve l’onglet.",
                  )
                )
                  return;
                await hub.runtime.call("write", {
                  path: "/workspace" + path,
                  data: draft.text,
                  expected: draft.base ?? null,
                });
                await writeState("draft:" + hub.key + ":" + path, {
                  ...draft,
                  base: draft.text,
                  dirty: false,
                });
              }
            }
            openFiles.delete(path);
            if (path === filename.value && openFiles.size) {
              list.value = [...openFiles].at(-1);
              list.dispatchEvent(new Event("change"));
            }
            drawFileTabs();
          });
        wrap.append(tab, close);
        return wrap;
      }),
    );
  }
  const decodeText = (bytes) => {
    if (bytes.byteLength > 1024 * 1024)
      throw Error("Fichier supérieur à 1 Mio : découpez-le avant de l’éditer.");
    if (bytes.includes(0))
      throw Error("Fichier binaire : utilisez l’export pour le télécharger.");
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw Error(
        "Encodage non UTF-8 : convertissez le fichier avant de l’éditer.",
      );
    }
  };
  const validPath = (value) => {
    const normalized = value.startsWith("/") ? value : "/" + value;
    if (
      normalized.length > 512 ||
      normalized
        .split("/")
        .slice(1)
        .some(
          (p) =>
            !p ||
            p === "." ||
            p === ".." ||
            p === ".sessions" ||
            p.startsWith(".pbl-"),
        )
    )
      throw Error(
        "Utilisez un chemin de projet sans segment vide, point ou dossier interne.",
      );
    return normalized;
  };
  filename.value = saved?.path ?? "/index.php";
  source.value = saved?.text ?? "";
  source.selectionStart = saved?.start ?? 0;
  source.selectionEnd = saved?.end ?? 0;
  const snapshot = () => ({
    openFiles: [...openFiles],
    path: filename.value,
    text: source.value,
    base,
    dirty: base === undefined ? source.value !== "" : source.value !== base,
    start: source.selectionStart,
    end: source.selectionEnd,
    scrollTop: code.view.scrollDOM.scrollTop,
    scrollLeft: code.view.scrollDOM.scrollLeft,
  });
  filename.oninput = () => {
    base = undefined;
    code.setPath(filename.value);
  };
  const refresh = async () => {
    const names = await files();
    list.replaceChildren(
      Object.assign(document.createElement("option"), {
        value: "",
        textContent: "Choisir un fichier…",
      }),
      ...names.map((name) =>
        Object.assign(document.createElement("option"), {
          value: name,
          textContent: name,
        }),
      ),
    );
    list.value = names.includes(filename.value) ? filename.value : "";
    const tree = container.querySelector(".file-tree"),
      root = { folders: new Map(), files: [] };
    for (const name of names) {
      let current = root;
      const parts = name.slice(1).split("/");
      for (const part of parts.slice(0, -1)) {
        if (!current.folders.has(part))
          current.folders.set(part, { folders: new Map(), files: [] });
        current = current.folders.get(part);
      }
      current.files.push({ name: parts.at(-1), path: name });
    }
    const drawTree = (node) => {
      const ul = document.createElement("ul");
      for (const [name, folder] of [...node.folders].sort(([a], [b]) =>
        a.localeCompare(b),
      )) {
        const li = document.createElement("li"),
          details = document.createElement("details"),
          summary = document.createElement("summary");
        summary.textContent = name;
        details.append(summary, drawTree(folder));
        li.append(details);
        ul.append(li);
      }
      for (const file of node.files.sort((a, b) =>
        a.name.localeCompare(b.name),
      )) {
        const li = document.createElement("li"),
          button = document.createElement("button");
        button.textContent = file.name;
        button.setAttribute("aria-label", "Charger " + file.path);
        if (file.path === filename.value)
          button.setAttribute("aria-current", "true");
        button.onclick = () => {
          list.value = file.path;
          list.dispatchEvent(new Event("change"));
        };
        li.append(button);
        ul.append(li);
      }
      return ul;
    };
    tree.replaceChildren(drawTree(root));
    if (!names.length)
      tree.textContent =
        "Aucun fichier. Utilisez « Nouveau fichier » pour commencer.";
  };
  const load = async () => {
    const info = await hub.runtime.call("stat", {
      path: "/workspace" + validPath(filename.value),
    });
    if (info.size > 1024 * 1024)
      throw Error("Fichier supérieur à 1 Mio : découpez-le avant de l’éditer.");
    const text = decodeText(
      await hub.runtime.read("/workspace" + validPath(filename.value)),
    );
    source.value = text;
    base = text;
    code.resetHistory();
    source.selectionStart = 0;
    source.selectionEnd = 0;
    code.setReadOnly(false);
    code.setPath(filename.value);
    openFiles.add(filename.value);
    drawFileTabs();
    message.textContent = "Fichier chargé.";
  };
  const write = async () => {
    filename.value = validPath(filename.value);
    if (base === undefined && (await files()).includes(filename.value))
      throw Error("Chargez le fichier existant avant de le modifier.");
    if (base !== undefined) {
      const current = decodeText(
        await hub.runtime.read("/workspace" + filename.value),
      );
      if (current !== base && current !== source.value)
        throw Error(
          "Le fichier a changé dans le projet. Rechargez-le avant de l’écraser.",
        );
    }
    await hub.runtime.call("write", {
      path: "/workspace" + filename.value,
      data: source.value,
      expected: base ?? null,
    });
    base = source.value;
    code.updateProjectFile(filename.value, source.value);
    dirty = true;
    message.textContent =
      "Fichier écrit ; sauvegardez le projet pour le conserver.";
    await refresh();
    drawFileTabs();
  };
  container.querySelector(".load").onclick = () => action(load);
  container.querySelector(".write").onclick = () => action(write);
  container.querySelector(".refresh").onclick = () => action(refresh);
  list.onchange = () => {
    if (!list.value) return;
    return action(async () => {
      code.updateProjectFile(filename.value, source.value);
      const previous = snapshot(),
        readOnly = code.view.state.readOnly;
      await writeState("draft:" + hub.key + ":" + previous.path, previous);
      filename.value = list.value;
      try {
        const draft = await readState(
          "draft:" + hub.key + ":" + filename.value,
        );
        if (draft) {
          source.value = draft.text;
          base = draft.base;
          source.selectionStart = draft.start ?? 0;
          source.selectionEnd = draft.end ?? 0;
          code.setReadOnly(false);
          code.setPath(filename.value);
          openFiles.add(filename.value);
          drawFileTabs();
          requestAnimationFrame(() => {
            if (source.isConnected) {
              code.view.scrollDOM.scrollTop = draft.scrollTop ?? 0;
              code.view.scrollDOM.scrollLeft = draft.scrollLeft ?? 0;
            }
          });
        } else await load();
      } catch (error) {
        filename.value = previous.path;
        list.value = previous.path;
        source.value = previous.text;
        base = previous.base;
        source.selectionStart = previous.start;
        source.selectionEnd = previous.end;
        code.setReadOnly(readOnly);
        code.setPath(previous.path);
        throw error;
      }
    });
  };
  const footer = document.createElement("div");
  footer.className = "editor-footer";
  const position = document.createElement("span"),
    language = document.createElement("span");
  footer.append(position, language);
  source.after(footer);
  const updatePosition = () => {
    const text = source.value,
      cursor = source.selectionStart;
    let line = 1,
      last = -1,
      next = text.indexOf("\n");
    if (text.length <= 1048576) {
      while (next >= 0 && next < cursor) {
        line++;
        last = next;
        next = text.indexOf("\n", next + 1);
      }
      position.textContent = `Ligne ${line}, colonne ${cursor - last}`;
    } else
      position.textContent = `Position ${new Intl.NumberFormat("fr").format(cursor)}`;
    language.textContent =
      {
        php: "PHP",
        html: "HTML",
        css: "CSS",
        js: "JavaScript",
        json: "JSON",
        sql: "SQL",
      }[filename.value.split(".").pop()] ?? "Texte";
  };
  for (const event of ["click", "keyup", "select"])
    source.addEventListener(event, updatePosition);
  source.oninput = () => {
    drawFileTabs();
    dirty = true;
    message.textContent = "Brouillon modifié.";
    shell.update();
    updatePosition();
  };
  container.querySelector(".search-code").onclick = () => code.search();
  const fileDialog = container.querySelector(".file-dialog"),
    target = fileDialog.querySelector(".file-target"),
    fileError = fileDialog.querySelector(".file-error"),
    confirm = fileDialog.querySelector(".file-confirm");
  let fileAction;
  const openFileDialog = (mode) => {
    fileAction = mode;
    target.removeAttribute("aria-invalid");
    fileError.textContent =
      mode === "delete"
        ? "Le fichier et son brouillon seront supprimés. Annulez pour les conserver."
        : "";
    fileDialog.querySelector(".file-dialog-title").textContent =
      mode === "new"
        ? "Nouveau fichier"
        : mode === "rename"
          ? "Renommer " + filename.value
          : "Supprimer " + filename.value;
    target.closest("label").hidden = mode === "delete";
    target.value = mode === "new" ? "/nouveau.php" : filename.value;
    confirm.textContent =
      mode === "new"
        ? "Créer le fichier"
        : mode === "rename"
          ? "Renommer le fichier"
          : "Supprimer le fichier";
    confirm.classList.toggle("danger", mode === "delete");
    fileDialog.showModal();
  };
  container.querySelector(".new-file").onclick = () => openFileDialog("new");
  container.querySelector(".rename-file").onclick = () =>
    openFileDialog("rename");
  container.querySelector(".delete-file").onclick = () =>
    openFileDialog("delete");
  target.oninput = () => target.removeAttribute("aria-invalid");
  target.onkeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      confirm.click();
    }
  };
  confirm.onclick = () => {
    if (confirm.disabled) return;
    confirm.disabled = true;
    return action(async () => {
      try {
        if (snapshot().dirty && fileAction !== "delete")
          throw Error(
            "Écrivez le brouillon avant de créer ou renommer un fichier.",
          );
        const next = validPath(target.value),
          old = filename.value,
          names = await files();
        if (fileAction !== "delete" && names.includes(next))
          throw Error("Ce fichier existe déjà. Choisissez un autre chemin.");
        if (fileAction === "new") {
          await hub.runtime.call("write", {
            path: "/workspace" + next,
            data: "",
            expected: null,
          });
          filename.value = next;
          source.value = "";
          base = "";
        }
        if (fileAction === "rename") {
          await hub.runtime.call("rename", {
            path: "/workspace" + validPath(old),
            target: "/workspace" + next,
            exclusive: true,
          });
          openFiles.delete(old);
          filename.value = next;
          await writeState("draft:" + hub.key + ":" + old, null);
        }
        if (fileAction === "delete") {
          openFiles.delete(old);
          await hub.runtime.remove("/workspace" + validPath(old));
          await writeState("draft:" + hub.key + ":" + old, null);
          filename.value = "/nouveau.php";
          source.value = "";
          base = undefined;
        }
        code.resetHistory();
        code.setReadOnly(false);
        code.setPath(filename.value);
        openFiles.add(filename.value);
        drawFileTabs();
        dirty = true;
        fileDialog.close();
        await refresh();
        message.textContent = "Fichiers modifiés ; sauvegardez le projet.";
      } catch (error) {
        fileError.textContent = error.message;
        if (
          fileAction !== "delete" &&
          /chemin|existe|segment|dossier/i.test(error.message)
        ) {
          target.setAttribute("aria-invalid", "true");
          target.focus();
        }
        throw error;
      } finally {
        confirm.disabled = false;
      }
    });
  };
  await refresh();
  if (!saved?.dirty) {
    try {
      await load();
    } catch (error) {
      if ((await files()).includes(filename.value)) {
        code.setReadOnly(true);
        message.textContent = error.message;
      } else
        message.textContent =
          "Nouveau fichier : écrivez du code puis enregistrez.";
    }
  }
  const projectFiles = {},
    projectDefinitions = {};
  let contextBytes = 0;
  for (const name of (await files())
    .filter((name) =>
      /\.(?:php|phtml|inc|html?|css|[cm]?js|jsx|tsx?|json)$/.test(name),
    )
    .slice(0, 64)) {
    try {
      const bytes = await hub.runtime.read("/workspace" + name);
      if (bytes.length > 65536 || contextBytes + bytes.length > 1024 * 1024)
        continue;
      const text = decodeText(bytes);
      projectFiles[name] = text;
      if (name.endsWith(".d.ts")) projectDefinitions[name] = text;
      contextBytes += bytes.length;
    } catch {
      /* Binary/unsupported files are not indexed. */
    }
  }
  code.setProjectContext({ files: projectFiles, projectDefinitions });
  if (saved) {
    source.selectionStart = saved.start ?? 0;
    source.selectionEnd = saved.end ?? 0;
    requestAnimationFrame(() => {
      if (source.isConnected) {
        code.view.scrollDOM.scrollTop = saved.scrollTop ?? 0;
        code.view.scrollDOM.scrollLeft = saved.scrollLeft ?? 0;
      }
    });
  }
  drawFileTabs();
  updatePosition();
  return {
    snapshot,
    write,
    dispose: () => code.destroy(),
    setReadOnly: (value) => code.setReadOnly(value),
  };
}
async function renderSQL(container, saved) {
  container.append($("#sql-template").content.cloneNode(true));
  const query = container.querySelector(".query"),
    database = container.querySelector(".database"),
    grid = container.querySelector(".grid"),
    tableSelect = container.querySelector(".table"),
    message = container.querySelector(".message");
  const sqlMain = container.querySelector(".sql-main"),
    queryGroup = node("div", { class: "query-workbench" }),
    views = node("div", {
      class: "sql-views",
      role: "group",
      "aria-label": "Vue SQL",
    }),
    queryTab = node(
      "button",
      { class: "sql-tab-query", "aria-pressed": "true" },
      "Requête SQL",
    );
  views.append(
    queryTab,
    container.querySelector(".browse"),
    container.querySelector(".structure"),
  );
  sqlMain.firstElementChild.after(views);
  query.before(queryGroup);
  queryGroup.append(
    query,
    container.querySelector(".search-sql").parentElement,
  );
  queryGroup.prepend(container.querySelector(".run"));
  const tableBar = container.querySelector(".tables").parentElement,
    actions = node("details", { class: "sql-actions" }),
    summary = node("summary", {}, "Actions"),
    menu = node("div", { class: "menu-content" });
  actions.append(summary, menu);
  tableBar.append(actions);
  for (const selector of [
    ".create-table",
    ".manage-table",
    ".export-csv",
    ".import-sql",
    ".export-sql",
  ])
    menu.append(container.querySelector(selector));
  for (const button of menu.querySelectorAll("button"))
    button.addEventListener("click", () => (actions.open = false));
  let sqlMode = "query";
  function setSQLMode(mode) {
    sqlMode = mode;
    queryGroup.hidden = mode !== "query";
    container.querySelector(".data-filter").hidden = mode !== "data";
    grid.hidden = mode === "structure";
    container.querySelector(".pagination").hidden = mode === "structure";
    if (mode !== "structure") {
      container.querySelector(".structure-grid").hidden = true;
      container.querySelector(".structure-output").hidden = true;
    }
    for (const button of views.querySelectorAll("button"))
      button.setAttribute(
        "aria-pressed",
        String(
          mode ===
            (button === queryTab
              ? "query"
              : button.classList.contains("browse")
                ? "data"
                : "structure"),
        ),
      );
  }
  queryTab.onclick = () => setSQLMode("query");
  setSQLMode("query");
  const code = createCodeEditor(query, {
    path: "/console.sql",
    label: "Requête SQL",
    onRun: () => action(execute),
  });
  container.querySelector(".search-sql").onclick = () => code.search();
  query.value = saved?.query ?? "SHOW TABLES";
  database.replaceChildren(option(saved?.database ?? "test"));
  database.value = saved?.database ?? "test";
  let history = (saved?.history ?? [])
    .filter((text) => typeof text === "string" && text.length <= 4096)
    .slice(0, 20);
  const historySelect = container.querySelector(".query-history");
  const drawHistory = () =>
    historySelect.replaceChildren(
      Object.assign(document.createElement("option"), {
        value: "",
        textContent: "Requêtes récentes",
      }),
      ...history.map((text, i) =>
        Object.assign(document.createElement("option"), {
          value: String(i),
          textContent: text.slice(0, 100),
        }),
      ),
    );
  drawHistory();
  historySelect.onchange = () => {
    if (historySelect.value !== "")
      query.value = history[Number(historySelect.value)];
  };
  container.querySelector(".clear-history").onclick = () => {
    history = [];
    drawHistory();
  };
  let resultSets = [];
  const resultSelect = container.querySelector(".result-sets");
  resultSelect.onchange = () => {
    result = resultSets[Number(resultSelect.value)];
    page = 0;
    editingTable = undefined;
    draw();
  };
  let filterTable,
    appliedFilter = null,
    appliedSort = null;
  let result,
    page = saved?.page ?? 0,
    editingTable,
    primaryKeys = [],
    totalRows = 0,
    viewDatabase;
  const rowCondition = (columns, row) =>
    columns
      .map(
        (column, i) =>
          `${column.kind === 1 ? "BINARY " : ""}${identifier(column.name)} <=> ${literal(row[i], column)}`,
      )
      .join(" AND ");
  const draw = () => {
    grid.replaceChildren();
    if (!result) return;
    const targetTable = editingTable,
      targetDatabase = viewDatabase ?? database.value,
      columns = result.columns;
    const table = document.createElement("table");
    if (targetTable)
      table.createCaption().textContent =
        "Données : " + targetDatabase + "." + targetTable;
    const head = table.createTHead().insertRow();
    result.columns.forEach((column) => {
      const cell = document.createElement("th");
      cell.textContent = column.name;
      head.append(cell);
    });
    if (editingTable && primaryKeys.length)
      head.append(
        Object.assign(document.createElement("th"), { textContent: "Actions" }),
      );
    const body = table.createTBody();
    for (const row of editingTable
      ? result.rows
      : result.rows.slice(page * 100, page * 100 + 100)) {
      const tr = body.insertRow();
      row.forEach((value, index) => {
        const cell = tr.insertCell();
        cell.textContent = display(value);
        if (editingTable && primaryKeys.length) {
          cell.dataset.editable = "";
          cell.tabIndex = 0;
          cell.setAttribute(
            "aria-label",
            `${columns[index].name} : ${display(value)}. Entrée pour modifier.`,
          );
          cell.onkeydown = (event) => {
            if (event.key === "Enter" && event.target === cell) {
              event.preventDefault();
              cell.ondblclick();
            }
          };
          cell.ondblclick = () => {
            const mode = document.createElement("select");
            mode.setAttribute("aria-label", "Type de valeur");
            for (const [value, label] of [
              ["text", "Texte"],
              ["hex", "Binaire (hex)"],
              ["null", "NULL"],
            ])
              mode.append(
                Object.assign(document.createElement("option"), {
                  value,
                  textContent: label,
                }),
              );
            mode.value =
              value === null
                ? "null"
                : value instanceof Uint8Array
                  ? "hex"
                  : "text";
            const input = document.createElement("input");
            input.setAttribute("aria-label", "Nouvelle valeur");
            input.value =
              value === null
                ? ""
                : value instanceof Uint8Array
                  ? [...value]
                      .map((b) => b.toString(16).padStart(2, "0"))
                      .join("")
                  : String(value);
            const save = document.createElement("button");
            save.textContent = "Valider";
            const cancel = document.createElement("button");
            cancel.textContent = "Annuler";
            cancel.onclick = draw;
            cell.replaceChildren(mode, input, save, cancel);
            input.focus();
            const submit = () =>
              action(async () => {
                const next = editValue(mode.value, input.value);
                if (sameValue(next, value)) {
                  draw();
                  return;
                }
                const where = rowCondition(columns, row);
                const changed = await rows(
                  `UPDATE ${identifier(targetTable)} SET ${identifier(columns[index].name)}=${literal(next, columns[index])} WHERE ${where} LIMIT 1`,
                  targetDatabase,
                );
                if (changed.affectedRows !== "1")
                  throw Error(
                    "La ligne a changé depuis son affichage. Rechargez les données avant de modifier.",
                  );
                dirty = true;
                if (
                  database.value === targetDatabase &&
                  tableSelect.value === targetTable
                )
                  await browse(false);
              });
            save.onclick = submit;
            input.onkeydown = (event) => {
              if (event.key === "Escape") draw();
              if (event.key === "Enter") submit();
            };
          };
        }
      });
      if (editingTable && primaryKeys.length) {
        const cell = tr.insertCell(),
          button = document.createElement("button");
        button.textContent = "Supprimer";
        cell.append(button);
        button.onclick = () => {
          if (!confirm("Supprimer cette ligne de " + targetTable + " ?"))
            return;
          action(async () => {
            const changed = await rows(
              `DELETE FROM ${identifier(targetTable)} WHERE ${rowCondition(columns, row)} LIMIT 1`,
              targetDatabase,
            );
            if (changed.affectedRows !== "1")
              throw Error(
                "La ligne a changé depuis son affichage. Rechargez les données.",
              );
            dirty = true;
            if (
              database.value === targetDatabase &&
              tableSelect.value === targetTable
            )
              await browse(false);
          });
        };
      }
    }
    grid.append(table);
    container.querySelector(".page").textContent =
      `${page + 1} / ${Math.max(1, Math.ceil((editingTable ? totalRows : result.rows.length) / 100))}`;
    container.querySelector(".previous").disabled = page === 0;
    container.querySelector(".next").disabled =
      (page + 1) * 100 >= (editingTable ? totalRows : result.rows.length);
  };
  const execute = async () => {
    setSQLMode("query");
    const executed = code.getSelection() || query.value;
    if (executed.length <= 4096) {
      history = [
        executed,
        ...history.filter((text) => text !== executed),
      ].slice(0, 20);
      drawHistory();
    }
    editingTable = undefined;
    viewDatabase = database.value;
    const statements = splitSQL(executed);
    if (!statements.length)
      throw Error("Écrivez une instruction SQL avant de l’exécuter.");
    resultSets = await hub.runtime.sqlScript(statements, database.value);
    result =
      resultSets.findLast((set) => set.columns.length) || resultSets.at(-1);
    resultSelect.hidden = resultSets.length < 2;
    resultSelect.replaceChildren(
      ...resultSets.map((set, i) =>
        Object.assign(document.createElement("option"), {
          value: String(i),
          textContent: `Résultat ${i + 1} · ${set.rows.length} lignes · ${set.affectedRows} affectées`,
        }),
      ),
    );
    resultSelect.value = String(resultSets.indexOf(result));
    dirty = true;
    page = 0;
    message.textContent = `${result.rows.length} lignes · ${result.affectedRows} lignes affectées`;
    draw();
    if (statements.some((s) => /^\s*(?:CREATE|ALTER|DROP|RENAME)/i.test(s))) {
      await manager.refresh();
      await tables();
    }
    await updateEngine();
  };
  const tables = async () => {
    const data = await rows("SHOW TABLES", database.value);
    const previousTable = tableSelect.value;
    tableSelect.replaceChildren(
      ...data.rows.map((row) =>
        Object.assign(document.createElement("option"), {
          value: row[0],
          textContent: row[0],
        }),
      ),
    );
    if ([...tableSelect.options].some((o) => o.value === previousTable))
      tableSelect.value = previousTable;
    if (!data.rows.length)
      message.textContent =
        "Aucune table dans cette base. Créez une table avec SQL ou importez un fichier SQL.";
    const columns = await rows(
      `SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=${literal(database.value)} ORDER BY TABLE_NAME,ORDINAL_POSITION LIMIT 2048`,
      database.value,
    );
    const schema = Object.create(null);
    for (const [table, column] of columns.rows)
      (schema[table] ??= []).push(column);
    code.setSQLSchema({ [database.value]: schema }, database.value);
  };
  const browse = async (reset = true) => {
    setSQLMode("data");
    container.querySelector(".structure-grid").hidden = true;
    container.querySelector(".structure-output").hidden = true;
    const name = tableSelect.value;
    if (!name) return;
    resultSelect.hidden = true;
    resultSets = [];
    const keys = await rows(
      `SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=${literal(database.value)} AND TABLE_NAME=${literal(name)} AND CONSTRAINT_NAME='PRIMARY' ORDER BY ORDINAL_POSITION`,
      database.value,
    );
    primaryKeys = keys.rows.map((row) => row[0]);
    editingTable = name;
    viewDatabase = database.value;
    if (reset) page = 0;
    const allColumns = await rows(
      `SHOW COLUMNS FROM ${identifier(name)}`,
      database.value,
    );
    if (filterTable !== database.value + "." + name) {
      filterTable = database.value + "." + name;
      appliedFilter = appliedSort = null;
      for (const selector of [".filter-column", ".sort-column"])
        container
          .querySelector(selector)
          .replaceChildren(
            option(
              "",
              selector === ".filter-column" ? "Sans filtre" : "Clé primaire",
            ),
            ...allColumns.rows.map((r) => option(r[0])),
          );
    }
    const names = new Set(allColumns.rows.map((r) => r[0]));
    if (appliedFilter && !names.has(appliedFilter.column)) appliedFilter = null;
    if (appliedSort && !names.has(appliedSort.column)) appliedSort = null;
    const where = appliedFilter
      ? " WHERE " +
        identifier(appliedFilter.column) +
        " " +
        appliedFilter.operator +
        (["IS NULL", "IS NOT NULL"].includes(appliedFilter.operator)
          ? ""
          : " " + literal(appliedFilter.value))
      : "";
    const count = await rows(
      `SELECT COUNT(*) FROM ${identifier(name)}${where}`,
      database.value,
    );
    if (BigInt(count.rows[0][0]) > BigInt(Number.MAX_SAFE_INTEGER))
      throw Error("Table trop grande pour cette pagination.");
    totalRows = Number(count.rows[0][0]);
    page = Math.min(page, Math.max(0, Math.ceil(totalRows / 100) - 1));
    const order = appliedSort
      ? " ORDER BY " +
        identifier(appliedSort.column) +
        " " +
        appliedSort.direction +
        (primaryKeys.length ? ", " + primaryKeys.map(identifier).join(",") : "")
      : primaryKeys.length
        ? " ORDER BY " + primaryKeys.map(identifier).join(",")
        : "";
    result = await rows(
      `SELECT * FROM ${identifier(name)}${where}${order} LIMIT 100 OFFSET ${page * 100}`,
      database.value,
    );
    manager?.mark();
    message.textContent = primaryKeys.length
      ? `Double-cliquez pour modifier · ${totalRows} lignes · 100 lignes par page.`
      : `Lecture seule : aucune clé primaire · ${totalRows} lignes. L’ordre peut changer entre les pages.`;
    draw();
  };
  container.querySelector(".filter-apply").onclick = () =>
    action(async () => {
      const value = (s) => container.querySelector(s).value,
        operator = value(".filter-operator");
      if (
        !["=", "!=", "<", ">", "LIKE", "IS NULL", "IS NOT NULL"].includes(
          operator,
        )
      )
        throw Error("Opérateur invalide.");
      appliedFilter = value(".filter-column")
        ? {
            column: value(".filter-column"),
            operator,
            value: value(".filter-value"),
          }
        : null;
      appliedSort = value(".sort-column")
        ? {
            column: value(".sort-column"),
            direction: value(".sort-direction") === "DESC" ? "DESC" : "ASC",
          }
        : null;
      await browse();
    });
  container.querySelector(".filter-reset").onclick = () =>
    action(async () => {
      appliedFilter = appliedSort = null;
      container.querySelector(".filter-column").value = "";
      container.querySelector(".sort-column").value = "";
      container.querySelector(".filter-value").value = "";
      await browse();
    });
  container.querySelector(".export-csv").onclick = () => {
    if (!result) {
      message.textContent =
        "Exécutez une requête ou ouvrez une table avant d’exporter.";
      return;
    }
    const quote = (value) => '"' + display(value).replaceAll('"', '""') + '"',
      text = [
        result.columns.map((c) => quote(c.name)).join(","),
        ...result.rows.map((row) => row.map(quote).join(",")),
      ].join("\r\n"),
      link = node("a");
    link.href = URL.createObjectURL(
      new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" }),
    );
    link.download = (editingTable ?? "resultat") + ".csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    message.textContent =
      "CSV exporté : lignes du résultat affiché (page courante pour une table).";
  };
  container.querySelector(".run").onclick = () => action(execute);
  container.querySelector(".tables").onclick = () => action(tables);
  container.querySelector(".browse").onclick = () => action(() => browse());
  container.querySelector(".previous").onclick = () =>
    action(async () => {
      page = Math.max(0, page - 1);
      if (editingTable) await browse(false);
      else draw();
    });
  container.querySelector(".next").onclick = () =>
    action(async () => {
      page++;
      if (editingTable) await browse(false);
      else draw();
    });
  const dialog = container.querySelector(".row-dialog"),
    fieldsBox = dialog.querySelector(".row-fields");
  let insertTarget,
    insertDatabase,
    inputs = [];
  container.querySelector(".insert").onclick = () =>
    action(async () => {
      if (!tableSelect.value) throw Error("Choisissez une table.");
      insertTarget = tableSelect.value;
      insertDatabase = database.value;
      const columns = await rows(
        `SHOW FULL COLUMNS FROM ${identifier(insertTarget)}`,
        insertDatabase,
      );
      fieldsBox.replaceChildren();
      inputs = [];
      for (const [
        name,
        type,
        collation,
        nullable,
        key,
        defaultValue,
        extra,
      ] of columns.rows) {
        if (/(?:VIRTUAL|STORED|PERSISTENT) GENERATED/i.test(extra ?? ""))
          continue;
        const row = document.createElement("label");
        row.className = "row-field";
        row.append(document.createTextNode(name + " · " + type));
        const mode = document.createElement("select");
        mode.setAttribute("aria-label", name + " mode");
        for (const [value, text] of [
          ["default", "DEFAULT"],
          ["text", "Texte"],
          ["hex", "Binaire (hex)"],
          ...(nullable === "YES" ? [["null", "NULL"]] : []),
        ])
          mode.append(
            Object.assign(document.createElement("option"), {
              value,
              textContent: text,
            }),
          );
        const input = document.createElement("input");
        input.setAttribute("aria-label", name + " valeur");
        input.placeholder = defaultValue === null ? "" : String(defaultValue);
        row.append(mode, input);
        fieldsBox.append(row);
        inputs.push({
          name,
          mode,
          input,
          nativeType: /^bit\b/i.test(type) ? 16 : undefined,
        });
      }
      dialog.querySelector(".message").textContent = "";
      dialog.showModal();
    });
  dialog.querySelector(".insert-confirm").onclick = () => {
    const submit = dialog.querySelector(".insert-confirm");
    if (submit.disabled) return;
    submit.disabled = true;
    action(async () => {
      try {
        dialog.querySelector(".message").textContent = "";
        const active = inputs.filter((field) => field.mode.value !== "default");
        await rows(
          `INSERT INTO ${identifier(insertTarget)} (${active.map((field) => identifier(field.name)).join(",")}) VALUES (${active.map((field) => literal(editValue(field.mode.value, field.input.value), field)).join(",")})`,
          insertDatabase,
        );
        dirty = true;
        dialog.close();
        if (
          database.value === insertDatabase &&
          tableSelect.value === insertTarget
        )
          await browse(false);
      } catch (error) {
        dialog.querySelector(".message").textContent = error.message;
        throw error;
      } finally {
        submit.disabled = false;
      }
    });
  };
  container.querySelector(".structure").onclick = () =>
    action(async () => {
      if (!tableSelect.value) throw Error("Choisissez une table.");
      setSQLMode("structure");
      const structure = container.querySelector(".structure-grid");
      structure.hidden = false;
      structure.replaceChildren();
      const columns = await rows(
          `SHOW FULL COLUMNS FROM ${identifier(tableSelect.value)}`,
          database.value,
        ),
        table = node("table");
      const heading = table.createTHead().insertRow();
      for (const label of [
        "Colonne",
        "Type",
        "Collation",
        "NULL",
        "Clé",
        "Défaut",
        "Extra",
      ])
        heading.append(node("th", {}, label));
      for (const data of columns.rows) {
        const row = table.createTBody();
        const tr = row.insertRow();
        for (const value of data.slice(0, 7))
          tr.append(node("td", {}, display(value)));
      }
      structure.append(table);
      const ddl = await rows(
        `SHOW CREATE TABLE ${identifier(tableSelect.value)}`,
        database.value,
      );
      const indexes = await rows(
        `SHOW INDEX FROM ${identifier(tableSelect.value)}`,
        database.value,
      );
      const output = container.querySelector(".structure-output");
      output.hidden = false;
      output.textContent =
        ddl.rows[0][1] +
        ";\n\nIndex :\n" +
        indexes.rows
          .map((row) =>
            indexes.columns
              .map((col, i) => col.name + ": " + display(row[i]))
              .join(" · "),
          )
          .join("\n");
    });
  container.querySelector(".export-sql").onclick = () =>
    action(async () => {
      const tool = "/workspace/.pbl-export-" + crypto.randomUUID();
      const response = await fetch("/apps/studio/sql-export.source.txt");
      if (!response.ok) throw Error("Outil d’export indisponible.");
      await hub.runtime.write(tool + ".php", await response.text());
      try {
        const result = await hub.runtime.request({
          script: tool + ".php",
          url: new URL(
            "/export.php?database=" + encodeURIComponent(database.value),
            location.href,
          ).href,
        });
        if (result.exitCode !== 0)
          throw Error(decoder.decode(result.stderr) || "Export SQL échoué.");
        const info = JSON.parse(decoder.decode(result.body));
        if (!info.ok) throw Error("Export SQL incomplet.");
        const bytes = await hub.runtime.read(tool + ".php.sql"),
          link = document.createElement("a");
        link.href = URL.createObjectURL(
          new Blob([bytes], { type: "application/sql" }),
        );
        link.download = database.value + ".sql";
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        message.textContent = `Export : ${info.tables} tables, ${info.views} vues, ${info.routines} routines · ${info.bytes} octets. Événements non pris en charge. Restaurez dans un projet distinct.`;
      } finally {
        for (const suffix of [".php", ".php.sql"])
          try {
            await hub.runtime.remove(tool + suffix);
          } catch {
            /* Preserve the original export error. */
          }
      }
    });
  const input = container.querySelector(".sql-file");
  container.querySelector(".import-sql").onclick = () => input.click();
  input.onchange = () =>
    action(async () => {
      const file = input.files[0];
      if (!file) return;
      message.textContent = "Import SQL en cours…";
      if (file.size > 8 * 1024 * 1024)
        throw Error("Import SQL limité à 8 Mio.");
      const tool = "/workspace/.pbl-import-" + crypto.randomUUID();
      try {
        const statements = splitSQL(await file.text(), { maxStatements: 4096 });
        if (!statements.length)
          throw Error("Le fichier ne contient aucune instruction SQL.");
        await hub.runtime.write(tool + ".php.sql", encodeSQLScript(statements));
        await hub.runtime.write(
          tool + ".php",
          `<?php $db=new PDO('mysql:charset=utf8mb4','root','');$name=$_GET['database']??'test';$db->exec('USE '.chr(96).str_replace(chr(96),chr(96).chr(96),$name).chr(96));$stream=fopen(__FILE__.'.sql','rb');$count=0;while(!feof($stream)){$head=fread($stream,4);if($head==='')break;if(strlen($head)!==4)throw new RuntimeException('En-tête SQL incomplet');$length=unpack('V',$head)[1];$sql='';while(strlen($sql)<$length){$chunk=fread($stream,$length-strlen($sql));if($chunk==='')throw new RuntimeException('Instruction SQL incomplète');$sql.=$chunk;}try{$db->exec($sql);$count++;}catch(Throwable $error){throw new RuntimeException('Import interrompu après '.$count.' instructions. Les instructions précédentes peuvent être appliquées. '.$error->getMessage());}}fclose($stream);echo 'ok';`,
        );
        const response = await hub.runtime.request({
          script: tool + ".php",
          url: new URL(
            "/import.php?database=" + encodeURIComponent(database.value),
            location.href,
          ).href,
        });
        if (response.exitCode !== 0)
          throw Error(decoder.decode(response.stderr));
        message.textContent = "Import SQL terminé.";
        dirty = true;
      } finally {
        for (const suffix of [".php", ".php.sql"])
          try {
            await hub.runtime.remove(tool + suffix);
          } catch {
            /* Preserve the original import error. */
          }
      }
    });
  const manager = attachDatabaseManager(container, {
    rows,
    run: action,
    changed: () => {
      dirty = true;
    },
    refreshTables: tables,
    browse,
    showStructure: () => container.querySelector(".structure").click(),
  });
  let activated = false;
  const activate = async () => {
    if (activated) return;
    await manager.refresh();
    await tables();
    activated = true;
    if (
      saved?.table &&
      (!saved.viewDatabase || saved.viewDatabase === database.value)
    ) {
      try {
        if (
          [...tableSelect.options].some(
            (option) => option.value === saved.table,
          )
        ) {
          tableSelect.value = saved.table;
          await browse(false);
        }
      } catch (error) {
        message.textContent = "Vue SQL non restaurée : " + error.message;
      }
    }
  };
  return {
    activate,
    async openTable(db, table) {
      await activate();
      database.value = db;
      await tables();
      tableSelect.value = table;
      await browse();
    },
    snapshot: () => ({
      query: query.value,
      database: database.value,
      table: editingTable,
      viewDatabase,
      page,
      history,
    }),
    dispose: () => {
      code.destroy();
      manager.dispose();
    },
    setReadOnly: (value) => code.setReadOnly(value),
  };
}
async function renderSchema(container, saved) {
  return renderSchemaDesigner(container, saved, {
    rows,
    run: action,
    changed: () => {
      dirty = true;
    },
    openTable: (db, table) => {
      shell.selectPanel("sql");
      action(() => tools.get("sql").view.openTable(db, table));
    },
  });
}
const renderers = {
  editor: renderEditor,
  sql: renderSQL,
  schema: renderSchema,
};
async function setTool(name, mode) {
  const tool = tools.get(name) ?? { mode: "unloaded", view: null };
  tools.set(name, tool);
  const container = $("#" + name + "-tool");
  if (!hub) {
    container.textContent = "Ouvrez un projet.";
    return;
  }
  if (mode === "unloaded") {
    if (tool.view)
      await writeState("tool:" + hub.key + ":" + name, tool.view.snapshot());
    tool.view?.dispose?.();
    if (name === "sql") await hub.runtime.closeConsole();
    container.replaceChildren(
      Object.assign(document.createElement("p"), {
        className: "unloaded",
        textContent: "Outil déchargé — brouillon conservé.",
      }),
    );
    tool.view = null;
  } else {
    if (!tool.view) {
      container.replaceChildren();
      tool.view = await renderers[name](
        container,
        await readState("tool:" + hub.key + ":" + name),
      );
    }
    tool.view?.setReadOnly?.(mode === "idle");
    container.classList.toggle("idle", mode === "idle");
    container
      .querySelectorAll("input,select,textarea,button")
      .forEach((element) => {
        element.disabled = mode === "idle";
      });
  }
  tool.mode = mode;
}
const clientWindows = new Map();
function refreshSessions() {
  const sessions = [...hub.sessions.sessions.values()];
  $("#sessions").replaceChildren(
    ...sessions.map((session) =>
      Object.assign(document.createElement("option"), {
        value: session.id,
        textContent: session.label,
      }),
    ),
  );
  $("#session-overview").replaceChildren(
    ...sessions.map((session) => {
      const row = node("section", { class: "session-row" }),
        identity = node("div"),
        label = node("strong", {}, session.label),
        id = node("code", {}, session.id.slice(0, 8)),
        count = node(
          "span",
          { class: "hint" },
          `${[...clientWindows.values()].filter((c) => c.session === session.id && !c.popup.closed).length} fenêtre(s) · ${session.jar.entries.length} cookie(s)`,
        );
      identity.append(label, id, count);
      const controls = node("div", { class: "bar" }),
        button = node("button", {}, "Ouvrir un client");
      button.onclick = () => {
        $("#sessions").value = session.id;
        openWindow(false);
      };
      const rename = node("button", {}, "Renommer");
      rename.onclick = () => {
        const value = prompt("Nom de la session", session.label);
        if (value?.trim())
          action(async () => {
            session.label = value.trim().slice(0, 80);
            await hub.saveSessions();
            dirty = true;
            refreshSessions();
          });
      };
      controls.append(button, rename);
      row.append(identity, controls);
      return row;
    }),
  );
  const windows = $("#client-windows");
  windows.replaceChildren();
  for (const [id, client] of clientWindows) {
    if (client.popup.closed) {
      clientWindows.delete(id);
      continue;
    }
    const row = node("div", { class: "client-window" }),
      title = node("strong", {}, hub.sessions.get(client.session).label),
      path = node("span", {}, client.path),
      focus = node("button", {}, "Afficher"),
      reload = node("button", {}, "Recharger"),
      close = node("button", {}, "Fermer");
    focus.onclick = () => client.popup.focus();
    reload.onclick = () => {
      client.popup.location.href = hub.routeURL(client.session, client.path);
    };
    close.onclick = () => {
      client.popup.close();
      clientWindows.delete(id);
      refreshSessions();
    };
    row.append(title, path, focus, reload, close);
    windows.append(row);
  }
  if (!windows.children.length)
    windows.append(
      node(
        "p",
        { class: "empty-state" },
        "Aucune fenêtre ouverte depuis ce studio.",
      ),
    );
}
async function updateEngine() {
  if (!hub) return;
  const state = await hub.runtime.state(),
    label = $("#engine-state");
  label.dataset.linearMemoryBytes = state.linearMemoryBytes;
  label.dataset.allocatorUsedBytes = state.allocatorUsedBytes ?? "";
  const sqlStatus =
    {
      dormant: "à la demande",
      running: "actif",
      stopped: "arrêté — nouveau moteur requis",
      failed: "en échec — nouveau moteur requis",
    }[state.sqlPhase] ?? (state.sqlStarted ? "actif" : "à la demande");
  label.textContent = `SQL ${sqlStatus} · ${state.allocatorUsedBytes === null ? "" : `tas occupé ${(state.allocatorUsedBytes / 1048576).toFixed(0)} Mio · `}capacité WASM ${(state.linearMemoryBytes / 1048576).toFixed(0)} Mio`;
  label.title =
    "MariaDB démarre au premier besoin PDO MySQL, MySQLi ou console SQL et reste active jusqu’à la sauvegarde ou la fermeture. Le tas occupé et la capacité WASM sont distincts de la RAM résidente du navigateur.";
  shell.resources(state);
  shell.update();
}
async function openProject() {
  const key = $("#project").value;
  const valid = /^[A-Za-z0-9_-]{1,64}$/.test(key);
  $("#project").setAttribute("aria-invalid", String(!valid));
  if (!valid) {
    $("#project").focus();
    throw Error(
      "Nom de projet : lettres, chiffres, tirets et underscore, 64 caractères maximum.",
    );
  }
  status("Ouverture du projet…");
  $("main").inert = true;
  $("#open").disabled = true;
  try {
    if (hub) {
      for (const name of tools.keys()) await setTool(name, "unloaded");
      await hub.close();
      navigator.serviceWorker.controller.postMessage({
        type: "pbl-release",
        project: hub.key,
      });
      hub = null;
      $("#engine-state").textContent = "Aucun moteur actif.";
    }
    for (const id of [
      "save",
      "close",
      "window",
      "new-client",
      "demo",
      "export",
      "import-files",
    ])
      $("#" + id).disabled = true;
    hub = await ProjectHub.open(key);
    dirty = false;
    hub.onDiagnostic = (message, details) =>
      shell.error(
        Object.assign(Error(message), { stack: details }),
        "Requête PHP",
      );
    hub.onRequest = ({ method, path, status: code, durationMs }) =>
      shell.record(
        code >= 500 ? "warning" : "info",
        `${method} ${path} · HTTP ${code} · ${new Intl.NumberFormat("fr", { maximumFractionDigits: 0 }).format(durationMs)} ms`,
        { context: `${key} · Requête cliente` },
      );
    navigator.serviceWorker.controller.postMessage({
      type: "pbl-owner",
      project: key,
    });
    for (const id of [
      "save",
      "close",
      "window",
      "new-client",
      "demo",
      "export",
      "import-files",
    ])
      $("#" + id).disabled = false;
    clientWindows.clear();
    refreshSessions();
    for (const select of document.querySelectorAll("[data-tool]")) {
      select.value = "active";
      await setTool(select.dataset.tool, "active");
    }
    await updateEngine();
    await rememberProject();
    shell.selectPanel("editor");
    status("Projet prêt. SQL démarre uniquement si nécessaire.");
  } finally {
    $("main").inert = false;
    $("#open").disabled = false;
  }
}
navigator.serviceWorker?.addEventListener("message", (event) => {
  const reply = (ok, value, error) => {
    const transfers = value?.body ? [value.body.buffer] : [];
    event.ports[0]?.postMessage({ ok, value, error }, transfers);
  };
  const data = event.data;
  if (data?.type === "pbl-discover") {
    reply(true, !!hub && hub.key === data.project);
    return;
  }
  if (!hub) {
    reply(false, null, "Projet fermé");
    return;
  }
  if (data?.type === "pbl-route")
    hub.route(data.session, data.request).then(
      (value) => {
        dirty = true;
        reply(true, value);
        updateEngine().catch(() => {});
      },
      (error) => reply(false, null, error.message),
    );
  if (data?.type === "pbl-cookie")
    hub.setCookie(data.session, data.value, data.url).then(
      (value) => reply(true, value),
      (error) => reply(false, null, error.message),
    );
});
$("#open").onclick = () => action(openProject);
$("#project").onkeydown = (event) => {
  if (event.key === "Enter") $("#open").click();
};
for (const button of document.querySelectorAll(".project-menu button"))
  button.addEventListener(
    "click",
    () => (button.closest("details").open = false),
  );
$("#save").onclick = () =>
  action(async () => {
    await flushEditorDrafts();
    status("Sauvegarde du projet…");
    for (const [name, tool] of tools)
      if (tool.view)
        await writeState("tool:" + hub.key + ":" + name, tool.view.snapshot());
    try {
      await hub.saveAndRestart();
      dirty = false;
    } finally {
      await updateEngine().catch(() => {});
    }
    await rememberProject();
    status("Fichiers et transactions validées sauvegardés.");
  });
$("#close").onclick = () =>
  action(async () => {
    for (const name of tools.keys()) await setTool(name, "unloaded");
    await hub.close();
    navigator.serviceWorker.controller.postMessage({
      type: "pbl-release",
      project: hub.key,
    });
    hub = null;
    dirty = false;
    clientWindows.clear();
    shell.selectPanel("home");
    await renderProjects();
    status("Projet fermé et sauvegardé.");
    for (const id of [
      "save",
      "close",
      "window",
      "new-client",
      "demo",
      "export",
      "import-files",
    ])
      $("#" + id).disabled = true;
  });
function openWindow(independent) {
  if (!hub) return;
  const popup = window.open("about:blank", "_blank");
  if (!popup) {
    status("Autorisez les fenêtres pour ouvrir un client.", true);
    return;
  }
  action(async () => {
    const id = independent ? await hub.createSession() : $("#sessions").value;
    const path = $("#preview-path").value;
    popup.location.href = hub.routeURL(id, path);
    clientWindows.set(crypto.randomUUID(), { popup, session: id, path });
    refreshSessions();
    $("#sessions").value = id;
  });
}
$("#window").onclick = () => openWindow(false);
$("#new-client").onclick = () => openWindow(true);
for (const select of document.querySelectorAll("[data-tool]"))
  select.onchange = () =>
    action(() => setTool(select.dataset.tool, select.value));
$("#import-files").onchange = () => {
  const selected = [...$("#import-files").files];
  return action(async () => {
    for (const file of selected) {
      if (/\.zip$/i.test(file.name)) {
        await importProjectArchive(file);
      } else {
        if (file.size > 8 * 1024 * 1024) throw Error("Fichier limité à 8 Mio.");
        await hub.runtime.write(
          "/workspace/" + file.name,
          new Uint8Array(await file.arrayBuffer()),
        );
      }
    }
    dirty = true;
    await setTool("editor", "unloaded");
    await setTool("editor", "active");
    await rememberProject();
    status("Fichiers importés.");
    $("#import-files").value = "";
  });
};
$("#demo").onclick = () =>
  action(async () => {
    const demo = await import("./school-demo.mjs");
    for (const [name, text] of Object.entries(demo.files)) {
      try {
        await hub.runtime.read("/workspace/" + name);
        throw Error(
          "Le fichier " + name + " existe déjà. Utilisez un projet vide.",
        );
      } catch (error) {
        if (error.message.includes("existe déjà")) throw error;
      }
      await hub.runtime.write("/workspace/" + name, text);
    }
    dirty = true;
    await setTool("editor", "unloaded");
    await setTool("editor", "active");
    status("Exemple chargé. Ouvrez une fenêtre cliente.");
  });
$("#export").onclick = () =>
  action(async () => {
    await flushEditorDrafts();
    status("Préparation du ZIP du projet…");
    const entries = [];
    let size = 0;
    for (const name of await files()) {
      const bytes = await hub.runtime.read("/workspace" + name);
      size += bytes.length;
      if (size > 64 * 1024 * 1024) throw Error("Export limité à 64 Mio.");
      entries.push({ name: name.slice(1), bytes });
    }
    const manifest = {
      format: "wasmwebserver-project",
      version: 1,
      name: hub.key,
      exportedAt: new Date().toISOString(),
      databases: [],
    };
    const state = await hub.runtime.state();
    if (state.sqlPhase === "running") {
      const result = await rows("SHOW DATABASES");
      for (const [name] of result.rows) {
        if (
          ["mysql", "information_schema", "performance_schema", "sys"].includes(
            name,
          )
        )
          continue;
        const bytes = await exportSQLDatabase(name);
        size += bytes.length;
        if (size > 64 * 1024 * 1024) throw Error("Export limité à 64 Mio.");
        const path =
          ".pbl-backup/database-" + manifest.databases.length + ".sql";
        entries.push({ name: path, bytes });
        manifest.databases.push({ name, path });
      }
    }
    entries.push({
      name: ".pbl-backup/project.json",
      bytes: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
    });
    const bytes = await zipTask("write", entries),
      link = node("a");
    link.href = URL.createObjectURL(
      new Blob([bytes], { type: "application/zip" }),
    );
    link.download = hub.key + ".zip";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    status(
      "Projet exporté : fichiers et bases SQL actives. Les sessions clientes ne sont pas incluses.",
    );
  });
async function exportSQLDatabase(database) {
  const tool = "/workspace/.pbl-export-" + crypto.randomUUID();
  const response = await fetch("/apps/studio/sql-export.source.txt");
  if (!response.ok) throw Error("Outil d’export indisponible.");
  await hub.runtime.write(tool + ".php", await response.text());
  try {
    const result = await hub.runtime.request({
      script: tool + ".php",
      url: new URL(
        "/export.php?database=" + encodeURIComponent(database),
        location.href,
      ).href,
    });
    if (result.exitCode !== 0)
      throw Error(decoder.decode(result.stderr) || "Export SQL échoué.");
    const info = JSON.parse(decoder.decode(result.body));
    if (!info.ok) throw Error("Export SQL incomplet.");
    return await hub.runtime.read(tool + ".php.sql");
  } finally {
    for (const suffix of [".php", ".php.sql"])
      try {
        await hub.runtime.remove(tool + suffix);
      } catch {}
  }
}
async function importProjectArchive(file) {
  if (file.size > 65 * 1024 * 1024)
    throw Error("Archive limitée à 65 Mio compressés.");
  const entries = await zipTask(
      "read",
      new Uint8Array(await file.arrayBuffer()),
    ),
    metadata = entries.find((e) => e.name === ".pbl-backup/project.json");
  let manifest;
  if (metadata) {
    if (metadata.bytes.length > 65536)
      throw Error("Manifeste de projet trop volumineux.");
    manifest = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(metadata.bytes),
    );
    if (
      manifest.format !== "wasmwebserver-project" ||
      manifest.version !== 1 ||
      !Array.isArray(manifest.databases) ||
      manifest.databases.length > 32
    )
      throw Error("Format de sauvegarde non reconnu.");
  }
  // Validate every destination and collision before the first write.
  const imported = entries.filter((e) => !e.name.startsWith(".pbl-backup/")),
    existing = new Set(await files());
  for (const entry of imported) {
    if (
      entry.name
        .split("/")
        .some(
          (p) =>
            !p ||
            p === "." ||
            p === ".sessions" ||
            p === ".git" ||
            p.startsWith(".pbl-"),
        )
    )
      throw Error("Chemin interne refusé dans le ZIP.");
    if (existing.has("/" + entry.name))
      throw Error(
        "Le fichier " +
          entry.name +
          " existe déjà. Importez dans un projet vide pour préserver ses données.",
      );
  }
  const sql = [];
  for (const database of manifest?.databases ?? []) {
    if (
      typeof database.name !== "string" ||
      !database.name ||
      database.name.length > 64 ||
      ["mysql", "information_schema", "performance_schema", "sys"].includes(
        database.name,
      )
    )
      throw Error("Base réservée ou invalide dans le ZIP.");
    const entry = entries.find(
      (e) => e.name === database.path && e.name.startsWith(".pbl-backup/"),
    );
    if (!entry || entry.bytes.length > 8 * 1024 * 1024)
      throw Error("Sauvegarde SQL absente ou supérieure à 8 Mio.");
    sql.push({
      name: database.name,
      statements: splitSQL(
        new TextDecoder("utf-8", { fatal: true }).decode(entry.bytes),
        { maxStatements: 4096 },
      ),
    });
  }
  if (sql.length) {
    const current = await rows("SHOW DATABASES");
    for (const db of sql) {
      if (current.rows.some((r) => r[0] === db.name)) {
        const tables = await rows("SHOW TABLES", db.name);
        if (tables.rows.length)
          throw Error(
            "La base " +
              db.name +
              " contient déjà des tables. Utilisez un projet vide.",
          );
      }
    }
  }
  for (const entry of imported)
    await hub.runtime.call("write", {
      path: "/workspace/" + entry.name,
      data: entry.bytes,
      expected: null,
    });
  // DDL cannot be rolled back as a project-wide transaction: a failed import is reported explicitly.
  dirty = true;
  for (const db of sql) {
    try {
      await rows(
        "CREATE DATABASE IF NOT EXISTS " +
          identifier(db.name) +
          " CHARACTER SET utf8mb4",
      );
      for (let i = 0; i < db.statements.length; i += 32)
        await hub.runtime.sqlScript(db.statements.slice(i, i + 32), db.name);
    } catch (error) {
      throw Error(
        "Import partiel de " +
          db.name +
          " : les fichiers et certaines instructions peuvent être appliqués. " +
          error.message,
      );
    }
  }
}
$("#home-import").onclick = () => $("#home-zip").click();
$("#home-zip").onchange = () => {
  const file = $("#home-zip").files[0];
  if (!file) return;
  return action(async () => {
    if (hub)
      throw Error(
        "Fermez le projet courant avant d’importer un nouveau projet.",
      );
    await openProject();
    await importProjectArchive(file);
    await setTool("editor", "unloaded");
    await setTool("editor", "active");
    await rememberProject();
    status("Projet ZIP importé. Sauvegardez pour le conserver.");
    $("#home-zip").value = "";
  });
};
window.addEventListener("focus", () => {
  if (hub) refreshSessions();
});
window.addEventListener("beforeunload", (event) => {
  if (hub && dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});
const params = new URLSearchParams(location.search);
if (params.has("project")) $("#project").value = params.get("project");
async function initializeStudio() {
  if (!isSecureContext || !navigator.serviceWorker)
    throw Error(
      "Ouvrez le studio en HTTPS ou sur localhost pour activer les projets et fenêtres clientes.",
    );
  const registration = await navigator.serviceWorker.register(
    "/service-worker.js",
    { type: "module", scope: "/" },
  );
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller)
    await new Promise((resolve) =>
      navigator.serviceWorker.addEventListener("controllerchange", resolve, {
        once: true,
      }),
    );
  for (const name of Object.keys(renderers)) await setTool(name, "unloaded");
  await renderProjects();
  status("Prêt à ouvrir un projet.");
}
initializeStudio().catch((error) =>
  shell.error(error, "Initialisation du studio"),
);

async function renderProjects() {
  const projects = (await readState("project-index")) ?? [];
  const box = $("#project-list");
  box.replaceChildren(
    ...projects.map((project) => {
      const row = node("div", { class: "recent-project" }),
        open = node("button", {}, project.key);
      open.onclick = () => {
        $("#project").value = project.key;
        action(openProject);
      };
      const info = node(
        "span",
        { class: "hint" },
        `${project.files ?? 0} fichiers · ${new Intl.DateTimeFormat("fr", { dateStyle: "medium", timeStyle: "short" }).format(new Date(project.updatedAt))}`,
      );
      row.append(open, info);
      return row;
    }),
  );
  if (!projects.length)
    box.append(
      node(
        "p",
        { class: "empty-state" },
        "Aucun projet enregistré ici. Ouvrez un nouveau nom pour commencer.",
      ),
    );
}
async function rememberProject() {
  const projects = (await readState("project-index")) ?? [],
    entry = {
      key: hub.key,
      files: (await files()).length,
      updatedAt: new Date().toISOString(),
    };
  await writeState(
    "project-index",
    [entry, ...projects.filter((p) => p.key !== hub.key)].slice(0, 40),
  );
  await renderProjects();
}

async function flushEditorDrafts() {
  const view = tools.get("editor")?.view,
    current =
      view?.snapshot() ?? (await readState("tool:" + hub.key + ":editor"));
  if (!current) return;
  const drafts = [];
  for (const path of current.openFiles ?? []) {
    if (path === current.path) continue;
    const draft = await readState("draft:" + hub.key + ":" + path);
    if (draft?.dirty) drafts.push(draft);
  }
  if (current.dirty && view) await view.write();
  else if (current.dirty) drafts.push(current);
  for (const draft of drafts) {
    await hub.runtime.call("write", {
      path: "/workspace" + draft.path,
      data: draft.text,
      expected: draft.base ?? null,
    });
    draft.base = draft.text;
    draft.dirty = false;
    await writeState("draft:" + hub.key + ":" + draft.path, draft);
    if (draft.path === current.path)
      await writeState("tool:" + hub.key + ":editor", draft);
    dirty = true;
  }
}
