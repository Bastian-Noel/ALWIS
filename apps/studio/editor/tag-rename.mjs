import { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
/** Mirror edits within a matched opening HTML tag; never touch strings or siblings. */
export const renameClosingTag = EditorState.transactionFilter.of((tr) => {
  if (
    !tr.docChanged ||
    !tr.isUserEvent("input") ||
    tr.isUserEvent("input.format") ||
    tr.changes.empty
  )
    return tr;
  const edits = [];
  tr.changes.iterChanges((from, to) => edits.push({ from, to }));
  if (edits.length !== 1) return tr;
  const { from, to } = edits[0];
  let node = syntaxTree(tr.startState).resolveInner(from, 1);
  if (node.name !== "TagName")
    node = syntaxTree(tr.startState).resolveInner(from, -1);
  if (
    node.name !== "TagName" ||
    node.parent?.name !== "OpenTag" ||
    from < node.from ||
    to > node.to
  )
    return tr;
  const closing = node.parent.parent?.getChild("CloseTag")?.getChild("TagName");
  if (
    !closing ||
    tr.startState.sliceDoc(node.from, node.to) !==
      tr.startState.sliceDoc(closing.from, closing.to)
  )
    return tr;
  const name = tr.newDoc.sliceString(
    tr.changes.mapPos(node.from, -1),
    tr.changes.mapPos(node.to, 1),
  );
  if (!/^[A-Za-z][\w:-]*$/.test(name)) return tr;
  return [
    tr,
    {
      changes: {
        from: tr.changes.mapPos(closing.from),
        to: tr.changes.mapPos(closing.to),
        insert: name,
      },
      sequential: true,
    },
  ];
});
