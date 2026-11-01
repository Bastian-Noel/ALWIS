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
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
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
} from "@codemirror/language";
import {
  autocompletion,
  completionKeymap,
  acceptCompletion,
  closeBrackets,
  closeBracketsKeymap,
} from "@codemirror/autocomplete";
import { lintGutter, setDiagnostics } from "@codemirror/lint";
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
import { JavaScriptService, LspService } from "./services.mjs";
export function createCodeEditor(
  host,
  {
    value = "",
    path = "/index.php",
    label = "Code source",
    onSave = () => {},
    onRun = () => {},
    onStatus = () => {},
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
    lastEngine;
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
      extension = filename.split(".").pop();
    if (!text.trim()) {
      closeServices();
      diagnostics([]);
      status("Écrivez du code pour démarrer l’analyse.");
      return;
    }
    if (text.length > 256 * 1024) {
      closeServices();
      diagnostics([]);
      status("Analyse désactivée au-delà de 256 K caractères.");
      return;
    }
    try {
      if (["js", "jsx", "ts"].includes(extension)) {
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
        );
        if (stamp !== revision || destroyed) return;
        diagnostics(result);
        status("SWC WASM · types JavaScript et jQuery");
      } else if (["php", "html", "htm"].includes(extension)) {
        const engine = extension === "php" ? "php" : "html";
        if (lastEngine !== engine) {
          lspService?.close();
          lastEngine = engine;
          lspService = new LspService(engine, {
            files,
            onDiagnostics: diagnostics,
            onStatus: status,
          });
        }
        if (engine === "php") {
          const errors = [];
          syntaxTree(view.state).iterate({
            enter: (node) => {
              if (node.type.isError && errors.length < 60)
                errors.push({
                  from: node.from,
                  to: node.to,
                  severity: "error",
                  message:
                    "Syntaxe PHP incomplète ou inattendue à cet endroit.",
                });
            },
          });
          diagnostics(errors);
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
    if (filename.endsWith(".php") && phpLanguage.isActiveAt(state, position))
      return "php";
    return (
      { js: "js", jsx: "js", ts: "js", html: "html", htm: "html", php: "php" }[
        filename.split(".").pop()
      ] ?? "other"
    );
  }
  function javascriptDocument(state, position) {
    const text = state.doc.toString();
    if (/\.(js|jsx|ts)$/.test(filename)) return { path: filename, text };
    let part = syntaxTree(state).resolveInner(position, -1);
    while (part.parent && part.name !== "Script") part = part.parent;
    // Keep offsets stable for the JS type service in an HTML/PHP document.
    const masked =
      text.slice(0, part.from).replace(/[^\n\r]/g, " ") +
      text.slice(part.from, part.to) +
      text.slice(part.to).replace(/[^\n\r]/g, " ");
    return { path: filename + ".embedded.js", text: masked };
  }
  const complete = async (context) => {
    if (paused || destroyed) return null;
    const position = context.pos,
      stamp = revision,
      kind = region(context.state, position),
      word = context.matchBefore(/[\w$]*/);
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
      let options = [];
      if (kind === "js") {
        jsService ??= new JavaScriptService();
        const doc = javascriptDocument(context.state, position);
        options = await jsService.call(
          "complete",
          doc.path,
          doc.text,
          position,
          projectDefinitions,
        );
      } else if (kind === "php") {
        if (!lspService || lastEngine !== "php") {
          lspService?.close();
          lastEngine = "php";
          lspService = new LspService("php", { files, onStatus: status });
        }
        options = await lspService.complete(
          filename,
          view.state.doc.toString(),
          position,
        );
      }
      if (stamp !== revision || destroyed) return null;
      return { from: word?.from ?? position, options, validFor: /^[\w$]*$/ };
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
        indentOnInput(),
        closeBrackets(),
        syntaxHighlighting(
          HighlightStyle.define([
            { tag: tags.keyword, color: "#e9c68f" },
            { tag: [tags.string, tags.regexp], color: "#b9d6a5" },
            { tag: tags.comment, color: "#a9b0b6" },
            { tag: [tags.number, tags.bool, tags.null], color: "#c8b6e8" },
            {
              tag: [tags.function(tags.variableName), tags.tagName],
              color: "#9dd4e7",
            },
            { tag: tags.typeName, color: "#dfcfa8" },
          ]),
        ),
        highlightSelectionMatches(),
        lintGutter(),
        autocompletion({ defaultKeymap: false, interactionDelay: 0 }),
        keymap.of([
          { key: "Tab", run: acceptCompletion },
          indentWithTab,
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
        EditorView.contentAttributes.of({ "aria-label": label }),
        EditorView.lineWrapping,
        language.of([]),
        editable.of([]),
        completion.of([]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            revision++;
            if (!silent)
              host.dispatchEvent(new Event("input", { bubbles: true }));
            clearTimeout(timer);
            timer = setTimeout(analyze, 450);
          }
          if (update.selectionSet || update.docChanged)
            host.dispatchEvent(new Event("select"));
        }),
      ],
    }),
  });
  function resetHistory() {
    view.dispatch({ effects: undoHistory.reconfigure([]) });
    view.dispatch({
      effects: undoHistory.reconfigure(history({ minDepth: 20 })),
    });
  }
  function setPath(next) {
    if (next !== filename) {
      resetHistory();
      closeServices();
    }
    filename = next;
    revision++;
    const ext = next.split(".").pop();
    const support = {
      php,
      html,
      htm: html,
      css,
      js: javascript,
      jsx: () => javascript({ jsx: true }),
      ts: () => javascript({ typescript: true }),
      json,
      sql: () => sql({ dialect: MySQL }),
    }[ext];
    view.dispatch({
      effects: [
        language.reconfigure(support ? support() : []),
        completion.reconfigure(
          ext === "sql"
            ? []
            : autocompletion({
                override: [complete],
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
    resetHistory,
    setSQLSchema: (schema, defaultSchema) =>
      view.dispatch({
        effects: language.reconfigure(
          sql({ dialect: MySQL, schema, defaultSchema }),
        ),
      }),
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
      clearTimeout(timer);
      closeServices();
      view.destroy();
    },
  };
  setPath(path);
  return host.codeEditor;
}
