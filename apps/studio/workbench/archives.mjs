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
    if (file.size > 65 * 1024 * 1024)
      throw Error("Archive limitée à 65 Mio compressés.");
    const entries = await zipTask(
        "read",
        new Uint8Array(await file.arrayBuffer()),
      ),
      metadata = entries.find((e) => e.name === ".pbl-backup/project.json");
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
      await hub.runtime.call("write", {
        path: "/workspace/" + entry.name,
        data: entry.bytes,
        expected: null,
      });
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
  async function exportProject() {
    const entries = [];
    let size = 0;
    for (const name of await files()) {
      const bytes = await hub.runtime.read("/workspace" + name);
      size += bytes.length;
      if (size > 64 * 1024 * 1024) throw Error("Export limité à 64 Mio.");
      entries.push({ name: name.slice(1), bytes });
    }
    const manifest = {
      format: "wasmwebserver-project",
      version: 1,
      name: hub.key,
      exportedAt: new Date().toISOString(),
      databases: [],
    };
    // A saved SQL database can be dormant after restart; exporting must still include it.
    for (const [name] of (await rows("SHOW DATABASES")).rows) {
      if (
        ["mysql", "sys", "information_schema", "performance_schema"].includes(
          name,
        )
      )
        continue;
      const bytes = await exportSQLDatabase(name);
      size += bytes.length;
      if (size > 64 * 1024 * 1024) throw Error("Export limité à 64 Mio.");
      const path = ".pbl-backup/database-" + manifest.databases.length + ".sql";
      entries.push({ name: path, bytes });
      manifest.databases.push({ name, path });
    }
    entries.push({
      name: ".pbl-backup/project.json",
      bytes: new TextEncoder().encode(JSON.stringify(manifest)),
    });
    return zipTask("write", entries);
  }
  return { exportProject, exportSQLDatabase, importProjectArchive };
}
