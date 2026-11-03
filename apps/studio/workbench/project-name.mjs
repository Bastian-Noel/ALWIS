/** A ZIP opened from home always gets a new project, never an existing one. */
export function archiveProjectName(filename, existing) {
  const base =
    filename
      .replace(/\.zip$/i, "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "projet-importe";
  const names = new Set(existing.map((project) => project.name));
  let name = base;
  for (let index = 2; names.has(name); index++) {
    const suffix = "-" + index;
    name = base.slice(0, 64 - suffix.length) + suffix;
  }
  return name;
}

/** Include older projects that have fallen out of the recent-project list. */
export async function unusedArchiveName(
  filename,
  recent,
  storage = globalThis.indexedDB,
) {
  try {
    const databases = await storage.databases();
    const stored = databases.flatMap(({ name }) => {
      const match =
        /^\/\.pbl\/(?:projects\/(?:@v2\/)?|sql\/)([A-Za-z0-9_-]{1,64})$/.exec(
          name ?? "",
        );
      return match ? [{ name: match[1] }] : [];
    });
    return archiveProjectName(filename, [...recent, ...stored]);
  } catch {
    // When enumeration is unavailable, use a fresh identifier instead of guessing.
    const base = archiveProjectName(filename, []).slice(0, 45);
    return archiveProjectName(
      base + "-" + crypto.randomUUID().slice(0, 12),
      recent,
    );
  }
}
