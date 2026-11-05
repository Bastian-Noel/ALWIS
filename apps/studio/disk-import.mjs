import {
  ProjectDisk,
  storageBudget,
} from "/packages/runtime/src/project-disk.mjs";
/** A temporary object batch is invisible to the runtime until every selected file is verified. */
export async function stageFiles(
  project,
  records,
  { signal, onProgress = () => {} } = {},
) {
  const disk = await ProjectDisk.reserve(project),
    created = [];
  let completed = 0;
  try {
    await storageBudget(records.reduce((n, e) => n + e.size, 0));
    for (const record of records) {
      signal?.throwIfAborted();
      const entry = await disk.put(
        record.path,
        record.stream ? await record.stream() : record.file,
        {
          size: record.size,
          expectedCRC: record.crc,
          signal,
          internal: record.path.startsWith("/.pbl-backup/"),
          onProgress: (bytes) => onProgress(completed + bytes, record.path),
        },
      );
      if (Number.isFinite(record.file?.lastModified))
        entry.mtime = record.file.lastModified;
      created.push(entry);
      completed += entry.size;
    }
    return {
      disk,
      entries: created,
      async discard() {
        await disk.discard(created);
      },
    };
  } catch (error) {
    await ProjectDisk.remove(project).catch(() => {});
    throw error;
  }
}
