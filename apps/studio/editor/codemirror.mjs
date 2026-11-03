import { ui } from "../workbench/icons.mjs";
import { EditorState, StateField, Compartment } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  rectangularSelection,
  highlightSpecialChars,
  showPanel,
  hoverTooltip,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  toggleComment,
  indentSelection,
} from "@codemirror/commands";
import { tags } from "@lezer/highlight";
import {
  HighlightStyle,
  syntaxTree,
  bracketMatching,
  foldGutter,
  foldKeymap,
  syntaxHighlighting,
  defaultHighlightStyle,
  indentOnInput,
  indentUnit,
} from "@codemirror/language";
import {
  autocompletion,
  CompletionContext,
  completionKeymap,
  acceptCompletion,
  closeBrackets,
  closeBracketsKeymap,
  snippetCompletion,
  snippet,
  nextSnippetField,
  prevSnippetField,
  closeCompletion,
  clearSnippet,
} from "@codemirror/autocomplete";
import {
  lintGutter,
  setDiagnostics,
  openLintPanel,
  nextDiagnostic,
  lintKeymap,
} from "@codemirror/lint";
import {
  searchKeymap,
  highlightSelectionMatches,
  openSearchPanel,
} from "@codemirror/search";
import { php, phpLanguage } from "@codemirror/lang-php";
import {
  html,
  htmlLanguage,
  htmlCompletionSource,
} from "@codemirror/lang-html";
import { css, cssLanguage, cssCompletionSource } from "@codemirror/lang-css";
import {
  javascript,
  javascriptLanguage,
  typescriptLanguage,
  jsxLanguage,
  tsxLanguage,
} from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { sql, MySQL } from "@codemirror/lang-sql";
import { JavaScriptService, LspService, offsetAt } from "./services.mjs";
import { expandAbbreviation, emmetConfig } from "@emmetio/codemirror6-plugin";
import {
  templates,
  documentation,
  snippetTemplate,
  rankOptions,
  textEdits,
} from "./intelligence.mjs";
import { phpDiagnostics, phpVariables } from "./php-diagnostics.mjs";
export function createCodeEditor(
  host,
  {
    toolsHost = null,
    value = "",
    path = "/index.php",
    label = "Code source",
    onSave = () => {},
    onRun = () => {},
    onStatus = () => {},
    onNavigate = () => {},
    files = {},
    projectDefinitions = {},
  } = {},
) {
  const undoHistory = new Compartment(),
    language = new Compartment(),
    editable = new Compartment(),
    completion = new Compartment();
  let filename = path,
    paused = false,
    destroyed = false,
    silent = false,
    timer,
    revision = 0,
    jsService,
    lspService,
    lastEngine,
    signatureTimer,
    signatureBusy = false,
    signatureText = "",
    dismissedAt = -1,
    formatCancel,
    indent = "2";
  const indentation = new Compartment();
  const signaturePanel = new Compartment();
  const navigation = [];
  const status = (message) => {
    host.dataset.serviceStatus = message;
    onStatus(message);
  };
  const diagnostics = (items) => {
    if (destroyed) return;
    const length = view.state.doc.length;
    view.dispatch(
      setDiagnostics(
        view.state,
        items.map((d) => ({
          ...d,
          from: Math.min(length, d.from),
          to: Math.min(length, Math.max(d.from, d.to)),
        })),
      ),
    );
  };
  function closeServices() {
    jsService?.close();
    lspService?.close();
    jsService = lspService = undefined;
    lastEngine = undefined;
  }
  async function analyze() {
    if (paused || destroyed) return;
    const stamp = revision,
      text = view.state.doc.toString(),
      extension = filename.split(".").pop().toLowerCase();
    if (!text.trim()) {
      closeServices();
      diagnostics([]);
      status(
        ["html", "htm"].includes(extension)
          ? "Page HTML : tapez ! puis Entrée pour créer un document en français. Emmet : ul>li*3 puis Tab."
          : "Écrivez du code pour démarrer l’analyse.",
      );
      return;
    }
    if (text.length > 256 * 1024) {
      closeServices();
      diagnostics([]);
      status("Analyse désactivée au-delà de 256 K caractères.");
      return;
    }
    try {
      if (["js", "jsx", "ts", "tsx", "mjs", "cjs"].includes(extension)) {
        if (lastEngine !== "js") {
          lspService?.close();
          lspService = undefined;
          lastEngine = "js";
          jsService ??= new JavaScriptService();
        }
        status("Analyse JavaScript…");
        const result = await jsService.call(
          "diagnostics",
          filename,
          text,
          0,
          projectDefinitions,
          { projectFiles: files },
        );
        if (stamp !== revision || destroyed) return;
        diagnostics(
          result.map((d) => ({
            ...d,
            actions: d.code
              ? [
                  {
                    name: "Chercher une correction",
                    apply: async () => {
                      try {
                        const fixes = await jsService.call(
                          "fixes",
                          filename,
                          text,
                          d.from,
                          projectDefinitions,
                          { projectFiles: files, end: d.to, codes: [d.code] },
                        );
                        if (stamp !== revision || destroyed) return;
                        showResults(
                          "Corrections proposées",
                          fixes.map((fix) => ({
                            label: fix.name,
                            run: () => {
                              if (stamp === revision)
                                view.dispatch({
                                  changes: fix.changes,
                                  userEvent: "input.complete",
                                });
                            },
                          })),
                        );
                      } catch (error) {
                        if (!destroyed) status(error.message);
                      }
                    },
                  },
                ]
              : undefined,
          })),
        );
        status("SWC WASM · types JavaScript et jQuery");
      } else if (["php", "phtml", "inc", "html", "htm"].includes(extension)) {
        const engine = ["php", "phtml", "inc"].includes(extension)
          ? "php"
          : "html";
        if (lastEngine !== engine) {
          lspService?.close();
          lastEngine = engine;
          lspService = new LspService(engine, {
            files,
            onDiagnostics: (items) =>
              diagnostics(
                engine === "php"
                  ? [...phpDiagnostics(view.state.doc.toString()), ...items]
                  : items,
              ),
            onStatus: status,
          });
        }
        if (engine === "php") {
          diagnostics(phpDiagnostics(text));
        }
        status(
          engine === "php"
            ? "Chargement de la complétion PHP…"
            : "Analyse HTML…",
        );
        await lspService.document(filename, text);
        if (stamp !== revision || destroyed) return;
        status(engine === "php" ? "PHP LSP WASM" : "SuperHTML WASM");
      } else {
        closeServices();
        diagnostics([]);
        status(
          extension === "sql"
            ? "SQL · complétion MySQL"
            : "Coloration syntaxique",
        );
      }
    } catch (error) {
      if (stamp === revision && !destroyed) {
        if (extension !== "php") diagnostics([]);
        status(error.message);
      }
    }
  }
  function region(state, position) {
    if (
      javascriptLanguage.isActiveAt(state, position) ||
      typescriptLanguage.isActiveAt(state, position) ||
      jsxLanguage.isActiveAt(state, position) ||
      tsxLanguage.isActiveAt(state, position)
    )
      return "js";
    if (cssLanguage.isActiveAt(state, position)) return "css";
    if (htmlLanguage.isActiveAt(state, position)) return "html";
    if (
      /\.(php|phtml|inc)$/i.test(filename) &&
      phpLanguage.isActiveAt(state, position)
    )
      return "php";
    return (
      {
        js: "js",
        jsx: "js",
        ts: "js",
        tsx: "js",
        mjs: "js",
        cjs: "js",
        html: "html",
        htm: "html",
        php: "php",
        phtml: "php",
        inc: "php",
      }[filename.split(".").pop().toLowerCase()] ?? "other"
    );
  }
  function javascriptDocument(state, position) {
    const text = state.doc.toString();
    if (/\.([cm]?js|jsx|tsx?)$/i.test(filename))
      return { path: filename, text };
    let part = syntaxTree(state).resolveInner(position, -1);
    while (part.parent && part.name !== "Script") part = part.parent;
    // Keep offsets stable for the JS type service in an HTML/PHP document.
    const masked =
      text.slice(0, part.from).replace(/[^\n\r]/g, " ") +
      text.slice(part.from, part.to) +
      text.slice(part.to).replace(/[^\n\r]/g, " ");
    return { path: filename + ".embedded.js", text: masked };
  }
  const localTemplates = (context) => {
    if (paused || destroyed) return null;
    const word = context.matchBefore(/[\w$]+/);
    if (
      !word ||
      !word.text ||
      /[.$>:]$/.test(
        context.state.sliceDoc(Math.max(0, word.from - 1), word.from),
      )
    )
      return null;
    const node = syntaxTree(context.state).resolveInner(context.pos, -1);
    if (/Comment|String/.test(node.name)) return null;
    const options = (templates[region(context.state, context.pos)] ?? [])
      .filter(([label]) => label.startsWith(word.text))
      .map(([label, body, detail]) =>
        snippetCompletion(body, {
          label,
          type: "keyword",
          detail,
          boost: 99,
          info: "Tab : insérer la structure puis parcourir les champs. Maj+Tab : champ précédent.",
        }),
      );
    return options.length
      ? { from: word.from, options, validFor: /^\w*$/ }
      : null;
  };
  function expandStructure(editor) {
    const context = new CompletionContext(
      editor.state,
      editor.state.selection.main.head,
      true,
    );
    if (!editor.state.selection.main.empty) return false;
    const result = localTemplates(context);
    const word = context.matchBefore(/[\w$]+/);
    const option = result?.options.find((o) => o.label === word?.text);
    if (!option) return false;
    closeCompletion(editor);
    option.apply(editor, option, result.from, context.pos);
    return true;
  }
  const complete = async (context) => {
    if (paused || destroyed || (!context.explicit && dismissedAt === revision))
      return null;
    const position = context.pos,
      stamp = revision,
      kind = region(context.state, position),
      word = context.matchBefore(/[\w$]*/);
    const node = syntaxTree(context.state).resolveInner(position, -1);
    if (/Comment/.test(node.name)) return null;
    if (/String/.test(node.name) && kind !== "html" && kind !== "css") {
      // Semantic providers still handle object keys; do not show generic templates in strings.
      if (kind === "php") return null;
    }
    if (kind === "html") return htmlCompletionSource(context);
    if (kind === "css") return cssCompletionSource(context);
    if (kind === "other") {
      for (const source of context.state.languageDataAt(
        "autocomplete",
        position,
      )) {
        if (typeof source === "function") {
          const result = await source(context);
          if (result) return result;
        }
      }
      return null;
    }
    if (
      !context.explicit &&
      !word?.text &&
      !/[.$>]$/.test(
        context.state.sliceDoc(Math.max(0, position - 2), position),
      )
    )
      return null;
    try {
      let options = [],
        requestPath = filename,
        requestText = context.state.doc.toString();
      if (kind === "js") {
        jsService ??= new JavaScriptService();
        const doc = javascriptDocument(context.state, position);
        requestPath = doc.path;
        requestText = doc.text;
        options = await jsService.call(
          "complete",
          doc.path,
          doc.text,
          position,
          projectDefinitions,
          { projectFiles: files },
        );
      } else if (kind === "php") {
        if (!lspService || lastEngine !== "php") {
          lspService?.close();
          lastEngine = "php";
          lspService = new LspService("php", {
            files,
            onStatus: status,
            onDiagnostics: (items) =>
              diagnostics([
                ...phpDiagnostics(view.state.doc.toString()),
                ...items,
              ]),
          });
        }
        options = await lspService.complete(
          filename,
          view.state.doc.toString(),
          position,
        );
      }
      if (stamp !== revision || destroyed) return null;
      const text = context.state.doc.toString();
      options = options.map((option) => {
        const item = option.lsp;
        let result = { ...option };
        if (
          !item &&
          ["function", "method"].includes(option.type) &&
          /^[a-zA-Z_$][\w$]*$/.test(option.label) &&
          !/^\s*\(/.test(text.slice(position))
        ) {
          result.apply = snippet(option.label + "(${0})");
        }
        if (item) {
          const template =
            item.insertTextFormat === 2
              ? snippetTemplate(
                  item.textEdit?.newText ?? item.insertText ?? item.label,
                )
              : null;
          if (template) result = { ...result, apply: snippet(template) };
          else if (item.textEdit && item.insertTextFormat !== 2)
            result.apply = item.textEdit.newText;
          // Respect LSP replacement ranges, without applying unreviewed cross-file edits.
          const range = item.textEdit?.range ?? item.textEdit?.replace;
          if (range) {
            const apply = result.apply;
            result.apply = (editor, completion, from, to) => {
              if (editor.state.doc.toString() !== text) return;
              from = offsetAt(text, range.start);
              to = offsetAt(text, range.end);
              if (typeof apply === "function")
                apply(editor, completion, from, to);
              else
                editor.dispatch({
                  changes: { from, to, insert: apply ?? item.label },
                  selection: { anchor: from + (apply ?? item.label).length },
                  userEvent: "input.complete",
                });
            };
          }
        }
        result.info = async () => {
          if (stamp !== revision || destroyed) return "";
          try {
            const detail = item
              ? await lspService.details(item)
              : await jsService.call(
                  "details",
                  requestPath,
                  requestText,
                  position,
                  projectDefinitions,
                  { projectFiles: files, name: option.label },
                );
            return document.createTextNode(
              [
                detail?.detail,
                documentation(detail?.documentation ?? option.info),
              ]
                .filter(Boolean)
                .join("\n\n"),
            );
          } catch {
            return document.createTextNode(option.detail ?? "");
          }
        };
        return result;
      });
      const prefix = word?.text ?? "";
      if (kind === "php" && prefix.startsWith("$"))
        options = [
          ...phpVariables(text, position).map((label) => ({
            label,
            type: "variable",
            detail: "Variable du contexte local",
            boost: 30,
          })),
          ...options,
        ];
      options = rankOptions(
        options,
        prefix,
        kind === "php" && prefix.startsWith("$"),
      );
      return { from: word?.from ?? position, options };
    } catch (error) {
      status(error.message);
      return null;
    }
  };
  const encoder = new TextEncoder(),
    maxBytes = 1024 * 1024;
  const nextBytes = (value, transaction) => {
    transaction.changes.iterChanges((from, to, _from, _to, inserted) => {
      value -= encoder.encode(
        transaction.startState.doc.sliceString(from, to),
      ).length;
      value += encoder.encode(inserted.toString()).length;
    });
    return value;
  };
  const documentBytes = StateField.define({
    create: (state) => encoder.encode(state.doc.toString()).length,
    update: (value, transaction) =>
      transaction.docChanged ? nextBytes(value, transaction) : value,
  });
  const toolsPanel = new Compartment(),
    resultsPanel = new Compartment();
  function hideSignature() {
    if (!signatureText || destroyed) return;
    signatureText = "";
    view.dispatch({ effects: signaturePanel.reconfigure([]) });
  }
  function showResults(title, items, message) {
    if (destroyed) return;
    view.dispatch({
      effects: resultsPanel.reconfigure(
        showPanel.of(() => {
          const dom = document.createElement("section");
          dom.className = "cm-help-results";
          dom.setAttribute("aria-label", title);
          const heading = document.createElement("strong");
          heading.textContent = title;
          dom.append(heading);
          const close = document.createElement("button");
          close.textContent = "Fermer";
          close.onclick = () => {
            view.dispatch({ effects: resultsPanel.reconfigure([]) });
            view.focus();
          };
          dom.append(close);
          if (!items.length)
            dom.append(
              document.createTextNode(message ?? " Aucun résultat disponible."),
            );
          for (const item of items.slice(0, 100)) {
            const button = document.createElement("button");
            button.textContent = item.label;
            button.onclick = () => {
              try {
                item.run();
              } catch (error) {
                status(error.message);
              }
            };
            dom.append(button);
          }
          return { dom, top: false };
        }),
      ),
    });
  }
  function createTools() {
    const dom = document.createElement("div");
    dom.className = "cm-editor-tools";
    dom.setAttribute("role", "toolbar");
    dom.setAttribute("aria-label", "Outils du code");
    for (const [label, run] of [
      ["Formater", formatDocument],
      ["Emmet", emmetCommand],
      ["Problèmes", () => openLintPanel(view)],
      ["Définition", () => navigate("definition")],
      ["Références", () => navigate("references")],
      ["Paramètres", signatureHelp],
      ["Rechercher", () => openSearchPanel(view)],
      ["Symboles", outline],
      ["Projet", projectSearch],
      ["Renommer", renameSymbol],
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.innerHTML =
        label === "Formater"
          ? ui.format
          : label === "Problèmes"
            ? ui.warning + "<span>Problèmes</span>"
            : label;
      button.setAttribute(
        "aria-label",
        label === "Formater" ? "Mettre en forme le fichier" : label,
      );
      button.dataset.tool = label;
      if (label === "Formater") button.title = "Mettre en forme le fichier";
      if (label === "Problèmes")
        button.title = "Afficher les erreurs et avertissements du fichier";
      if (label === "Emmet")
        button.title =
          "HTML : ! puis Entrée crée une page en français ; ul>li*3 puis Tab. CSS : m10 puis Tab.";
      button.onclick = () => {
        Promise.resolve(run()).catch((error) => status(error.message));
      };
      dom.append(button);
    }
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Indentation du code");
    for (const [value, label] of [
      ["2", "2 espaces"],
      ["4", "4 espaces"],
      ["tabs", "Tabulations"],
    ]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.append(option);
    }
    select.value = indent;
    select.onchange = () => {
      indent = select.value;
      view.dispatch({
        effects: indentation.reconfigure(
          indentUnit.of(indent === "tabs" ? "\t" : " ".repeat(Number(indent))),
        ),
      });
      view.focus();
    };
    select.hidden = true;
    dom.append(select);
    return dom;
  }
  async function formatDocument() {
    if (paused || destroyed || formatCancel) return false;
    const text = view.state.doc.toString(),
      stamp = revision,
      requestPath = filename;
    if (text.length > 262144) {
      status("Formatage limité à 256 K caractères.");
      return false;
    }
    const worker = new Worker(
      new URL("./formatter-worker.mjs", import.meta.url),
      { type: "module" },
    );
    status("Mise en forme en cours…");
    try {
      const result = await new Promise((resolve, reject) => {
        formatCancel = () => reject(Error("Mise en forme annulée."));
        worker.onmessage = ({ data }) =>
          data.error ? reject(Error(data.error)) : resolve(data.text);
        worker.onerror = () =>
          reject(Error("Impossible de charger le formateur."));
        worker.postMessage({ text, path: requestPath, indent });
        worker.formatTimeout = setTimeout(
          () =>
            reject(
              Error(
                "Le formatage a dépassé 10 secondes. La saisie est conservée.",
              ),
            ),
          10000,
        );
      });
      if (
        destroyed ||
        paused ||
        stamp !== revision ||
        filename !== requestPath
      ) {
        if (!destroyed)
          status("Le document a changé : résultat du formatage ignoré.");
        return false;
      }
      if (result !== text)
        view.dispatch({
          changes: { from: 0, to: text.length, insert: result },
          userEvent: "input.format",
        });
      status("Mise en forme terminée. Ctrl+Z pour annuler.");
      view.focus();
      return true;
    } catch (error) {
      if (!destroyed) {
        status(error.message);
        showResults(
          "Mise en forme impossible — saisie conservée",
          [],
          error.message,
        );
      }
      return false;
    } finally {
      clearTimeout(worker.formatTimeout);
      worker.terminate();
      formatCancel = null;
    }
  }
  function emmetCommand() {
    if (expandMarkup(view)) return true;
    status(
      "Emmet : tapez une abréviation comme ! ou ul>li*3 en HTML, puis Tab ou Emmet.",
    );
    showResults(
      "Développer Emmet",
      [],
      "Placez le curseur après une abréviation HTML/CSS, hors commentaire, chaîne et code PHP. Exemple : ! puis Entrée dans un fichier HTML vide ; ul>li*3 puis Tab. La sélection doit être vide.",
    );
    return false;
  }
  function expandMarkup(editor) {
    const position = editor.state.selection.main.head,
      kind = region(editor.state, position);
    const node = syntaxTree(editor.state).resolveInner(position, -1);
    if (
      !["html", "css"].includes(kind) ||
      /Comment|String|AttributeValue/.test(node.name) ||
      !editor.state.selection.main.empty
    )
      return false;
    try {
      const expanded = expandAbbreviation(editor);
      if (expanded) {
        closeCompletion(editor);
        editor.focus();
      }
      return expanded;
    } catch {
      return false;
    }
  }
  async function signatureHelp() {
    if (paused || destroyed || signatureBusy || dismissedAt === revision)
      return;
    signatureBusy = true;
    const stamp = revision,
      position = view.state.selection.main.head,
      kind = region(view.state, position);
    let result;
    try {
      if (kind === "js") {
        jsService ??= new JavaScriptService();
        const doc = javascriptDocument(view.state, position);
        result = await jsService.call(
          "signature",
          doc.path,
          doc.text,
          position,
          projectDefinitions,
          { projectFiles: files },
        );
      } else if (kind === "php" && lspService)
        result = await lspService.signature(
          filename,
          view.state.doc.toString(),
          position,
        );
      if (
        stamp !== revision ||
        destroyed ||
        dismissedAt === revision ||
        position !== view.state.selection.main.head
      )
        return;
      const signature = result?.signatures?.[result.activeSignature ?? 0];
      if (!signature) {
        hideSignature();
        return;
      }
      const active = result.activeParameter ?? signature.activeParameter ?? 0,
        parameter = signature.parameters?.[active];
      const label = Array.isArray(parameter?.label)
        ? signature.label.slice(...parameter.label)
        : parameter?.label;
      const content =
        signature.label +
        (label ? "\nParamètre " + (active + 1) + " : " + label : "") +
        "\n" +
        documentation(parameter?.documentation ?? signature.documentation);
      if (content === signatureText) return;
      signatureText = content;
      view.dispatch({
        effects: signaturePanel.reconfigure(
          showPanel.of(() => {
            const dom = document.createElement("div");
            dom.className = "cm-signature";
            dom.setAttribute("aria-label", "Signature de la fonction");
            dom.textContent = content;
            return { dom, top: false };
          }),
        ),
      });
    } catch (error) {
      if (stamp === revision && !destroyed) status(error.message);
    } finally {
      signatureBusy = false;
      if (
        !destroyed &&
        !paused &&
        (stamp !== revision || position !== view.state.selection.main.head)
      ) {
        clearTimeout(signatureTimer);
        signatureTimer = setTimeout(signatureHelp, 250);
      }
    }
  }
  function jump(target) {
    if (view.state.doc.length <= 65536)
      files[filename] = view.state.doc.toString();
    navigation.push({ path: filename, from: view.state.selection.main.head });
    if (navigation.length > 30) navigation.shift();
    if (target.path === filename) {
      view.dispatch({
        selection: { anchor: Math.min(view.state.doc.length, target.from) },
        scrollIntoView: true,
      });
      view.focus();
    } else onNavigate(target);
  }
  function goBack() {
    const target = navigation.pop();
    if (!target) return false;
    if (target.path === filename) {
      view.dispatch({
        selection: { anchor: Math.min(view.state.doc.length, target.from) },
        scrollIntoView: true,
      });
    } else onNavigate(target);
    return true;
  }
  async function navigate(operation) {
    const stamp = revision,
      position = view.state.selection.main.head,
      kind = region(view.state, position);
    let targets = [];
    try {
      if (kind === "js") {
        jsService ??= new JavaScriptService();
        const doc = javascriptDocument(view.state, position);
        targets = await jsService.call(
          operation,
          doc.path,
          doc.text,
          position,
          projectDefinitions,
          { projectFiles: files },
        );
        targets = targets.map((t) => ({
          ...t,
          path: t.path === doc.path ? filename : t.path,
        }));
      } else if (kind === "php" && lspService) {
        await lspService.ready;
        if (
          !lspService.capabilities[
            operation === "definition"
              ? "definitionProvider"
              : "referencesProvider"
          ]
        ) {
          status("Cette navigation n’est pas disponible dans le service PHP.");
          return;
        }
        const result = await lspService.query(
          "textDocument/" + operation,
          filename,
          view.state.doc.toString(),
          position,
          operation === "references"
            ? { context: { includeDeclaration: true } }
            : {},
        );
        targets = (
          Array.isArray(result) ? result : result ? [result] : []
        ).flatMap((item) => {
          const uri = item.uri ?? item.targetUri;
          if (!uri?.startsWith("file:///workspace/")) return [];
          const path = decodeURIComponent(
              uri.slice("file:///workspace".length),
            ),
            text = path === filename ? view.state.doc.toString() : files[path];
          if (text === undefined) return [];
          return [
            {
              path,
              from: offsetAt(
                text,
                (item.range ?? item.targetSelectionRange).start,
              ),
            },
          ];
        });
      }
      if (stamp !== revision || destroyed) return;
      if (operation === "definition" && targets.length === 1) jump(targets[0]);
      else
        showResults(
          operation === "definition" ? "Définitions" : "Références",
          targets.map((target) => ({
            label: target.path + " · position " + target.from,
            run: () => jump(target),
          })),
        );
    } catch (error) {
      status(error.message);
    }
  }
  function renameSymbol() {
    const stamp = revision,
      position = view.state.selection.main.head,
      kind = region(view.state, position),
      text = view.state.doc.toString();
    if (!["php", "js"].includes(kind)) {
      status("Renommage sémantique disponible pour PHP et JavaScript.");
      return;
    }
    view.dispatch({
      effects: resultsPanel.reconfigure(
        showPanel.of(() => {
          const dom = document.createElement("form");
          dom.className = "cm-help-results";
          const label = document.createElement("label");
          label.textContent = "Nouveau nom du symbole ";
          const input = document.createElement("input");
          input.required = true;
          input.maxLength = 100;
          label.append(input);
          const button = document.createElement("button");
          button.type = "submit";
          button.textContent = "Prévisualiser";
          const message = document.createElement("p");
          message.setAttribute("role", "status");
          dom.append(label, button, message);
          dom.onsubmit = async (event) => {
            event.preventDefault();
            if (stamp !== revision) {
              message.textContent = "Le code a changé. Relancez le renommage.";
              return;
            }
            const name = input.value;
            if (!/^\$?[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
              message.textContent = "Utilisez un nom de symbole valide.";
              return;
            }
            button.disabled = true;
            try {
              let changes = [];
              if (kind === "js") {
                jsService ??= new JavaScriptService();
                const doc = javascriptDocument(view.state, position);
                const locations = await jsService.call(
                  "rename",
                  doc.path,
                  doc.text,
                  position,
                  projectDefinitions,
                  { projectFiles: files, name },
                );
                if (locations.some((item) => item.path !== doc.path))
                  throw Error(
                    "Ce renommage touche plusieurs fichiers. Il nécessite une édition coordonnée du projet, non disponible ici.",
                  );
                changes = locations.map(({ from, to, insert }) => ({
                  from,
                  to,
                  insert,
                }));
              } else if (lspService) {
                await lspService.ready;
                if (!lspService.capabilities.renameProvider)
                  throw Error("Le service PHP ne propose pas ce renommage.");
                const result = await lspService.query(
                  "textDocument/rename",
                  filename,
                  text,
                  position,
                  { newName: name },
                );
                const sets = Object.entries(result?.changes ?? {});
                for (const change of result?.documentChanges ?? []) {
                  if (!change.textDocument)
                    throw Error(
                      "Modification de fichiers non prise en charge.",
                    );
                  sets.push([change.textDocument.uri, change.edits]);
                }
                if (
                  sets.some(
                    ([uri]) =>
                      decodeURIComponent(uri) !==
                      "file:///workspace" + filename,
                  )
                )
                  throw Error(
                    "Ce renommage touche plusieurs fichiers. Il nécessite une édition coordonnée du projet, non disponible ici.",
                  );
                changes = textEdits(
                  text,
                  sets.flatMap(([, edits]) => edits),
                  offsetAt,
                );
              }
              if (stamp !== revision || destroyed) return;
              if (!changes.length) {
                message.textContent =
                  "Aucun renommage disponible à cet emplacement.";
                return;
              }
              showResults(
                "Renommer : " +
                  changes.length +
                  " occurrence(s) dans " +
                  filename,
                [
                  ...changes.map((change) => ({
                    label:
                      "Ligne " +
                      text.slice(0, change.from).split("\n").length +
                      " : " +
                      text.slice(change.from, change.to) +
                      " → " +
                      change.insert,
                    run: () => {
                      view.dispatch({
                        selection: { anchor: change.from },
                        scrollIntoView: true,
                      });
                    },
                  })),
                  {
                    label: "Appliquer le renommage",
                    run: () => {
                      if (stamp !== revision) {
                        status("Le code a changé. Relancez le renommage.");
                        return;
                      }
                      view.dispatch({
                        changes,
                        userEvent: "input.complete",
                        effects: resultsPanel.reconfigure([]),
                      });
                      view.focus();
                    },
                  },
                ],
              );
            } catch (error) {
              message.textContent = error.message;
            } finally {
              button.disabled = false;
            }
          };
          return { dom, top: false };
        }),
      ),
    });
  }
  function projectSearch() {
    view.dispatch({
      effects: resultsPanel.reconfigure(
        showPanel.of(() => {
          const dom = document.createElement("form");
          dom.className = "cm-help-results";
          const label = document.createElement("label");
          label.textContent = "Rechercher dans les fichiers indexés ";
          const input = document.createElement("input");
          input.type = "search";
          input.maxLength = 200;
          label.append(input);
          const submit = document.createElement("button");
          submit.textContent = "Rechercher";
          submit.type = "submit";
          dom.append(label, submit);
          dom.onsubmit = (event) => {
            event.preventDefault();
            const query = input.value;
            if (!query) return;
            const matches = [];
            for (const [path, text] of Object.entries({
              ...files,
              [filename]: view.state.doc.toString(),
            })) {
              let start = 0,
                index;
              while (
                matches.length < 100 &&
                (index = text.indexOf(query, start)) !== -1
              ) {
                const from = index;
                matches.push({
                  label:
                    path +
                    " · ligne " +
                    text.slice(0, index).split("\n").length +
                    " : " +
                    text.slice(index, index + 90).split("\n")[0],
                  run: () => jump({ path, from }),
                });
                start = index + query.length;
              }
              if (matches.length >= 100) break;
            }
            showResults(
              "Recherche dans les fichiers indexés (100 résultats maximum)",
              matches,
            );
          };
          return { dom, top: false };
        }),
      ),
    });
  }
  function outline() {
    const entries = [];
    syntaxTree(view.state).iterate({
      enter(node) {
        if (entries.length >= 100) return false;
        if (
          /^(FunctionDeclaration|ClassDeclaration|MethodDeclaration|FunctionDefinition|ClassDefinition|MethodDefinition)$/.test(
            node.name,
          )
        ) {
          entries.push({
            label: view.state
              .sliceDoc(node.from, Math.min(node.to, node.from + 120))
              .split(/[\n{]/)[0],
            run: () => jump({ path: filename, from: node.from }),
          });
        }
      },
    });
    showResults("Symboles du fichier", entries);
  }
  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: value,
      extensions: [
        documentBytes,
        EditorState.changeFilter.of((transaction) => {
          if (
            transaction.docChanged &&
            nextBytes(
              transaction.startState.field(documentBytes),
              transaction,
            ) > maxBytes
          ) {
            status(
              "Édition limitée à 1 Mio UTF-8. Découpez le fichier ou réduisez le collage.",
            );
            return false;
          }
          return true;
        }),
        EditorState.phrases.of({
          Find: "Rechercher",
          Replace: "Remplacer",
          next: "Suivant",
          previous: "Précédent",
          all: "Tout",
          "match case": "Respecter la casse",
          "by word": "Mot entier",
          replace: "Remplacer",
          "replace all": "Tout remplacer",
          close: "Fermer",
          "Control character": "Caractère de contrôle",
          Diagnostics: "Diagnostics",
          "No diagnostics": "Aucun diagnostic",
        }),
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        drawSelection(),
        rectangularSelection(),
        highlightSpecialChars(),
        undoHistory.of(history({ minDepth: 20 })),
        foldGutter(),
        bracketMatching(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        indentation.of(indentUnit.of("  ")),
        closeBrackets(),
        syntaxHighlighting(
          HighlightStyle.define([
            { tag: tags.keyword, color: "var(--t-k, #e9c68f)" },
            { tag: [tags.string, tags.regexp], color: "var(--t-s, #b9d6a5)" },
            { tag: tags.comment, color: "var(--t-c, #a9b0b6)" },
            {
              tag: [tags.number, tags.bool, tags.null],
              color: "var(--t-n, #c8b6e8)",
            },
            {
              tag: [tags.function(tags.variableName), tags.tagName],
              color: "var(--t-g, #9dd4e7)",
            },
            { tag: tags.typeName, color: "var(--t-n, #dfcfa8)" },
            { tag: tags.variableName, color: "var(--ink, #d6e3ed)" },
            { tag: tags.propertyName, color: "var(--t-g, #b7d8ea)" },
            { tag: tags.attributeName, color: "var(--t-s, #d5c6a1)" },
            {
              tag: [tags.operator, tags.punctuation],
              color: "var(--ink-2, #c5cbd2)",
            },
          ]),
        ),
        highlightSelectionMatches(),
        lintGutter(),
        hoverTooltip(
          async (editor, position) => {
            const stamp = revision,
              kind = region(editor.state, position);
            let content;
            if (paused || destroyed || !["php", "js"].includes(kind))
              return null;
            try {
              if (kind === "js") {
                jsService ??= new JavaScriptService();
                const doc = javascriptDocument(editor.state, position);
                content = await jsService.call(
                  "hover",
                  doc.path,
                  doc.text,
                  position,
                  projectDefinitions,
                  { projectFiles: files },
                );
              } else if (lspService) {
                await lspService.ready;
                if (lspService.capabilities.hoverProvider)
                  content = documentation(
                    (
                      await lspService.query(
                        "textDocument/hover",
                        filename,
                        editor.state.doc.toString(),
                        position,
                      )
                    )?.contents,
                  );
              }
            } catch {
              return null;
            }
            if (stamp !== revision || destroyed || !content) return null;
            return {
              pos: position,
              above: true,
              create() {
                const dom = document.createElement("div");
                dom.className = "cm-completionInfo";
                dom.textContent = content.slice(0, 6000);
                return { dom };
              },
            };
          },
          { hoverTime: 500 },
        ),
        signaturePanel.of([]),
        resultsPanel.of([]),
        EditorView.theme({
          ".cm-panels": { backgroundColor: "#20262d", color: "#e6edf3" },
          ".cm-panels button": {
            backgroundColor: "#303944",
            color: "#e6edf3",
            border: "1px solid #768390",
          },
          ".cm-panels input": {
            backgroundColor: "#161b22",
            color: "#e6edf3",
            border: "1px solid #768390",
          },
          ".cm-panels button:focus-visible, .cm-panels input:focus-visible": {
            outline: "2px solid #9dd4e7",
            outlineOffset: "2px",
          },
          ".cm-editor-tools": {
            display: "flex",
            flexWrap: "wrap",
            gap: "4px",
            padding: "4px",
          },
          ".cm-signature": {
            padding: "6px 10px",
            whiteSpace: "pre-wrap",
            maxHeight: "110px",
            overflow: "auto",
          },
          ".cm-help-results": {
            padding: "8px",
            maxHeight: "220px",
            overflow: "auto",
          },
          ".cm-help-results button": {
            display: "block",
            maxWidth: "100%",
            whiteSpace: "normal",
            textAlign: "left",
          },
          ".cm-completionInfo": {
            whiteSpace: "pre-wrap",
            maxWidth: "min(440px, 80vw)",
            maxHeight: "260px",
            overflow: "auto",
          },
        }),
        emmetConfig.of({
          markupStyle: "html",
          config: { markup: { variables: { lang: "fr" } } },
        }),
        toolsPanel.of(
          toolsHost
            ? []
            : showPanel.of(() => ({ dom: createTools(), top: true })),
        ),
        autocompletion({ defaultKeymap: false, interactionDelay: 0 }),
        keymap.of([
          { key: "Tab", run: nextSnippetField },
          { key: "Shift-Tab", run: prevSnippetField },
          { key: "Tab", run: expandStructure },
          { key: "Tab", run: expandMarkup },
          { key: "Tab", run: acceptCompletion },
          { key: "Mod-Shift-m", run: expandMarkup },
          {
            key: "Enter",
            run: (editor) =>
              editor.state.doc.toString().trim() === "!" &&
              region(editor.state, editor.state.selection.main.head) === "html"
                ? expandMarkup(editor)
                : false,
          },
          {
            key: "Escape",
            run: (editor) => {
              dismissedAt = revision;
              hideSignature();
              return closeCompletion(editor);
            },
          },
          { key: "Mod-/", run: toggleComment },
          {
            key: "Alt-Shift-f",
            run: () => {
              void formatDocument();
              return true;
            },
          },
          {
            key: "Mod-Shift-Space",
            run: () => {
              signatureHelp();
              return true;
            },
          },
          {
            key: "F2",
            run: () => {
              renameSymbol();
              return true;
            },
          },
          {
            key: "F12",
            run: () => {
              navigate("definition");
              return true;
            },
          },
          {
            key: "Shift-F12",
            run: () => {
              navigate("references");
              return true;
            },
          },
          { key: "Alt-ArrowLeft", run: goBack },
          ...lintKeymap,
          indentWithTab,
          toggleComment,
          indentSelection,
          {
            key: "Mod-s",
            run: () => {
              onSave();
              return true;
            },
          },
          {
            key: "Mod-Enter",
            run: () => {
              onRun();
              return true;
            },
          },
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...searchKeymap,
          ...completionKeymap.filter((binding) => binding.key !== "Enter"),
        ]),
        EditorView.contentAttributes.of({
          "aria-label": label,
          "aria-description":
            "Pour quitter l’éditeur au clavier, appuyez sur Échap puis Tab.",
        }),
        EditorView.lineWrapping,
        language.of([]),
        editable.of([]),
        completion.of([]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            revision++;
            clearTimeout(signatureTimer);
            signatureTimer = setTimeout(signatureHelp, 250);
            if (!silent)
              host.dispatchEvent(new Event("input", { bubbles: true }));
            clearTimeout(timer);
            timer = setTimeout(analyze, 450);
          }
          if (update.selectionSet || update.docChanged) {
            host.dispatchEvent(new Event("select"));
            if (update.selectionSet) {
              clearTimeout(signatureTimer);
              signatureTimer = setTimeout(signatureHelp, 250);
            }
          }
        }),
      ],
    }),
  });
  if (toolsHost) toolsHost.replaceChildren(createTools());
  view.scrollDOM.tabIndex = 0;
  function resetHistory() {
    view.dispatch({ effects: undoHistory.reconfigure([]) });
    view.dispatch({
      effects: undoHistory.reconfigure(history({ minDepth: 20 })),
    });
  }
  function setPath(next) {
    clearSnippet(view);
    closeCompletion(view);
    if (next !== filename) {
      view.dispatch({ effects: resultsPanel.reconfigure([]) });
      resetHistory();
      closeServices();
    }
    filename = next;
    revision++;
    const ext = next.split(".").pop().toLowerCase();
    hideSignature();
    const support = {
      php,
      phtml: php,
      inc: php,
      html,
      htm: html,
      css,
      js: javascript,
      mjs: javascript,
      cjs: javascript,
      jsx: () => javascript({ jsx: true }),
      ts: () => javascript({ typescript: true }),
      tsx: () => javascript({ typescript: true, jsx: true }),
      json,
      sql: () => sql({ dialect: MySQL, upperCaseKeywords: true }),
    }[ext];
    view.dispatch({
      effects: [
        language.reconfigure(support ? support() : []),
        completion.reconfigure(
          ext === "sql"
            ? []
            : autocompletion({
                override: [localTemplates, complete],
                defaultKeymap: false,
                interactionDelay: 0,
              }),
        ),
      ],
    });
    clearTimeout(timer);
    timer = setTimeout(analyze, 0);
    host.dispatchEvent(new Event("select"));
  }
  Object.defineProperties(host, {
    value: {
      configurable: true,
      get: () => view.state.doc.toString(),
      set: (text) => {
        if (encoder.encode(text).length > maxBytes)
          throw Error(
            "Édition limitée à 1 Mio par fichier. Téléchargez ou découpez ce fichier.",
          );
        clearSnippet(view);
        closeCompletion(view);
        silent = true;
        try {
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: text },
          });
        } finally {
          silent = false;
        }
      },
    },
    selectionStart: {
      configurable: true,
      get: () => view.state.selection.main.from,
      set: (value) =>
        view.dispatch({
          selection: {
            anchor: Math.min(view.state.doc.length, Math.max(0, value)),
          },
        }),
    },
    selectionEnd: {
      configurable: true,
      get: () => view.state.selection.main.to,
      set: (value) =>
        view.dispatch({
          selection: {
            anchor: view.state.selection.main.from,
            head: Math.min(view.state.doc.length, Math.max(0, value)),
          },
        }),
    },
  });
  host.codeEditor = {
    view,
    setPath,
    chooseIndent: () => {
      const select = (toolsHost || host).querySelector(
        '[aria-label="Indentation du code"]',
      );
      if (!select) return;
      select.hidden = false;
      select.focus();
      select.onblur = () => {
        select.hidden = true;
      };
      select.onkeydown = (event) => {
        if (event.key === "Escape") {
          select.hidden = true;
          view.focus();
        }
      };
    },
    resetHistory,
    setSQLSchema: (schema, defaultSchema) =>
      view.dispatch({
        effects: language.reconfigure(
          sql({
            dialect: MySQL,
            schema,
            defaultSchema,
            upperCaseKeywords: true,
          }),
        ),
      }),
    updateProjectFile: (path, text) => {
      delete files[path];
      if (text.length <= 65536) {
        files[path] = text;
        let total = Object.values(files).reduce((sum, t) => sum + t.length, 0);
        for (const key of Object.keys(files)) {
          if (Object.keys(files).length <= 64 && total <= 1024 * 1024) break;
          if (key !== path) {
            total -= files[key].length;
            delete files[key];
          }
        }
      }
    },
    setProjectContext: (context) => {
      files = context.files ?? {};
      projectDefinitions = context.projectDefinitions ?? {};
      closeServices();
      clearTimeout(timer);
      timer = setTimeout(analyze, 450);
    },
    getLanguageAt: (position) =>
      region(view.state, position ?? view.state.selection.main.head),
    getSelection: () =>
      view.state.sliceDoc(
        view.state.selection.main.from,
        view.state.selection.main.to,
      ),
    search: () => openSearchPanel(view),
    problems: () => openLintPanel(view),
    signatureHelp,
    format: formatDocument,
    emmet: emmetCommand,
    navigate,
    outline,
    projectSearch,
    renameSymbol,
    setReadOnly: (readOnly) => {
      paused = readOnly;
      revision++;
      if (readOnly) {
        clearTimeout(timer);
        closeServices();
        status("Analyse en veille.");
      } else {
        clearTimeout(timer);
        timer = setTimeout(analyze, 450);
      }
      view.dispatch({
        effects: editable.reconfigure([
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
        ]),
      });
    },
    destroy: () => {
      destroyed = true;
      formatCancel?.();
      clearTimeout(timer);
      clearTimeout(signatureTimer);
      closeServices();
      if (toolsHost) toolsHost.replaceChildren();
      view.destroy();
    },
  };
  setPath(path);
  return host.codeEditor;
}
