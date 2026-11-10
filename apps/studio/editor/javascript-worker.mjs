/*! ALWIS original adapter — Copyright (c) 2026 Bastian Noël. SPDX-License-Identifier: MIT. See licenses/ALWIS-MIT.txt. */
import ts from "typescript";
import initSWC, { parseSync } from "@swc/wasm-web";
const MAX_DOCUMENT = 256 * 1024;
let settings;
let swcRuntime;
let initialization,
  service,
  versions = new Map(),
  documents = new Map(),
  activePath;
async function initialize() {
  const response = await fetch(new URL("./definitions.json", import.meta.url));
  if (!response.ok)
    throw Error("Définitions de types indisponibles. Réactivez l’éditeur.");
  const definitions = await response.json();
  for (const [name, text] of Object.entries(definitions))
    documents.set(name, text);
  settings = {
    allowJs: true,
    checkJs: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ["/.pbl-types/lib.es2022.d.ts", "/.pbl-types/lib.dom.d.ts"],
    typeRoots: ["/.pbl-types/node_modules/@types"],
    types: ["jquery"],
  };
  service = ts.createLanguageService({
    getCompilationSettings: () => ({ ...settings, types: [...settings.types] }),
    getScriptFileNames: () =>
      [...documents.keys()].filter((p) => p.startsWith("/project/")),
    getScriptVersion: (p) => String(versions.get(p) ?? 0),
    getScriptSnapshot: (p) =>
      documents.has(p)
        ? ts.ScriptSnapshot.fromString(documents.get(p))
        : undefined,
    getCurrentDirectory: () => "/project",
    getDefaultLibFileName: () => "/.pbl-types/lib.es2022.d.ts",
    fileExists: (p) => documents.has(p),
    readFile: (p) => documents.get(p),
    readDirectory: () => [],
    directoryExists: (p) =>
      [...documents.keys()].some((n) => n.startsWith(p + "/")),
    getDirectories: () => [],
  });
  swcRuntime = await initSWC({
    module_or_path: new URL("./swc.wasm", import.meta.url),
  });
}
self.onmessage = async ({ data }) => {
  try {
    initialization ??= initialize();
    await initialization;
    const {
      id,
      path,
      text,
      position,
      operation,
      projectDefinitions,
      projectFiles = {},
      name,
    } = data;
    if (typeof text !== "string" || text.length > MAX_DOCUMENT)
      throw Error("Analyse limitée à 256 K caractères par document.");
    activePath = path;
    const retained = new Set([path]);
    let bytes = 0;
    for (const [file, value] of Object.entries(projectFiles).slice(0, 64)) {
      if (
        !/\.[cm]?[jt]sx?$/.test(file) ||
        typeof value !== "string" ||
        value.length > 65536 ||
        bytes + value.length > 1024 * 1024
      )
        continue;
      const key = "/project" + file;
      bytes += value.length;
      retained.add(key);
      if (documents.get(key) !== value) {
        documents.set(key, value);
        versions.set(key, (versions.get(key) ?? 0) + 1);
      }
    }
    for (const key of [...documents.keys()])
      if (
        key.startsWith("/project/") &&
        !key.endsWith(".d.ts") &&
        !retained.has(key)
      ) {
        documents.delete(key);
        versions.delete(key);
      }
    for (const name of [...documents.keys()])
      if (name.startsWith("/project/") && name.endsWith(".d.ts"))
        documents.delete(name);
    settings.types =
      projectDefinitions &&
      Object.values(projectDefinitions).some((t) =>
        /interface\s+JQuery|declare\s+(?:var|const|let)\s+(?:\$|jQuery)\s*:/.test(
          t,
        ),
      )
        ? []
        : ["jquery"];
    if (projectDefinitions)
      for (const [name, value] of Object.entries(projectDefinitions).slice(
        0,
        32,
      ))
        if (name.endsWith(".d.ts") && value.length <= 65536) {
          documents.set("/project" + name, value);
          versions.set(
            "/project" + name,
            (versions.get("/project" + name) ?? 0) + 1,
          );
        }
    if (documents.get(path) !== text) {
      documents.set(path, text);
      versions.set(path, (versions.get(path) ?? 0) + 1);
    }
    const respond = (result) =>
      self.postMessage({
        id,
        result,
        wasmMemoryBytes: swcRuntime.memory.buffer.byteLength,
      });
    if (operation === "complete") {
      const completion = service.getCompletionsAtPosition(path, position, {
        includeCompletionsWithInsertText: true,
      });
      const prefix = text.slice(0, position).match(/[\w$]*$/)?.[0] ?? "";
      const entries = (completion?.entries ?? [])
        .filter(
          (item) =>
            !prefix || item.name.toLowerCase().includes(prefix.toLowerCase()),
        )
        .sort((a, b) => Number(a.sortText) - Number(b.sortText))
        .slice(0, 150)
        .map((item) => ({
          label: item.name,
          type:
            {
              method: "method",
              function: "function",
              property: "property",
              class: "class",
              const: "constant",
              keyword: "keyword",
            }[item.kind] ?? "variable",
          apply: item.insertText ?? item.name,
          boost: item.sortText === "11" ? 15 : 0,
        }));
      respond(entries);
      return;
    }
    if (operation === "details") {
      const details = service.getCompletionEntryDetails(
        path,
        position,
        name,
        {},
        undefined,
        {},
        undefined,
      );
      respond(
        details
          ? {
              detail: ts
                .displayPartsToString(details.displayParts)
                .slice(0, 1200),
              documentation: ts
                .displayPartsToString(details.documentation)
                .slice(0, 6000),
            }
          : null,
      );
      return;
    }
    if (operation === "signature") {
      const result = service.getSignatureHelpItems(path, position, undefined);
      respond(
        result
          ? {
              activeSignature: result.selectedItemIndex,
              activeParameter: result.argumentIndex,
              signatures: result.items.map((item) => ({
                label:
                  ts.displayPartsToString(item.prefixDisplayParts) +
                  item.parameters
                    .map((p) => ts.displayPartsToString(p.displayParts))
                    .join(ts.displayPartsToString(item.separatorDisplayParts)) +
                  ts.displayPartsToString(item.suffixDisplayParts),
                parameters: item.parameters.map((p) => ({
                  label: ts.displayPartsToString(p.displayParts),
                  documentation: ts.displayPartsToString(p.documentation),
                })),
                documentation: ts.displayPartsToString(item.documentation),
              })),
            }
          : null,
      );
      return;
    }
    if (operation === "definition" || operation === "references") {
      const items =
        operation === "definition"
          ? service.getDefinitionAtPosition(path, position)
          : service.getReferencesAtPosition(path, position);
      respond(
        (items ?? [])
          .filter((item) => item.fileName.startsWith("/project/"))
          .slice(0, 100)
          .map((item) => ({
            path: item.fileName.slice(8),
            from: item.textSpan.start,
            to: item.textSpan.start + item.textSpan.length,
          })),
      );
      return;
    }
    if (operation === "rename") {
      const info = service.getRenameInfo(path, position, {});
      if (!info.canRename) throw Error(info.localizedErrorMessage);
      const locations =
        service.findRenameLocations(path, position, false, false, true) ?? [];
      respond(
        locations.map((item) => ({
          path: item.fileName.startsWith("/project/")
            ? item.fileName.slice(8)
            : item.fileName,
          from: item.textSpan.start,
          to: item.textSpan.start + item.textSpan.length,
          insert: (item.prefixText ?? "") + name + (item.suffixText ?? ""),
        })),
      );
      return;
    }
    if (operation === "hover") {
      const info = service.getQuickInfoAtPosition(path, position);
      respond(
        info
          ? ts.displayPartsToString(info.displayParts) +
              "\n" +
              ts.displayPartsToString(info.documentation)
          : null,
      );
      return;
    }
    if (operation === "fixes") {
      respond(
        service
          .getCodeFixesAtPosition(
            path,
            position,
            data.end,
            data.codes ?? [],
            {},
            {},
          )
          .filter((fix) =>
            fix.changes.every(
              (change) => change.fileName === path && !change.isNewFile,
            ),
          )
          .map((fix) => ({
            name: fix.description,
            changes: fix.changes.flatMap((c) =>
              c.textChanges.map((e) => ({
                from: e.span.start,
                to: e.span.start + e.span.length,
                insert: e.newText,
              })),
            ),
          })),
      );
      return;
    }
    let syntax = [];
    try {
      parseSync(text, {
        syntax: /\.tsx?$/.test(path) ? "typescript" : "ecmascript",
        jsx: /\.[jt]sx$/.test(path),
        target: "es2022",
      });
    } catch (error) {
      syntax = [
        {
          from: 0,
          to: Math.min(text.length, 1),
          severity: "error",
          message: String(error)
            .replace(/\u001b\[[0-9;]*m/g, "")
            .slice(0, 1600),
        },
      ];
    }
    const diagnostics = service
      .getSyntacticDiagnostics(path)
      .concat(service.getSemanticDiagnostics(path))
      .slice(0, 60)
      .filter((d) => !d.file || d.file.fileName === path)
      .map((d) => ({
        from: d.start ?? 0,
        to: (d.start ?? 0) + (d.length ?? 1),
        severity:
          d.category === ts.DiagnosticCategory.Error ? "error" : "warning",
        code: d.code,
        message: ts
          .flattenDiagnosticMessageText(d.messageText, "\n")
          .slice(0, 1600),
      }));
    self.postMessage({
      id,
      result: diagnostics.length ? diagnostics : syntax,
      wasmMemoryBytes: swcRuntime.memory.buffer.byteLength,
    });
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message });
  }
};
