import { ProjectDisk } from "./project-disk.mjs";
/** MEMFS metadata with immutable OPFS-backed reads; only modified files occupy MEMFS. */
export class DiskWorkspace {
  static async create(module, key, oldRoot, quota, checkpoint) {
    if (
      !navigator.storage?.getDirectory ||
      typeof FileReaderSync === "undefined"
    ) {
      if (checkpoint?.diskGeneration || (await ProjectDisk.has(key)))
        throw Error(
          "Ce projet nécessite OPFS et les lectures de fichiers dans un worker. Utilisez un navigateur compatible.",
        );
      return null;
    }
    const disk = await ProjectDisk.open(key, checkpoint?.diskGeneration);
    const workspace = new DiskWorkspace(
      module,
      disk,
      quota,
      "/.pbl/projects/@disk/" + key,
    );
    let catalog = disk.catalog;
    if (!catalog) {
      const entries = [];
      const walk = async (path) => {
        for (const name of module.FS.readdir(path)) {
          if (name === "." || name === ".." || name.startsWith(".pbl-"))
            continue;
          const full = path + "/" + name,
            logical = full.slice(oldRoot.length),
            node = module.FS.lookupPath(full, { follow: false }).node;
          if (module.FS.isDir(node.mode)) {
            entries.push({
              path: logical,
              directory: true,
              mtime: +node.timestamp,
              mode: node.mode,
            });
            await walk(full);
          } else if (module.FS.isFile(node.mode)) {
            const data = module.FS.readFile(full),
              entry = await disk.put(logical, data, {
                size: data.length,
                internal: true,
              });
            await disk.verify(entry);
            entry.mtime = +node.timestamp;
            entry.mode = node.mode;
            entries.push(entry);
          } else
            throw Error(
              "Migration interrompue : lien non pris en charge dans " +
                logical +
                ". L’ancienne sauvegarde est intacte.",
            );
        }
      };
      try {
        await walk(oldRoot);
        catalog = await disk.prepare(entries);
        await disk.publish(catalog);
      } catch (error) {
        await disk.discard(entries);
        throw error;
      }
    }
    // Every immutable object is checked before releasing the old RAM copy.
    const files = new Map();
    for (const e of catalog.entries)
      if (!e.directory) files.set(e.path, await disk.file(e));
    const clear = (path) => {
      for (const name of module.FS.readdir(path)) {
        if (name === "." || name === ".." || name.startsWith(".pbl-")) continue;
        const p = path + "/" + name;
        if (module.FS.isDir(module.FS.lstat(p).mode)) {
          clear(p);
          module.FS.rmdir(p);
        } else module.FS.unlink(p);
      }
    };
    clear(oldRoot);
    module.FS.mkdirTree(workspace.root);
    quota.relocateProject(workspace.root);
    for (const e of [...catalog.entries].sort(
      (a, b) => a.path.length - b.path.length,
    )) {
      if (e.directory) module.FS.mkdirTree(workspace.root + e.path);
      else workspace.attach(e, files.get(e.path));
    }
    // A SQL checkpoint is authoritative if the previous head update was interrupted.
    if (checkpoint?.diskGeneration) await disk.publish(catalog);
    for (const entry of catalog.entries)
      if (entry.directory && entry.mode)
        module.FS.chmod(workspace.root + entry.path, entry.mode);
    workspace.changes.clear();
    return workspace;
  }
  constructor(module, disk, quota, root) {
    Object.assign(this, { module, disk, quota, root });
    this.reader = new FileReaderSync();
    this.cache = new Map();
    this.cacheBytes = 0;
    this.pending = new Set();
    this.changes = new Set();
    const FS = module.FS;
    const normalize = (path) => {
      if (typeof path !== "string") return null;
      try {
        path = FS.lookupPath(path, { follow: false }).path;
      } catch {
        if (!path.startsWith("/")) path = FS.cwd() + "/" + path;
        if (path.startsWith("/workspace/"))
          path = root + path.slice("/workspace".length);
      }
      return path.startsWith(root + "/") ? path.slice(root.length) : null;
    };
    const changed = (path) => {
      const logical = normalize(path);
      if (logical) this.changes.add(logical);
    };
    for (const op of ["unlink", "rmdir", "mkdir"]) {
      const original = FS[op];
      FS[op] = (...args) => {
        const logical = normalize(args[0]);
        const result = original.apply(FS, args);
        if (logical) this.changes.add(logical);
        else changed(args[0]);
        return result;
      };
    }
    const write = FS.write;
    FS.write = (stream, ...args) => {
      try {
        return write.call(FS, stream, ...args);
      } finally {
        changed(FS.getPath(stream.node));
      }
    };
    const rename = FS.rename;
    FS.rename = (from, to) => {
      const logical = normalize(from);
      const result = rename.call(FS, from, to);
      if (logical) this.changes.add(logical);
      changed(to);
      return result;
    };
  }
  page(node, index) {
    const key = node.diskEntry.object + ":" + index;
    if (this.cache.has(key)) {
      const value = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    const value = new Uint8Array(
      this.reader.readAsArrayBuffer(
        node.diskSource.slice(index * 65536, (index + 1) * 65536),
      ),
    );
    this.cache.set(key, value);
    this.cacheBytes += value.length;
    while (this.cacheBytes > 4 * 1048576) {
      const oldest = this.cache.keys().next().value;
      this.cacheBytes -= this.cache.get(oldest).length;
      this.cache.delete(oldest);
    }
    return value;
  }
  read(node, buffer, offset, length, position) {
    let count = 0;
    length = Math.max(0, Math.min(length, node.diskSource.size - position));
    while (count < length) {
      const at = position + count,
        index = Math.floor(at / 65536),
        page = this.page(node, index),
        inside = at % 65536,
        n = Math.min(length - count, page.length - inside);
      if (n <= 0) break;
      buffer.set(page.subarray(inside, inside + n), offset + count);
      count += n;
    }
    return count;
  }
  materialize(node, targetSize = node.usedBytes) {
    if (node.diskDirty) return;
    if (targetSize > 16 * 1048576) throw new this.module.FS.ErrnoError(22);
    this.quota.assertMaterialize(node, targetSize);
    const data = new Uint8Array(Math.min(targetSize, node.diskSource.size));
    this.read(node, data, 0, data.length, 0);
    node.contents = data;
    node.usedBytes = data.length;
    node.diskDirty = true;
  }
  attach(entry, file) {
    const FS = this.module.FS,
      path = this.root + entry.path;
    if (FS.analyzePath(path).exists)
      throw Error("Fichier disque déjà présent : " + entry.path);
    FS.mkdirTree(path.slice(0, path.lastIndexOf("/")));
    FS.createDataFile(
      path.slice(0, path.lastIndexOf("/")),
      path.split("/").at(-1),
      new Uint8Array(),
      true,
      true,
    );
    const node = FS.lookupPath(path).node,
      ops = node.stream_ops,
      attrs = node.node_ops;
    node.diskSource = file;
    node.diskEntry = entry;
    node.diskDirty = false;
    node.contents = null;
    node.usedBytes = entry.size;
    node.timestamp = entry.mtime;
    if (entry.mode) node.mode = entry.mode;
    node.stream_ops = {
      ...ops,
      read: (stream, buffer, offset, length, position) =>
        node.diskDirty
          ? ops.read(stream, buffer, offset, length, position)
          : this.read(node, buffer, offset, length, position),
      write: (...args) => {
        this.materialize(node);
        return ops.write(...args);
      },
      allocate: (...args) => {
        this.materialize(node);
        return ops.allocate(...args);
      },
      // PHP must account its own full reads; an untracked whole-file mmap defeats that budget.
      mmap: () => {
        throw new FS.ErrnoError(43);
      },
    };
    node.node_ops = {
      ...attrs,
      setattr: (target, attr) => {
        if (attr.size !== undefined) this.materialize(node, attr.size);
        return attrs.setattr(target, attr);
      },
    };
    return node;
  }
  async register(entry) {
    const file = await this.disk.file(entry),
      previous = new Set(this.changes);
    this.attach(entry, file);
    this.changes = previous;
    this.pending.add(entry.object);
    return { written: entry.size };
  }
  async snapshot() {
    const FS = this.module.FS,
      entries = [],
      created = [];
    const walk = async (path) => {
      for (const name of FS.readdir(path)) {
        if (name === "." || name === ".." || name.startsWith(".pbl-")) continue;
        const full = path + "/" + name,
          logical = full.slice(this.root.length),
          node = FS.lookupPath(full, { follow: false }).node;
        if (FS.isDir(node.mode)) {
          entries.push({
            path: logical,
            directory: true,
            mtime: +node.timestamp,
            mode: node.mode,
          });
          await walk(full);
        } else if (FS.isFile(node.mode)) {
          if (node.diskSource && !node.diskDirty)
            entries.push({
              ...node.diskEntry,
              path: logical,
              mtime: +node.timestamp,
              mode: node.mode,
            });
          else {
            const bytes = FS.readFile(full),
              entry = await this.disk.put(logical, bytes, {
                size: bytes.length,
                internal: true,
              });
            created.push(entry);
            entries.push(entry);
          }
        } else throw Error("Ce lien ne peut pas être sauvegardé : " + logical);
      }
    };
    try {
      await walk(this.root);
      return { catalog: await this.disk.prepare(entries), created };
    } catch (error) {
      await this.disk.discard(created);
      throw error;
    }
  }
  async commit(catalog) {
    this.pending.clear();
    try {
      await this.disk.publish(catalog);
      await this.disk
        .collect()
        .catch((error) => console.warn("Nettoyage différé :", error.message));
    } catch {
      this.disk.catalog = catalog;
      console.warn(
        "Catalogue validé dans le checkpoint ; index de reprise à réparer à la prochaine ouverture.",
      );
    }
  }
  async discard() {
    await this.disk.discard([...this.pending].map((object) => ({ object })));
    this.pending.clear();
  }
  file(path) {
    const FS = this.module.FS,
      node = FS.lookupPath(this.root + path).node;
    if (!FS.isFile(node.mode)) throw Error("Ce chemin n’est pas un fichier.");
    return node.diskSource && !node.diskDirty
      ? {
          file: node.diskSource,
          version: node.diskEntry.version,
          type: node.diskEntry.type,
        }
      : {
          file: new Blob([FS.readFile(this.root + path)]),
          version: crypto.randomUUID(),
          type: node.diskEntry?.type,
        };
  }
  takeChanges() {
    const paths = [...this.changes];
    this.changes.clear();
    return paths;
  }
  catalog() {
    const FS = this.module.FS,
      entries = [];
    const walk = (path) => {
      for (const name of FS.readdir(path)) {
        if (name === "." || name === ".." || name.startsWith(".pbl-")) continue;
        const p = path + "/" + name,
          node = FS.lookupPath(p, { follow: false }).node,
          logical = p.slice(this.root.length);
        if (FS.isDir(node.mode)) {
          entries.push({ path: logical, directory: true });
          walk(p);
        } else
          entries.push({
            path: logical,
            size: node.usedBytes ?? 0,
            mtime: +node.timestamp,
            version: node.diskEntry?.version ?? null,
            kind:
              node.diskEntry?.kind ??
              (/\.(php|phtml|inc|html?|css|[cm]?js|jsx|tsx?|json|txt|md|csv|sql|svg)$/i.test(
                logical,
              )
                ? "text"
                : "binary"),
          });
      }
    };
    walk(this.root);
    return entries;
  }
  stats() {
    let files = 0,
      bytes = 0;
    const FS = this.module.FS,
      walk = (path) => {
        for (const name of FS.readdir(path)) {
          if (name === "." || name === "..") continue;
          const p = path + "/" + name,
            node = FS.lookupPath(p, { follow: false }).node;
          if (FS.isDir(node.mode)) walk(p);
          else {
            files++;
            bytes += node.usedBytes ?? 0;
          }
        }
      };
    walk(this.root);
    return {
      layout: "opfs",
      files,
      bytes,
      cacheBytes: this.cacheBytes,
      maxCacheBytes: 4 * 1048576,
      generation: this.disk.catalog?.id,
    };
  }
}
