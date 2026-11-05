import { crcStep } from "../../../packages/runtime/src/project-disk.mjs";
import { exclusion, IMPORT_LIMITS, importSummary } from "./import-plan.mjs";
const equal = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const MiB = 1048576;
const countText = (value) => new Intl.NumberFormat("fr-FR").format(value);
export const folderSizeText = (bytes) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(
    Math.ceil((bytes / MiB) * 100) / 100,
  ) + " Mio";
const folderLimit = (message, limit, path) =>
  Object.assign(Error(message), { code: "FOLDER_LIMIT", limit, path });
export async function readFolder(directory, { onOversized } = {}) {
  const pending = [],
    oversized = [];
  let total = 0;
  async function walk(dir, prefix = "", depth = 0) {
    if (depth > 12)
      throw folderLimit(
        "Le sous-dossier « " +
          prefix +
          " » dépasse la limite de 12 niveaux de dossiers.",
        "depth",
        prefix,
      );
    for await (const [name, entry] of dir.entries()) {
      if (name.startsWith(".") || ["node_modules", "vendor"].includes(name))
        continue;
      const path = prefix + "/" + name;
      if (entry.kind === "directory") await walk(entry, path, depth + 1);
      else {
        const file = await entry.getFile();
        if (file.size > 16 * MiB) {
          if (onOversized) {
            oversized.push({ path, size: file.size });
            continue;
          }
          throw folderLimit(
            "Le fichier « " +
              path +
              " » fait " +
              folderSizeText(file.size) +
              ". La limite par fichier est de 16 Mio.",
            "file",
            path,
          );
        }
        if (pending.length >= 1024)
          throw folderLimit(
            "Le dossier contient au moins " +
              countText(pending.length + 1) +
              " fichiers. La limite est de 1 024 fichiers. Limite atteinte avec « " +
              path +
              " ».",
            "count",
            path,
          );
        total += file.size;
        if (total > 64 * MiB)
          throw folderLimit(
            "Les fichiers du dossier dépassent déjà " +
              folderSizeText(total) +
              ". La limite totale est de 64 Mio. Limite atteinte avec « " +
              path +
              " ».",
            "total",
            path,
          );
        pending.push({ path, file });
      }
    }
  }
  // Validate metadata before allocating file contents or creating a project.
  await walk(directory);
  if (
    oversized.length &&
    !(await onOversized({
      files: oversized,
      retainedCount: pending.length,
      retainedBytes: total,
    }))
  )
    throw new DOMException("Ouverture du dossier annulée.", "AbortError");
  const files = new Map();
  for (const { path, file } of pending)
    files.set(path, new Uint8Array(await file.arrayBuffer()));
  return files;
}
/** Interactive scan: recommended trees stay unvisited until explicitly requested. */
export async function selectFolder(
  directory,
  onSelect,
  { metadataOnly = false } = {},
) {
  const included = new Set();
  let selection;
  for (;;) {
    const records = [];
    let scanned = 0;
    async function walk(dir, prefix = "", depth = 0) {
      for await (const [name, entry] of dir.entries()) {
        const path = prefix + "/" + name,
          rule = exclusion(path);
        if (rule?.locked) continue;
        if (++scanned > IMPORT_LIMITS.scan)
          throw folderLimit(
            "Analyse limitée à 50 000 entrées. Retirez un dossier de dépendances ou ouvrez un sous-dossier.",
            "scan",
            path,
          );
        if (entry.kind === "directory") {
          if (depth >= 12) {
            records.push({
              path,
              size: 0,
              locked: true,
              reason: "Dossier trop profond",
              directory: true,
            });
            continue;
          }
          if (
            rule &&
            ![...included].some((p) => path === p || path.startsWith(p + "/"))
          ) {
            records.push({ path, size: 0, directory: true });
            continue;
          }
          await walk(entry, path, depth + 1);
        } else {
          const file = await entry.getFile();
          records.push({
            path,
            size: file.size,
            file,
            includeRecommended: [...included].some((p) =>
              path.startsWith(p + "/"),
            ),
          });
        }
      }
    }
    await walk(directory);
    selection = await onSelect(records, { selection });
    const directories = records.filter(
      (e) => e.directory && !e.locked && selection.has(e.path),
    );
    if (directories.length) {
      for (const entry of directories) included.add(entry.path);
      continue;
    }
    const summary = importSummary(records, selection);
    if (!summary.valid)
      throw folderLimit(
        summary.issues.join(" ") || "Aucun fichier sélectionné.",
        "selection",
        "/",
      );
    if (metadataOnly)
      return {
        records: records.filter((e) => selection.has(e.path) && !e.directory),
        excluded: records.filter((e) => !selection.has(e.path)).length,
      };
    const files = new Map();
    for (const record of records)
      if (selection.has(record.path) && !record.directory) {
        if (record.file.size !== record.size)
          throw Error(
            "Le fichier a changé pendant la préparation : " + record.path,
          );
        const bytes = new Uint8Array(await record.file.arrayBuffer());
        if (bytes.length !== record.size)
          throw Error("Taille modifiée pendant la lecture : " + record.path);
        files.set(record.path, bytes);
      }
    return {
      files,
      excluded: records.filter((e) => !selection.has(e.path)).length,
    };
  }
}
export function folderWriter(directory, snapshots) {
  return async (path, text) => {
    const parts = path.split("/").slice(1);
    if (
      !parts.length ||
      parts.some(
        (p) =>
          !p ||
          p === "." ||
          p === ".." ||
          [".git", ".alwis", ".sessions"].includes(p) ||
          p.startsWith(".pbl-") ||
          /[\x00-\x1f]/.test(p),
      )
    )
      throw Error("Chemin local réservé.");
    let dir = directory;
    for (const part of parts.slice(0, -1))
      dir = await dir.getDirectoryHandle(part, { create: true });
    const name = parts.at(-1);
    let handle, current;
    const expected = snapshots.get(path);
    const conflict = () =>
      Error(
        "Le fichier du PC a changé : " +
          path +
          ". Rouvrez le dossier pour récupérer sa version.",
      );
    try {
      handle = await dir.getFileHandle(name);
      const file = await handle.getFile();
      // Do not read a potentially huge excluded/new external file just to refuse overwriting it.
      if (
        !expected ||
        file.size !==
          (expected instanceof Uint8Array ? expected.byteLength : expected.size)
      )
        throw conflict();
      if (expected instanceof Uint8Array)
        current = new Uint8Array(await file.arrayBuffer());
      else {
        if (
          expected.mtime !== undefined &&
          file.lastModified !== expected.mtime
        )
          throw conflict();
        let crc = 0xffffffff;
        const reader = file.stream().getReader();
        try {
          for (;;) {
            const part = await reader.read();
            if (part.done) break;
            crc = crcStep(crc, part.value);
          }
        } finally {
          reader.releaseLock();
        }
        if ((crc ^ 0xffffffff) >>> 0 !== expected.crc) throw conflict();
        current = true;
      }
    } catch (e) {
      if (e.name !== "NotFoundError") throw e;
    }
    if (
      (expected && !current) ||
      (current && expected instanceof Uint8Array && !equal(current, expected))
    )
      throw conflict();
    handle ??= await dir.getFileHandle(name, { create: true });
    const stream = await handle.createWritable();
    try {
      await stream.write(text);
      await stream.close();
    } catch (e) {
      await stream.abort().catch(() => {});
      throw e;
    }
    const data = new TextEncoder().encode(text);
    snapshots.set(
      path,
      expected instanceof Uint8Array
        ? data
        : {
            size: data.length,
            crc: (crcStep(0xffffffff, data) ^ 0xffffffff) >>> 0,
            mtime: (await handle.getFile()).lastModified,
          },
    );
  };
}

