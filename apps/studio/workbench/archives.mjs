import { streamZip } from "../zip-stream.mjs";
import { zipTask } from "../archive-service.mjs";
import { splitSQL } from "../database/sql-script.mjs";
import { identifier } from "../database/sql-values.mjs";
const decoder = new TextDecoder();
export function projectArchives(hub, files) {
  const rows = (sql, database) => hub.runtime.sql(sql, database);
  async function exportSQLDatabase(database) {
    const tool = "/workspace/.pbl-export-" + crypto.randomUUID();
    const response = await fetch("/apps/studio/sql-export.source.txt");
    if (!response.ok) throw Error("Outil d’export indisponible.");
    await hub.runtime.write(tool + ".php", await response.text());
    try {
      const result = await hub.runtime.request({
        script: tool + ".php",
        url: new URL(
          "/export.php?database=" + encodeURIComponent(database),
          location.href,
        ).href,
      });
      if (result.exitCode !== 0)
        throw Error(decoder.decode(result.stderr) || "Export SQL échoué.");
      const info = JSON.parse(decoder.decode(result.body));
      if (!info.ok) throw Error("Export SQL incomplet.");
      return await hub.runtime.read(tool + ".php.sql");
    } finally {
      for (const suffix of [".php", ".php.sql"])
        try {
          await hub.runtime.remove(tool + suffix);
        } catch {}
    }
  }
  async function importProjectArchive(file) {
    if (!Array.isArray(file) && file.size > 65 * 1024 * 1024)
      throw Error("Archive limitée à 65 Mio compressés.");
    const entries = Array.isArray(file)
        ? file
        : await zipTask("read", new Uint8Array(await file.arrayBuffer())),
      metadata = entries.find((e) => e.name === ".pbl-backup/project.json");
    if (
      entries.length > 1024 ||
      entries.reduce((n, e) => n + e.bytes.length, 0) > 64 * 1048576 ||
      entries.some(
        (e) =>
          !(e.bytes instanceof Uint8Array) || e.bytes.length > 16 * 1048576,
      ) ||
      new Set(entries.map((e) => e.name)).size !== entries.length
    )
      throw Error(
        "La sélection dépasse les limites du projet ou contient des doublons.",
      );
    let manifest;
    if (metadata) {
      if (metadata.bytes.length > 65536)
        throw Error("Manifeste de projet trop volumineux.");
      manifest = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(metadata.bytes),
      );
      if (
        manifest.format !== "wasmwebserver-project" ||
        manifest.version !== 1 ||
        !Array.isArray(manifest.databases) ||
        manifest.databases.length > 32
      )
        throw Error("Format de sauvegarde non reconnu.");
    }
    // Validate every destination and collision before the first write.
    const imported = entries.filter((e) => !e.name.startsWith(".pbl-backup/")),
      existing = new Set(await files());
    for (const entry of imported) {
      if (
        entry.name
          .split("/")
          .some(
            (p) =>
              !p ||
              p === "." ||
              p === ".sessions" ||
              p === ".git" ||
              p.startsWith(".pbl-"),
          )
      )
        throw Error("Chemin interne refusé dans le ZIP.");
      if (existing.has("/" + entry.name))
        throw Error(
          "Le fichier " +
            entry.name +
            " existe déjà. Importez dans un projet vide pour préserver ses données.",
        );
    }
    const sql = [];
    for (const database of manifest?.databases ?? []) {
      if (
        typeof database.name !== "string" ||
        !database.name ||
        database.name.length > 64 ||
        ["mysql", "information_schema", "performance_schema", "sys"].includes(
          database.name,
        )
      )
        throw Error("Base réservée ou invalide dans le ZIP.");
      const entry = entries.find(
        (e) => e.name === database.path && e.name.startsWith(".pbl-backup/"),
      );
      if (!entry || entry.bytes.length > 8 * 1024 * 1024)
        throw Error("Sauvegarde SQL absente ou supérieure à 8 Mio.");
      sql.push({
        name: database.name,
        statements: splitSQL(
          new TextDecoder("utf-8", { fatal: true }).decode(entry.bytes),
          { maxStatements: 4096 },
        ),
      });
    }
    if (sql.length) {
      const current = await rows("SHOW DATABASES");
      for (const db of sql) {
        if (current.rows.some((r) => r[0] === db.name)) {
          const tables = await rows("SHOW TABLES", db.name);
          if (tables.rows.length)
            throw Error(
              "La base " +
                db.name +
                " contient déjà des tables. Utilisez un projet vide.",
            );
        }
      }
    }
    for (const entry of imported)
      await hub.runtime.writeNew("/workspace/" + entry.name, entry.bytes);
    // DDL cannot be rolled back as a project-wide transaction: a failed import is reported explicitly.

    for (const db of sql) {
      try {
        await rows(
          "CREATE DATABASE IF NOT EXISTS " +
            identifier(db.name) +
            " CHARACTER SET utf8mb4",
        );
        for (let i = 0; i < db.statements.length; i += 32)
          await hub.runtime.sqlScript(db.statements.slice(i, i + 32), db.name);
      } catch (error) {
        throw Error(
          "Import partiel de " +
            db.name +
            " : les fichiers et certaines instructions peuvent être appliqués. " +
            error.message,
        );
      }
    }
  }
  async function exportProject({ dataOnly = false } = {}) {
    const entries = [];
    let size = 0,
      sqlSize = 0;
    for (const name of dataOnly ? [] : await files()) {
      const info = await hub.runtime.call("stat", {
        path: "/workspace" + name,
      });
      size += info.size;
      if (size > 2 * 1024 * 1048576)
        throw Error("Export disque limité à 2 Gio de fichiers.");
      entries.push({
        name: name.slice(1),
        size: info.size,
        open: async () =>
          hub.diskEnabled
            ? (
                await hub.runtime.call("diskFile", {
                  path: "/workspace" + name,
                })
              ).file
            : new Blob([await hub.runtime.read("/workspace" + name)]),
      });
    }
    const manifest = {
      format: "wasmwebserver-project",
      version: 1,
      name: hub.key,
      exportedAt: new Date().toISOString(),
      databases: [],
    };
    // Keep pure-PHP archives lazy, but include SQL files persisted before a restart.
    const state = await hub.runtime.state(),
      sqlFiles = state.vfs?.groups?.sql;
    if (state.sqlPhase !== "dormant" || !sqlFiles || sqlFiles.bytes > 0)
      for (const [name] of (await rows("SHOW DATABASES")).rows) {
        if (
          ["mysql", "sys", "information_schema", "performance_schema"].includes(
            name,
          )
        )
          continue;
        const bytes = await exportSQLDatabase(name);
        size += bytes.length;
        sqlSize += bytes.length;
        if (sqlSize > 64 * 1048576) throw Error("Export SQL limité à 64 Mio.");
        const path =
          ".pbl-backup/database-" + manifest.databases.length + ".sql";
        entries.push({ name: path, bytes });
        manifest.databases.push({ name, path });
      }
    entries.push({
      name: ".pbl-backup/project.json",
      bytes: new TextEncoder().encode(JSON.stringify(manifest)),
    });
    if (dataOnly) return zipTask("write", entries);
    return streamZip(
      entries.map((e) =>
        e.bytes
          ? { name: e.name, size: e.bytes.length, file: new Blob([e.bytes]) }
          : e,
      ),
    );
  }
  return { exportProject, exportSQLDatabase, importProjectArchive };
}
