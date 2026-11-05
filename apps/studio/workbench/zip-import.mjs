import { zipTask } from "../archive-service.mjs";
import { chooseImport } from "./import-dialog.mjs";
export async function prepareZip(file) {
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
  const unpacked = await zipTask("extract", {
    file,
    names: records.filter((e) => selected.has(e.path)).map((e) => e.original),
  });
  return unpacked.map((e) => ({ ...e, name: e.name.slice(prefix.length) }));
}