/** Explicit saves only. Generation files + context-last commit avoid torn metadata. */
export async function folderContext(directory) {
  let metadataDir,
    original = null,
    saved = null;
  try {
    metadataDir = await directory.getDirectoryHandle(".alwis");
    const file = await (
      await metadataDir.getFileHandle("context.json")
    ).getFile();
    if (file.size > 1048576)
      throw Error("Configuration .alwis trop volumineuse.");
    original = await file.text();
    saved = JSON.parse(original);
    if (saved.version !== 1 || saved.format !== "alwis-folder")
      throw Error("Configuration .alwis non reconnue.");
  } catch (error) {
    if (error.name !== "NotFoundError") throw error;
  }
  return {
    saved,
    async archive() {
      if (!saved?.archive) return null;
      if (!/^databases-[a-f0-9-]+\.zip$/.test(saved.archive))
        throw Error("Nom de sauvegarde .alwis invalide.");
      const file = await (
        await metadataDir.getFileHandle(saved.archive)
      ).getFile();
      if (file.size > 65 * 1048576)
        throw Error("Sauvegarde .alwis trop volumineuse.");
      return file;
    },
    async save(context, archive) {
      metadataDir ??= await directory.getDirectoryHandle(".alwis", {
        create: true,
      });
      let actual = null;
      try {
        actual = await (
          await (await metadataDir.getFileHandle("context.json")).getFile()
        ).text();
      } catch (e) {
        if (e.name !== "NotFoundError") throw e;
      }
      if (actual !== original)
        throw Error(
          "La configuration .alwis a changé sur le PC. Rouvrez le dossier avant de la remplacer.",
        );
      const write = async (name, data) => {
        const file = await metadataDir.getFileHandle(name, { create: true }),
          stream = await file.createWritable();
        try {
          await stream.write(data);
          await stream.close();
        } catch (e) {
          await stream.abort().catch(() => {});
          throw e;
        }
      };
      const archiveName = "databases-" + crypto.randomUUID() + ".zip";
      await write(archiveName, archive);
      const previous = saved?.archive;
      const next = {
        format: "alwis-folder",
        version: 1,
        archive: archiveName,
        workspace: context,
      };
      const serialized = JSON.stringify(next, null, 2) + "\n";
      await write("context.json", serialized);
      original = serialized;
      saved = next;
      if (previous && /^databases-[a-f0-9-]+\.zip$/.test(previous))
        await metadataDir.removeEntry(previous).catch(() => {});
    },
  };
}
