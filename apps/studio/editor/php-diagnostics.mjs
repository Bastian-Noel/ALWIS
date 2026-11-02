import { php } from "@codemirror/lang-php";
const parser = php().language.parser;
function errors(tree) {
  const list = [];
  tree.iterate({
    enter(node) {
      if (node.type.isError && list.length < 60)
        list.push({ from: node.from, to: node.to });
    },
  });
  return list;
}
/** Conservative parser-verified repair, bounded to four candidates per analysis. */
export function phpSyntaxDiagnostics(text) {
  const tree = parser.parse(text),
    faults = errors(tree);
  return faults.map((fault, index) => {
    const diagnostic = {
      ...fault,
      severity: "error",
      message: "Syntaxe PHP incomplète ou inattendue à cet endroit.",
    };
    if (index >= 4) return diagnostic;
    let position = fault.from;
    while (position > 0 && /\s/.test(text[position - 1])) position--;
    const preceding = tree.resolveInner(Math.max(0, position - 1), -1);
    if (
      /Comment|String/.test(preceding.name) &&
      !/["']$/.test(text.slice(0, position))
    )
      return diagnostic;
    // Only a missing statement terminator, never arbitrary insertion after a block/header.
    if (
      position &&
      !/[;{}:]$/.test(text.slice(0, position)) &&
      errors(parser.parse(text.slice(0, position) + ";" + text.slice(position)))
        .length < faults.length
    ) {
      diagnostic.from = position;
      diagnostic.to = position;
      diagnostic.message =
        "Un point-virgule manque probablement ici. L’insertion de « ; » réduit les erreurs de syntaxe.\nDiagnostic initial : syntaxe PHP incomplète ou inattendue.";
      diagnostic.actions = [
        {
          name: "Ajouter ;",
          apply(view, from) {
            if (view.state.doc.toString() !== text) return;
            view.dispatch({
              changes: { from, insert: ";" },
              userEvent: "input.complete",
            });
          },
        },
      ];
    }
    return diagnostic;
  });
}
const scopes = new Set([
  "FunctionDefinition",
  "MethodDeclaration",
  "FunctionExpression",
  "ArrowFunction",
  "Template",
]);
const predefined = new Set([
  "$this",
  "$GLOBALS",
  "$_SERVER",
  "$_GET",
  "$_POST",
  "$_FILES",
  "$_COOKIE",
  "$_SESSION",
  "$_REQUEST",
  "$_ENV",
  "$argc",
  "$argv",
]);
function scopeOf(node) {
  for (let p = node.parent; p; p = p.parent) if (scopes.has(p.name)) return p;
  return node;
}
function declaration(node, text) {
  const parent = node.parent;
  if (
    [
      "Parameter",
      "VariableDeclarator",
      "UseList",
      "CatchClause",
      "GlobalStatement",
      "StaticVariableDeclaration",
    ].includes(parent?.name)
  )
    return true;
  if (
    parent?.name === "AssignmentExpression" &&
    parent.firstChild?.from === node.from
  )
    return true;
  if (
    parent?.name === "ForSpec" &&
    /\bas\b/.test(text.slice(parent.from, node.from))
  )
    return true;
  return false;
}
function variables(text, tree) {
  const nodes = [];
  tree.iterate({
    enter(n) {
      if (n.name === "VariableName" && nodes.length < 1000) nodes.push(n.node);
    },
  });
  return nodes.map((node) => ({
    node,
    name: text.slice(node.from, node.to),
    scope: scopeOf(node).from,
    declared: declaration(node, text),
  }));
}
export function phpVariables(text, position) {
  const tree = parser.parse(text),
    scope = scopeOf(tree.resolveInner(position, -1)).from;
  return [
    ...new Set(
      variables(text, tree)
        .filter(
          (v) => v.declared && v.scope === scope && v.node.from < position,
        )
        .map((v) => v.name),
    ),
  ].slice(0, 200);
}
function nearName(a, b) {
  if (a.toLowerCase() === b.toLowerCase()) return true;
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 5)
    return false;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(
        row[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    previous = row;
  }
  return previous[b.length] <= 1;
}
export function phpVariableDiagnostics(text) {
  const tree = parser.parse(text),
    all = variables(text, tree),
    result = [],
    dynamicScopes = new Map();
  for (const variable of all) {
    if (
      variable.declared ||
      predefined.has(variable.name) ||
      result.length >= 15 ||
      variable.name.length > 80
    )
      continue;
    const scope = scopeOf(variable.node),
      body = text.slice(scope.from, scope.to);
    // Dynamic symbol tables, includes and captures make absence impossible to infer safely.
    if (!dynamicScopes.has(scope.from))
      dynamicScopes.set(
        scope.from,
        /\$\$|\b(?:extract|include|include_once|require|require_once|eval|global)\b/.test(
          body,
        ) || scope.name === "ArrowFunction",
      );
    if (dynamicScopes.get(scope.from)) continue;
    const available = [
      ...new Set(
        all
          .filter(
            (v) =>
              v.declared &&
              v.scope === variable.scope &&
              v.node.from < variable.node.from,
          )
          .map((v) => v.name),
      ),
    ];
    if (available.includes(variable.name)) continue;
    const candidates = available.filter(
      (name) => name.length <= 80 && nearName(name, variable.name),
    );
    if (candidates.length !== 1) continue;
    const candidate = candidates[0];
    result.push({
      from: variable.node.from,
      to: variable.node.to,
      severity: "warning",
      message: `Variable ${variable.name} : vouliez-vous écrire ${candidate} ? Les variables PHP sont sensibles à la casse.`,
      actions: [
        {
          name: `Remplacer par ${candidate}`,
          apply(view, from, to) {
            if (view.state.doc.toString() !== text) return;
            view.dispatch({
              changes: { from, to, insert: candidate },
              userEvent: "input.complete",
            });
          },
        },
      ],
    });
  }
  return result;
}
export function phpDiagnostics(text) {
  return [...phpSyntaxDiagnostics(text), ...phpVariableDiagnostics(text)];
}
