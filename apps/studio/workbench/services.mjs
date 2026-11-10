import { ProjectDisk } from "/packages/runtime/src/project-disk.mjs";
import { relationModel } from "../database/relation-model.mjs";
/** Direct application services over the existing project owner; no simulated backend. */
import { ProjectHub } from "../project-hub.mjs";
import { readState, writeState, deleteState } from "../state.mjs";
import { splitSQL } from "../database/sql-script.mjs";
import { identifier as id, literal as lit } from "../database/sql-values.mjs";
import { projectArchives } from "./archives.mjs";
const SYSTEM = new Set([
  "mysql",
  "sys",
  "information_schema",
  "performance_schema",
]);
const W = "/workspace";
const decoder = new TextDecoder("utf-8", { fatal: true });
export function validPath(value) {
  if (
    typeof value !== "string" ||
    value.length > 4096 ||
    !value.startsWith("/") ||
    value
      .split("/")
      .slice(1)
      .some(
        (p) =>
          !p ||
          p === "." ||
          p === ".." ||
          p === ".git" ||
          p === ".sessions" ||
          p.startsWith(".pbl-") ||
          /[\x00-\x1f]/.test(p),
      )
  )
    throw Error("Chemin invalide ou réservé.");
  return W + value;
}
export function download(bytes, name, type = "application/octet-stream") {
  const a = document.createElement("a"),
    url = URL.createObjectURL(new Blob([bytes], { type }));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function createStudioServices() {
  let opening = false;
  let hub = null,
    recents = [],
    sqlReady = false,
    memory = null,
    archives,
    closing = false;
  const bus = new Map(),
    emit = (type, data) => {
      for (const fn of bus.get(type) ?? []) fn(data);
    };
  const runtime = () => {
    if (!hub || closing) throw Error("Aucun projet disponible.");
    return hub.runtime;
  };
  const q = async (sql, db) => {
    const result = await runtime().sql(sql, db);
    sqlReady = true;
    return result.rows;
  };
  async function walk(path = W, depth = 0) {
    if (path === W && hub?.diskEnabled) {
      return (await runtime().call("diskCatalog"))
        .filter(
          (e) =>
            !e.directory &&
            !e.path
              .split("/")
              .some((p) => p === ".sessions" || p.startsWith(".pbl-")),
        )
        .map((e) => ({
          ...e,
          storeKind: e.kind,
          kind:
            e.size > 1048576
              ? "big"
              : ["code", "text", "svg"].includes(e.kind)
                ? "text"
                : "bin",
        }));
    }
    if (depth > 12) throw Error("Arborescence trop profonde.");
    const out = [];
    for (const name of await runtime().list(path)) {
      if (
        name === "." ||
        name === ".." ||
        name === ".sessions" ||
        name === ".git" ||
        name.startsWith(".pbl-")
      )
        continue;
      const full = path + "/" + name,
        stat = await runtime().call("stat", { path: full });
      if (stat.directory) out.push(...(await walk(full, depth + 1)));
      else
        out.push({
          path: full.slice(W.length),
          size: stat.size,
          kind: /\.(png|jpe?g|gif|webp|ico|zip|pdf|woff2?|ttf|otf|mp[34]|wasm)$/i.test(
            name,
          )
            ? "bin"
            : stat.size > 1024 * 1024
              ? "big"
              : "text",
        });
      if (out.length > 1024) throw Error("Affichage limité à 1 024 fichiers.");
    }
    return out;
  }
  const paths = async () => (await walk()).map((f) => f.path);
  async function remember() {
    const entry = {
      key: hub.key,
      files: (await paths()).length,
      updatedAt: new Date().toISOString(),
    };
    const current = (await readState("project-index")) ?? [];
    await writeState(
      "project-index",
      [entry, ...current.filter((p) => p.key !== entry.key)].slice(0, 40),
    );
    recents = await readState("project-index");
  }
  async function initWorker() {
    if (!isSecureContext || !navigator.serviceWorker)
      throw Error("Ouvrez ALWIS en HTTPS ou sur localhost.");
    await navigator.serviceWorker.register("/service-worker.js", {
      type: "module",
      scope: "/",
    });
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((r) =>
        navigator.serviceWorker.addEventListener("controllerchange", r, {
          once: true,
        }),
      );
  }
  navigator.serviceWorker?.addEventListener("message", (event) => {
    const data = event.data;
    const reply = (ok, value, error) =>
      event.ports[0]?.postMessage(
        { ok, value, error },
        value?.body ? [value.body.buffer] : [],
      );
    if (data?.type === "pbl-discover") {
      reply(true, !!hub && hub.key === data.project);
      return;
    }
    if (!hub) {
      reply(false, null, "Projet fermé");
      return;
    }
    if (data?.type === "pbl-route")
      hub.route(data.session, data.request).then(
        (r) => {
          emit("changed", {});
          reply(true, r);
        },
        (e) => reply(false, null, e.message),
      );
    if (data?.type === "pbl-cookie")
      hub.setCookie(data.session, data.value, data.url).then(
        (r) => reply(true, r),
        (e) => reply(false, null, e.message),
      );
  });
  async function measure() {
    if (!hub || hub.runtime.closed) return null;
    const s = await runtime().state();
    sqlReady = s.sqlPhase === "running";
    memory = {
      heap: (s.allocator?.usedBytes ?? s.allocatorUsedBytes ?? 0) / 1048576,
      cap: (s.linearMemoryBytes ?? s.memoryBytes ?? 0) / 1048576,
      vfs: s.vfs?.groups?.project?.bytes ?? 0,
      raw: s,
    };
    return memory;
  }
  const services = {
    kind: "native",
    caps: { removeSession: true, mkdir: false },
    /** Multi-user guests replay the host's change events locally. */
    emit: (type, data) => emit(type, data),
    on(type, fn) {
      if (!bus.has(type)) bus.set(type, new Set());
      bus.get(type).add(fn);
      return () => bus.get(type).delete(fn);
    },
    async initialize() {
      recents = (await readState("project-index")) ?? [];
      await initWorker();
    },
    env: () => ({
      php: "8.4.27",
      maria: "MariaDB",
      isolated: !!crossOriginIsolated,
      persistent: !!hub,
    }),
    projects: {
      async remove(name) {
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(name))
          throw Error("Projet invalide.");
        if (hub?.key === name)
          throw Error("Fermez ce projet avant de le supprimer.");
        await navigator.locks.request(
          "pbl-project:" + name,
          { mode: "exclusive", ifAvailable: true },
          async (lock) => {
            if (!lock)
              throw Error("Ce projet est ouvert dans une autre fenêtre.");
            for (const path of [
              "/.pbl/projects/@v2/" + name,
              "/.pbl/projects/" + name,
              "/.pbl/sql/" + name,
            ])
              await new Promise((resolve, reject) => {
                const req = indexedDB.deleteDatabase(path);
                req.onsuccess = resolve;
                req.onerror = () => reject(req.error);
                req.onblocked = () =>
                  reject(Error("Fermez les autres fenêtres de ce projet."));
              });
            if (navigator.storage?.getDirectory) await ProjectDisk.remove(name);
            await deleteState([
              "alwis-workspace:" + name,
              "sessions:" + name,
              "tool:" + name + ":editor",
              "tool:" + name + ":schema",
              "tool:" + name + ":sql",
            ]);
            recents = ((await readState("project-index")) ?? []).filter(
              (p) => p.key !== name,
            );
            await writeState("project-index", recents);
          },
        );
      },
      exportFolderData: () => archives.exportProject({ dataOnly: true }),
      recents: () =>
        recents.map((p) => ({
          name: p.key,
          files: p.files,
          when: new Intl.DateTimeFormat("fr", {
            dateStyle: "short",
            timeStyle: "short",
          }).format(new Date(p.updatedAt)),
          saved: true,
        })),
      async open(name, template, progress = () => {}) {
        if (opening || hub)
          throw Error("Un projet est déjà ouvert ou en cours d’ouverture.");
        opening = true;
        try {
          if (!/^[A-Za-z0-9_-]{1,64}$/.test(name))
            throw Error(
              "Nom de projet : 1 à 64 lettres, chiffres, tirets ou underscore.",
            );
          if (hub)
            throw Error("Fermez le projet courant avant d’en ouvrir un autre.");
          progress("Préparation du moteur PHP…");
          await initWorker();
          progress("Ouverture du stockage du projet…");
          hub = await ProjectHub.open(name);
          sqlReady = false;
          memory = null;
          hub.onRequest = (r) =>
            emit("request", {
              ...r,
              session: r.session,
              t: new Date().toLocaleTimeString("fr"),
              ms: Math.round(r.durationMs),
            });
          hub.onDiagnostic = (message, details) =>
            emit("log", { l: "e", msg: message, detail: details });
          navigator.serviceWorker.controller.postMessage({
            type: "pbl-owner",
            project: name,
          });
          archives = projectArchives(hub, paths);
          if (template === "empty" && !(await paths()).length)
            await runtime().call("write", {
              path: validPath("/index.php"),
              data: '<?php\necho \"Bienvenue dans ALWIS\";\n',
              expected: null,
            });
          if (template === "demo" && !(await paths()).length) {
            progress("Création des fichiers du Campus…");
            const { files } = await import("../school-demo.mjs");
            for (const [path, text] of Object.entries(files))
              await runtime().call("write", {
                path: validPath("/" + path.replace(/^\//, "")),
                data: text,
                expected: null,
              });
            progress("Installation des données du Campus…");
            const installed = await runtime().request({
              script: "/workspace/install.php",
            });
            if (installed.exitCode !== 0 || installed.status >= 400)
              throw Error(
                decoder.decode(installed.stderr) || "Installation scolaire impossible.",
              );
            progress("Préparation des sessions de démonstration…");
            const first = [...hub.sessions.sessions.values()][0];
            first.label = "Administration";
            for (const label of ["Professeur", "Élève", "Parent"])
              await hub.createSession(label);
            const identities = [1, 2, 4, 6];
            let index = 0;
            await runtime().write(
              "/workspace/.demo-profile.php",
              '<?php session_start(); $_SESSION["user_id"]=(int)($_GET["user"]??1);',
            );
            for (const session of hub.sessions.sessions.values())
              await hub.route(session.id, {
                url:
                  location.origin +
                  "/.demo-profile.php?user=" +
                  identities[index++],
                method: "GET",
              });
            await runtime().call("remove", {
              path: "/workspace/.demo-profile.php",
            });
          }
          await remember();
          await measure();
          return {
            defaultDB: template === "demo" ? "school" : "test",
            name,
            initialized: template === "demo" || template === "empty",
          };
        } catch (error) {
          if (hub) {
            const failed = hub;
            hub = null;
            try {
              await failed.close({ save: false });
            } catch {}
            navigator.serviceWorker.controller?.postMessage({
              type: "pbl-release",
              project: failed.key,
            });
          }
          throw error;
        } finally {
          opening = false;
        }
      },
      async save() {
        await hub.saveAndRestart();
        await remember();
        await measure();
      },
      async close(options) {
        if (!hub) return;
        closing = true;
        try {
          await hub.close(options);
          navigator.serviceWorker.controller.postMessage({
            type: "pbl-release",
            project: hub.key,
          });
          hub = null;
          sqlReady = false;
          memory = null;
        } finally {
          closing = false;
        }
      },
      async exportZip() {
        await hub.freeze();
        try {
          download(
            await archives.exportProject(),
            hub.key + ".zip",
            "application/zip",
          );
        } finally {
          hub.busy = false;
        }
      },
      async importDiskEntries(entries) {
        const existing = new Set(await paths());
        if (entries.some((e) => existing.has(e.path)))
          throw Error(
            "Un fichier sélectionné existe déjà. Ouvrez un projet vide pour préserver ses données.",
          );
        for (const entry of entries) {
          await runtime().call("attachDiskFile", { entry });
          hub.rememberDiskFile(entry);
        }
        await remember();
      },
      async importZip(file) {
        await archives.importProjectArchive(file);
        await remember();
      },
      async loadWorkspace() {
        const current = await readState("alwis-workspace:" + hub.key);
        if (current) return current;
        const old = await readState("tool:" + hub.key + ":editor");
        if (!old) return null;
        const oldSchema = await readState("tool:" + hub.key + ":schema"),
          oldSQL = await readState("tool:" + hub.key + ":sql");
        const drafts = {};
        for (const path of old.openFiles ?? []) {
          const d = await readState("draft:" + hub.key + ":" + path);
          if (d) drafts[path] = d;
        }
        if (old.path) drafts[old.path] = old;
        return {
          db: oldSQL?.database ?? oldSchema?.database ?? "test",
          layouts:
            oldSchema?.layouts ??
            (oldSchema?.positions
              ? { [oldSchema.database ?? "test"]: oldSchema.positions }
              : {}),
          query: oldSQL?.query,
          tabs: old.openFiles ?? [old.path],
          active: old.path,
          base: Object.fromEntries(
            Object.entries(drafts).map(([p, d]) => [p, d.base]),
          ),
          drafts: Object.fromEntries(
            Object.entries(drafts)
              .filter(([, d]) => d.dirty)
              .map(([p, d]) => [p, d.text]),
          ),
        };
      },
      async saveWorkspace(value) {
        await writeState("alwis-workspace:" + hub.key, value);
      },
    },
    fs: {
      async importFile(path, file) {
        validPath(path);
        await hub.freeze();
        let entry;
        try {
          const current = await runtime().call("diskCatalog");
          if (current.some((e) => e.path === path))
            throw Error("Ce fichier existe déjà. Renommez-le avant l’import.");
          const files = current.filter(
            (e) => !e.directory && !e.path.startsWith("/.sessions/"),
          );
          if (
            files.length >= 10000 ||
            files.reduce((n, e) => n + e.size, 0) + file.size >
              2 * 1024 * 1048576
          )
            throw Error("Le projet dépasse 2 Gio ou 10 000 fichiers.");
          entry = await hub.diskStore.put(path, file);
          await runtime().call("attachDiskFile", { entry });
          hub.rememberDiskFile(entry);
        } catch (error) {
          if (entry) await hub.diskStore.discard([entry]);
          throw error;
        } finally {
          hub.busy = false;
        }
      },
      list: walk,
      async read(path) {
        const info = await runtime().call("stat", { path: validPath(path) });
        if (info.size > 1048576) return { bin: info.size, limited: true };
        const bytes = await runtime().read(validPath(path));
        try {
          if (bytes.includes(0)) return { bin: bytes.length };
          return { text: decoder.decode(bytes) };
        } catch {
          return { bin: bytes.length };
        }
      },
      async download(path) {
        const value = hub?.diskEnabled
          ? await runtime().call("diskFile", { path: validPath(path) })
          : { file: await runtime().read(validPath(path)) };
        download(value.file, path.split("/").pop(), value.type);
      },
      async preview(path) {
        return new TextDecoder().decode(
          await runtime().call("previewFile", { path: validPath(path) }),
        );
      },
      async write(path, data, expected = null) {
        if (expected === null) {
          const result = await runtime().writeNew(validPath(path), data);
          hub.invalidate(path);
          return result;
        }
        await runtime().call("write", {
          path: validPath(path),
          data,
          expected,
        });
        hub.invalidate(path);
      },
      async remove(path) {
        await runtime().remove(validPath(path));
        hub.invalidate(path);
        emit("changed", { kind: "files", path });
      },
      async move(a, b) {
        await runtime().call("rename", {
          path: validPath(a),
          target: validPath(b),
          exclusive: true,
        });
        hub.invalidate(a);
        hub.invalidate(b);
      },
      async context() {
        const files = {},
          projectDefinitions = {};
        let size = 0;
        for (const f of (await walk())
          .filter((f) =>
            /\.(php|phtml|inc|html?|css|[cm]?js|jsx|tsx?|json)$/i.test(f.path),
          )
          .slice(0, 64)) {
          if (f.size > 65536 || size + f.size > 1048576) continue;
          const result = await this.read(f.path);
          if (result.text !== undefined) {
            files[f.path] = result.text;
            size += f.size;
            if (f.path.endsWith(".d.ts"))
              projectDefinitions[f.path] = result.text;
          }
        }
        return { files, projectDefinitions };
      },
    },
    db: {
      get ready() {
        return sqlReady;
      },
      async init() {
        await q("SELECT 1", "mysql");
      },
      async databases() {
        return (await q("SHOW DATABASES", "mysql")).map(([name]) => ({
          name,
          system: SYSTEM.has(name),
        }));
      },
      async query(sql, db) {
        const statements = splitSQL(sql, { maxStatements: 4096 });
        if (!statements.length) throw Error("Écrivez une instruction SQL.");
        if (
          statements.some(
            (s) => !/^\s*(SELECT|SHOW|DESCRIBE|EXPLAIN)\b/i.test(s),
          )
        )
          emit("changed", { kind: "sql" });
        const results = [];
        for (let i = 0; i < statements.length; i += 32)
          results.push(
            ...(await runtime().sqlScript(statements.slice(i, i + 32), db)),
          );
        sqlReady = true;
        return results.map((r, i) => ({
          ...r,
          sql: statements[i],
          columns: r.columns?.length ? r.columns.map((c) => c.name) : null,
          metadata: r.columns,
          affected: r.affectedRows ?? 0,
          msg: r.columns?.length ? undefined : "Requête exécutée",
        }));
      },
      async close() {
        if (hub) await runtime().closeConsole();
      },
      async export(db) {
        download(
          await archives.exportSQLDatabase(db),
          db + ".sql",
          "application/sql",
        );
      },
      async import(file, db) {
        if (file.size > 8 * 1048576) throw Error("Import SQL limité à 8 Mio.");
        return this.query(await file.text(), db);
      },
      async catalog(db) {
        const d = lit(db);
        const [tables, cols, fks, idx] = await Promise.all([
          q(
            `SELECT TABLE_NAME,TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA=${d} ORDER BY TABLE_NAME LIMIT 50`,
            db,
          ),
          q(
            `SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_KEY,COLUMN_DEFAULT,EXTRA,COLUMN_COMMENT,CHARACTER_SET_NAME,COLLATION_NAME,GENERATION_EXPRESSION FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=${d} ORDER BY TABLE_NAME,ORDINAL_POSITION LIMIT 2001`,
            db,
          ),
          q(
            `SELECT k.TABLE_NAME,k.COLUMN_NAME,k.CONSTRAINT_NAME,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,r.DELETE_RULE,r.UPDATE_RULE,k.ORDINAL_POSITION FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.TABLE_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=${d} AND k.REFERENCED_TABLE_NAME IS NOT NULL ORDER BY k.TABLE_NAME,k.CONSTRAINT_NAME,k.ORDINAL_POSITION`,
            db,
          ),
          q(
            `SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=${d} ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX`,
            db,
          ),
        ]);
        if (cols.length > 2000) throw Error("Schéma limité à 2 000 colonnes.");
        const out = [];
        for (const [name, kind] of tables) {
          const ddl =
            (await q(`SHOW CREATE TABLE ${id(name)}`, db))[0]?.[1] ?? "";
          const indexes = [];
          for (const row of idx.filter((r) => r[0] === name)) {
            let i = indexes.find((x) => x.name === row[1]);
            if (!i)
              indexes.push(
                (i = {
                  name: row[1],
                  unique: String(row[2]) === "0",
                  columns: [],
                }),
              );
            i.columns.push(row[3]);
          }
          const keys = [];
          for (const row of fks.filter((r) => r[0] === name)) {
            let f = keys.find((k) => k.name === row[2]);
            if (!f)
              keys.push(
                (f = {
                  name: row[2],
                  column: row[1],
                  refTable: row[3],
                  refColumn: row[4],
                  columns: [],
                  refColumns: [],
                  onDelete: row[5],
                  onUpdate: row[6],
                }),
              );
            f.columns.push(row[1]);
            f.refColumns.push(row[4]);
          }
          out.push({
            name,
            kind,
            rows: "—",
            ddl,
            indexes,
            fks: keys,
            columns: cols
              .filter((r) => r[0] === name)
              .map((r) => ({
                name: r[1],
                type: r[2],
                nullable: r[3] === "YES",
                key: r[4],
                default: r[5],
                extra: r[6] ?? "",
                comment: r[7] ?? "",
                charset: r[8],
                collation: r[9],
                generation: r[10],
              })),
          });
        }
        const model = relationModel(
          out.flatMap((t) =>
            t.columns.map((c) => [
              t.name,
              c.name,
              c.type,
              c.key,
              c.nullable ? "YES" : "NO",
            ]),
          ),
          out.flatMap((t) =>
            t.fks.flatMap((f) =>
              f.columns.map((c, i) => [
                t.name,
                f.refTable,
                c,
                f.refColumns[i],
                f.name,
                i + 1,
                db,
              ]),
            ),
          ),
          out.flatMap((t) =>
            t.indexes.flatMap((index) =>
              index.columns.map((c, i) => [
                t.name,
                index.name,
                index.unique ? 0 : 1,
                c,
                i + 1,
              ]),
            ),
          ),
        );
        for (const t of out)
          for (const f of t.fks) {
            const relation = model.relations.find(
              (r) => r.from === t.name && r.constraint === f.name,
            );
            Object.assign(f, {
              childRange: relation?.childRange,
              parentRange: relation?.parentRange,
              parentUnique: relation?.parentUnique,
            });
          }
        return { tables: out };
      },
    },
    sessions: {
      // Host-only HTTP entry point for a future permission-gated collaborative
      // gateway. Reuse ProjectHub cookies, PHP sessions, routing and SQL locks.
      route: (session, request) => {
        if (!hub || closing) throw Error("Projet fermé");
        return hub.route(session, request);
      },
      async run(session, path) {
        validPath(path);
        if (!/\.php$/i.test(path)) throw Error("Choisissez un fichier PHP.");
        const result = await hub.route(session, {
          url: new URL(path, location.origin).href,
          method: "GET",
        });
        emit("changed", {});
        return {
          status: result.status,
          text: new TextDecoder().decode(result.body.subarray(0, 65536)),
          truncated: result.body.byteLength > 65536,
        };
      },
      list: () =>
        hub
          ? [...hub.sessions.sessions.values()].map((s, i) => ({
              id: s.id,
              label: s.label,
              hue: ["#276ac4", "#9c5718", "#7851b5", "#117969", "#b93864"][
                i % 5
              ],
              short: s.id.slice(0, 8),
              cookies: s.jar.publicEntries(),
              hidden: s.jar.entries.filter((c) => c.httpOnly).length,
            }))
          : [],
      create: (label) => hub.createSession(label),
      remove: (id) => hub.removeSession(id),
      async rename(session, label) {
        label = String(label).trim();
        if (!label || label.length > 80)
          throw Error("Nom de session : 1 à 80 caractères.");
        hub.sessions.get(session).label = label;
        await hub.saveSessions();
      },
      async setCookie(session, name, value) {
        if (
          !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
          /[;\r\n\0]/.test(value)
        )
          throw Error("Nom ou valeur de cookie invalide.");
        await hub.setCookie(
          session,
          `${name}=${value}; Path=/`,
          location.origin + "/",
        );
      },
      async deleteCookie(session, name) {
        await hub.setCookie(
          session,
          `${name}=; Path=/; Max-Age=0`,
          location.origin + "/",
        );
      },
      async clearCookies(session) {
        for (const c of hub.sessions.get(session).jar.publicEntries())
          await hub.setCookie(
            session,
            `${c.name}=; Path=${c.path}; Max-Age=0`,
            location.origin + "/",
          );
      },
      routeURL: (session, path) => hub.routeURL(session, path),
      async frame(session, path) {
        return { src: hub.routeURL(session, path) };
      },
    },
    memory: () => memory,
    measure,
  };
  return services;
}
