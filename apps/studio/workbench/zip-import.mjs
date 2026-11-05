import { zipEntryStream } from "../zip.mjs";
import { stageFiles } from "../disk-import.mjs";
import { importProgress } from "./import-progress.mjs";
import { zipTask } from "../archive-service.mjs";
import { chooseImport } from "./import-dialog.mjs";
export async function prepareZip(file, project) {
  const entries = await zipTask("inspect", file);
  // Strip a single wrapping folder (typical GitHub/source archives), never ALWIS metadata.
  const first = entries[0]?.name.split("/")[0];
  const prefix =
    first &&
    !first.startsWith(".") &&
    entries.every((e) => e.name.startsWith(first + "/"))
      ? first + "/"
      : "";
  const records = entries.map((e) => ({
    path: "/" + e.name.slice(prefix.length),
    size: e.size,
    original: e.name,
    locked: e.locked,
    reason: e.reason || undefined,
  }));
  const backups = records.filter((e) => e.path.startsWith("/.pbl-backup/"));
  if (
    backups.reduce((n, e) => n + e.size, 0) > 64 * 1048576 ||
    backups.some((e) => e.size > 8 * 1048576)
  )
    throw Error("Sauvegarde SQL limitée à 8 Mio par base et 64 Mio au total.");
  if (backups.length) {
    const manifest = backups.find(
      (e) => e.path === "/.pbl-backup/project.json",
    );
    if (!manifest || manifest.locked || manifest.size > 65536)
      throw Error(
        "Sauvegarde ALWIS incomplète : manifeste absent, non lisible ou trop volumineux. Réexportez le projet.",
      );
  }
  // Restore ALWIS backups as a whole; no selection may drop a database dump.
  const selected = await chooseImport(records, {
    title: "Ouvrir le ZIP « " + file.name + " »",
    source:
      "Seuls les fichiers sélectionnés seront décompressés. Le ZIP d’origine reste inchangé.",
  });
  const chosen = records.filter((e) => selected.has(e.path));
  const byName = new Map(entries.map((e) => [e.name, e]));
  const sources = [];
  for (const record of chosen) {
    const entry = byName.get(record.original);
    sources.push({
      ...record,
      crc: entry.crc,
      stream: () => zipEntryStream(file, entry),
    });
  }
  return importProgress(
    (options) => stageFiles(project, sources, options),
    chosen.reduce((n, e) => n + e.size, 0),
  );
}
