/** Canonical file objects in OPFS, immutable catalogue generations in IndexedDB. */
export const DISK_LIMITS = {
  file: 512 * 1048576,
  project: 2 * 1024 * 1048576,
  files: 10000,
  nodes: 32000,
  chunk: 256 * 1024,
};
let database;
function db() {
  return (database ??= new Promise((resolve, reject) => {
    const r = indexedDB.open("alwis-disk-catalog", 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("heads", { keyPath: "project" });
      const s = r.result.createObjectStore("generations", { keyPath: "id" });
      s.createIndex("project", "project");
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => {
      database = null;
      reject(r.error);
    };
  }));
}
async function tx(store, mode, action) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode),
      r = action(t.objectStore(store));
    let value;
    r.onsuccess = () => (value = r.result);
    t.oncomplete = () => resolve(value);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? Error("Catalogue interrompu."));
  });
}
const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
  for (let j = 0; j < 8; j++) i = i & 1 ? 0xedb88320 ^ (i >>> 1) : i >>> 1;
  return i >>> 0;
});
export function crcStep(crc, bytes) {
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return crc >>> 0;
}
export function validDiskPath(path, { internal = false } = {}) {
  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    path.length > 4000 ||
    path
      .split("/")
      .slice(1)
      .some(
        (p) =>
          !p ||
          p === "." ||
          p === ".." ||
          /[\x00-\x1f\\]/.test(p) ||
          new TextEncoder().encode(p).length > 255,
      )
  )
    throw Error("Chemin de projet invalide.");
  if (
    !internal &&
    path
      .split("/")
      .some(
        (p) =>
          [".git", ".alwis", ".sessions"].includes(p) || p.startsWith(".pbl-"),
      )
  )
    throw Error("Chemin réservé : " + path);
  return path;
}
export function classifyFile(path, prefix = new Uint8Array()) {
  const ext = path.split(".").pop().toLowerCase();
  const types = {
    php: "text/x-php",
    phtml: "text/x-php",
    inc: "text/x-php",
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    js: "text/javascript",
    mjs: "text/javascript",
    json: "application/json",
    csv: "text/csv",
    txt: "text/plain",
    md: "text/markdown",
    sql: "text/plain",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
    ico: "image/x-icon",
    mp4: "video/mp4",
    webm: "video/webm",
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    wav: "audio/wav",
    pdf: "application/pdf",
    woff: "font/woff",
    woff2: "font/woff2",
    zip: "application/zip",
  };
  let kind = /^(php|phtml|inc|html?|css|[cm]?js|jsx|tsx?)$/.test(ext)
    ? "code"
    : /^(json|csv|sql|txt|md)$/.test(ext)
      ? "text"
      : ext === "svg"
        ? "svg"
        : "binary";
  if (prefix.includes(0)) kind = "binary";
  else if (kind === "code" || kind === "text") {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(prefix, {
        stream: true,
      });
    } catch {
      kind = "binary";
    }
  }
  return { kind, type: types[ext] ?? "application/octet-stream" };
}
export async function storageBudget(required = 0) {
  if (!navigator.storage?.getDirectory)
    throw Error("Ce navigateur ne propose pas le stockage OPFS nécessaire.");
  const estimate = await navigator.storage.estimate();
  const free = Math.max(0, (estimate.quota ?? 0) - (estimate.usage ?? 0));
  const margin = Math.max(16 * 1048576, Math.ceil(required * 0.15));
  if (estimate.quota && free < required + margin)
    throw Error(
      "Espace navigateur insuffisant : libérez du stockage ou réduisez la sélection.",
    );
  return {
    free,
    quota: estimate.quota ?? null,
    usage: estimate.usage ?? null,
    margin,
    persistent: (await navigator.storage.persisted?.()) ?? false,
  };
}
export class ProjectDisk {
  static async available() {
    return !!navigator.storage?.getDirectory;
  }
  static async has(project) {
    return !!(await tx("heads", "readonly", (s) => s.get(project)));
  }
  static async heads() {
    return await tx("heads", "readonly", (s) => s.getAll());
  }
  static async reserve(project) {
    const disk = await this.open(project);
    if (disk.catalog)
      throw Error("Ce projet existe déjà. Choisissez un autre nom.");
    const token = crypto.randomUUID();
    await tx("heads", "readwrite", (s) =>
      s.add({ project, state: "importing", token, updated: Date.now() }),
    );
    disk.reservation = token;
    return disk;
  }
  static async open(project, generation) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(project))
      throw Error("Identifiant de projet invalide.");
    const root = await navigator.storage.getDirectory(),
      base = await root.getDirectoryHandle("alwis-files", { create: true }),
      dir = await base.getDirectoryHandle(project, { create: true }),
      objects = await dir.getDirectoryHandle("objects", { create: true });
    const head = await tx("heads", "readonly", (s) => s.get(project));
    const catalog =
      generation || head?.generation
        ? await tx("generations", "readonly", (s) =>
            s.get(generation || head.generation),
          )
        : null;
    if ((generation || head) && (!catalog || catalog.project !== project))
      throw Error(
        "Catalogue de fichiers absent. L’ancienne sauvegarde est conservée.",
      );
    return new ProjectDisk(project, dir, objects, catalog);
  }
  constructor(project, dir, objects, catalog) {
    Object.assign(this, { project, dir, objects, catalog });
  }
  async file(entry) {
    if (!entry || entry.directory || !/^[a-f0-9-]{36}$/.test(entry.object))
      throw Error("Objet de fichier invalide.");
    const file = await (
      await this.objects.getFileHandle(entry.object)
    ).getFile();
    if (file.size !== entry.size)
      throw Error("Fichier disque incomplet : " + entry.path);
    return file;
  }
  async put(
    path,
    source,
    {
      size = source?.size,
      signal,
      expectedCRC,
      internal = false,
      onProgress = () => {},
    } = {},
  ) {
    validDiskPath(path, { internal });
    if (!Number.isSafeInteger(size) || size < 0 || size > DISK_LIMITS.file)
      throw Error("Fichier disque limité à 512 Mio.");
    await storageBudget(size);
    signal?.throwIfAborted();
    const object = crypto.randomUUID(),
      handle = await this.objects.getFileHandle(object, { create: true });
    let writer,
      reader,
      read = 0,
      crc = 0xffffffff,
      prefix = new Uint8Array();
    try {
      writer = await handle.createWritable();
      const stream =
        source instanceof Blob
          ? source.stream()
          : source instanceof Uint8Array
            ? new Blob([source]).stream()
            : source;
      reader = stream.getReader();
      for (;;) {
        signal?.throwIfAborted();
        const part = await reader.read();
        if (part.done) break;
        const bytes = part.value;
        if (!(bytes instanceof Uint8Array))
          throw Error("Flux de fichier invalide.");
        read += bytes.length;
        if (read > size)
          throw Error(
            "Taille décompressée supérieure à celle annoncée : " + path,
          );
        if (prefix.length < 512) {
          const n = Math.min(512 - prefix.length, bytes.length),
            next = new Uint8Array(prefix.length + n);
          next.set(prefix);
          next.set(bytes.subarray(0, n), prefix.length);
          prefix = next;
        }
        crc = crcStep(crc, bytes);
        for (let i = 0; i < bytes.length; i += DISK_LIMITS.chunk) {
          signal?.throwIfAborted();
          await writer.write(bytes.subarray(i, i + DISK_LIMITS.chunk));
        }
        onProgress(read);
      }
      if (
        read !== size ||
        (expectedCRC !== undefined && (crc ^ 0xffffffff) >>> 0 !== expectedCRC)
      )
        throw Error("Intégrité de fichier incorrecte : " + path);
      signal?.throwIfAborted();
      await writer.close();
      writer = null;
      const file = await handle.getFile();
      if (file.size !== size)
        throw Error("Écriture disque incomplète : " + path);
      return {
        path,
        object,
        size,
        version: object,
        mtime: Date.now(),
        crc: (crc ^ 0xffffffff) >>> 0,
        ...classifyFile(path, prefix),
      };
    } catch (error) {
      await reader?.cancel().catch(() => {});
      await writer?.abort().catch(() => {});
      await this.objects.removeEntry(object).catch(() => {});
      if (error.name === "QuotaExceededError")
        throw Error(
          "Quota disque du navigateur atteint. Aucun fichier incomplet n’est conservé.",
        );
      throw error;
    } finally {
      reader?.releaseLock();
    }
  }
  async discard(entries) {
    for (const e of entries)
      if (e.object) await this.objects.removeEntry(e.object).catch(() => {});
  }
  async prepare(entries) {
    if (entries.length > DISK_LIMITS.nodes)
      throw Error("Catalogue limité à 32 000 fichiers et dossiers.");
    let size = 0,
      count = 0,
      privateBytes = 0,
      privateFiles = 0;
    const seen = new Set(),
      directories = new Set();
    for (const e of entries) {
      validDiskPath(e.path, { internal: true });
      if (seen.has(e.path)) throw Error("Chemin en double dans le catalogue.");
      seen.add(e.path);
      const parts = e.path.split("/").slice(1);
      for (let i = 1; i < parts.length; i++)
        directories.add("/" + parts.slice(0, i).join("/"));
      if (e.directory) directories.add(e.path);
      if (!e.directory) {
        if (e.path.startsWith("/.sessions/")) {
          privateBytes += e.size;
          privateFiles++;
        } else {
          size += e.size;
          count++;
        }
        if (e.size > DISK_LIMITS.file)
          throw Error("Fichier disque trop lourd.");
      }
    }
    if (directories.size + count + privateFiles > DISK_LIMITS.nodes)
      throw Error(
        "Arborescence trop grande : 32 000 fichiers et dossiers au maximum.",
      );
    if (privateBytes > 16 * 1048576 || privateFiles > 1024)
      throw Error("Sessions PHP limitées à 16 Mio et 1 024 fichiers.");
    if (size > DISK_LIMITS.project || count > DISK_LIMITS.files)
      throw Error("Projet disque limité à 2 Gio et 10 000 fichiers.");
    const catalog = {
      id: crypto.randomUUID(),
      project: this.project,
      entries,
      created: Date.now(),
      bytes: size,
      files: count,
    };
    await tx("generations", "readwrite", (s) => s.put(catalog));
    return catalog;
  }
  async publish(catalog) {
    if (catalog.project !== this.project)
      throw Error("Catalogue d’un autre projet.");
    await tx("heads", "readwrite", (s) =>
      s.put({
        project: this.project,
        generation: catalog.id,
        bytes: catalog.bytes,
        files: catalog.files,
        updated: Date.now(),
      }),
    );
    this.catalog = catalog;
  }
  /** Keep recent checkpoints and in-flight objects; remove only stale unreachable objects. */
  async collect({ now = Date.now() } = {}) {
    if (!this.catalog) return;
    const generations = await tx("generations", "readonly", (s) =>
      s.index("project").getAll(this.project),
    );
    generations.sort((a, b) => b.created - a.created);
    const keep = generations.filter(
        (g, i) =>
          g.id === this.catalog.id || i < 3 || g.created > now - 86400000,
      ),
      objects = new Set(
        keep.flatMap((g) =>
          g.entries.filter((e) => e.object).map((e) => e.object),
        ),
      );
    for (const g of generations)
      if (!keep.includes(g))
        await tx("generations", "readwrite", (s) => s.delete(g.id));
    for await (const [name, handle] of this.objects.entries())
      if (
        handle.kind === "file" &&
        !objects.has(name) &&
        (await handle.getFile()).lastModified < now - 86400000
      )
        await this.objects.removeEntry(name);
  }
  async verify(entry) {
    const file = await this.file(entry),
      reader = file.stream().getReader();
    let crc = 0xffffffff,
      size = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        crc = crcStep(crc, part.value);
        size += part.value.length;
      }
    } finally {
      reader.releaseLock();
    }
    if (size !== entry.size || (crc ^ 0xffffffff) >>> 0 !== entry.crc)
      throw Error("Vérification de la copie échouée : " + entry.path);
  }
  static async remove(project) {
    const root = await navigator.storage.getDirectory();
    try {
      await (
        await root.getDirectoryHandle("alwis-files")
      ).removeEntry(project, { recursive: true });
    } catch (e) {
      if (e.name !== "NotFoundError") throw e;
    }
    const d = await db();
    await new Promise((resolve, reject) => {
      const t = d.transaction(["heads", "generations"], "readwrite");
      t.objectStore("heads").delete(project);
      const r = t
        .objectStore("generations")
        .index("project")
        .openKeyCursor(IDBKeyRange.only(project));
      r.onsuccess = () => {
        if (r.result) {
          t.objectStore("generations").delete(r.result.primaryKey);
          r.result.continue();
        }
      };
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  }
}
