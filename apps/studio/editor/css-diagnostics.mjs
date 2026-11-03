import { cssLanguage } from "@codemirror/lang-css";
export function cssDiagnostics(text) {
  const result = [];
  cssLanguage.parser.parse(text).iterate({
    enter(n) {
      if (n.type.isError && result.length < 40)
        result.push({
          from: n.from,
          to: n.to,
          severity: "error",
          message:
            "Syntaxe CSS incomplète : vérifiez les accolades, parenthèses et valeurs autour de cette position.",
        });
    },
  });
  return result;
}
