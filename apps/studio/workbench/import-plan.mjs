/** Metadata-only selection shared by local folders and ZIPs. Contents stay unread until approval. */
export const IMPORT_LIMITS = {
  file: 16 * 1048576,
  total: 64 * 1048576,
  count: 1024,
  depth: 12,
  scan: 50000,
};
const encoder = new TextEncoder();
const recommended = new Map([
  ["node_modules", "Dépendances npm"],
  ["vendor", "Dépendances Composer : peuvent être nécessaires à PHP"],
  [".venv", "Environnement Python"],
  ["venv", "Environnement Python"],
  ["__pycache__", "Cache Python"],
  [".pytest_cache", "Cache de tests"],
  [".mypy_cache", "Cache de types"],
  [".cache", "Cache"],
  [".next", "Build Next.js"],
  [".nuxt", "Build Nuxt"],
  [".turbo", "Cache de compilation"],
  [".parcel-cache", "Cache de compilation"],
  ["coverage", "Rapports de couverture"],
  ["bower_components", "Dépendances front-end"],
]);
export function exclusion(path) {
  const parts = path.replace(/^\//, "").split("/");
  if (
    path.length > 4000 ||
    parts.some(
      (p) =>
        !p ||
        p === "." ||
        p === ".." ||
        /[\x00-\x1f\\]/.test(p) ||
        encoder.encode(p).length > 255,
    )
  )
    return { locked: true, reason: "Nom ou chemin non pris en charge" };
  if (
    parts.some(
      (p) =>
        [".git", ".alwis", ".sessions"].includes(p) || p.startsWith(".pbl-"),
    )
  )
    return { locked: true, reason: "Données internes ou Git" };
  for (let i = 0; i < parts.length; i++)
    if (recommended.has(parts[i]))
      return {
        group: "/" + parts.slice(0, i + 1).join("/"),
        reason: recommended.get(parts[i]),
      };
  if (/\.(zip|tar|tgz|gz|7z|rar|bak|sql[.]gz)$/i.test(parts.at(-1)))
    return { group: "archives", reason: "Archives et sauvegardes" };
  if (parts.some((p) => p.startsWith(".")))
    return {
      group: "hidden",
      reason: "Fichiers cachés (configuration parfois nécessaire)",
    };
  return null;
}
export function importSummary(entries, selected) {
  const chosen = entries.filter((e) => selected.has(e.path));
  const directories = chosen.filter((e) => e.directory).length;
  const bytes = chosen.reduce((sum, e) => sum + e.size, 0);
  const issues = [];
  if (chosen.some((e) => e.locked))
    issues.push("Un élément réservé ne peut pas être importé.");
  if (chosen.some((e) => e.size > IMPORT_LIMITS.file))
    issues.push("Un fichier dépasse 16 Mio.");
  if (
    chosen.some(
      (e) =>
        e.path.replace(/^\//, "").split("/").length > IMPORT_LIMITS.depth + 1,
    )
  )
    issues.push("Un chemin dépasse 12 niveaux.");
  if (chosen.length > IMPORT_LIMITS.count)
    issues.push("Plus de 1 024 fichiers sont sélectionnés.");
  if (bytes > IMPORT_LIMITS.total) issues.push("La sélection dépasse 64 Mio.");
  return {
    count: chosen.length - directories,
    directories,
    bytes,
    issues,
    valid: issues.length === 0 && chosen.length > 0,
  };
}
export function defaultSelection(entries) {
  return new Set(
    entries
      .filter(
        (e) =>
          !e.locked &&
          !e.recommended &&
          e.size <= IMPORT_LIMITS.file &&
          e.path.replace(/^\//, "").split("/").length <=
            IMPORT_LIMITS.depth + 1,
      )
      .map((e) => e.path),
  );
}
/** Explicit proposal only: trim larger optional payloads first; never remove backup metadata. */
export function fitSelection(entries, selected) {
  const result = new Set(selected);
  for (const e of entries)
    if (
      !e.backup &&
      (e.locked ||
        e.size > IMPORT_LIMITS.file ||
        e.path.replace(/^\//, "").split("/").length > 13)
    )
      result.delete(e.path);
  const candidates = entries
    .filter((e) => result.has(e.path) && !e.backup && !e.directory)
    .sort((a, b) => {
      const priority = (p) =>
        [
          "index.php",
          "index.html",
          "composer.json",
          "composer.lock",
          "package.json",
          "autoload.php",
          ".htaccess",
          ".env",
        ].includes(p.split("/").at(-1))
          ? 3
          : /\.(php|phtml|html?|css|[cm]?js|jsx|tsx?|json|lock|md)$/i.test(p)
            ? 2
            : 0;
      return (
        priority(a.path) - priority(b.path) ||
        b.size - a.size ||
        a.path.localeCompare(b.path)
      );
    });
  let { count, bytes } = importSummary(entries, result);
  for (const e of candidates) {
    if (count <= IMPORT_LIMITS.count && bytes <= IMPORT_LIMITS.total) break;
    result.delete(e.path);
    count--;
    bytes -= e.size;
  }
  return result;
}
