// Fake in-memory engine so the real ALWIS interface can run in a plain browser (tests only).
export function createStudioServices() {
  const bus = new Map();
  const emit = (t, d) => { for (const f of bus.get(t) ?? []) f(d); };
  const files = {
    "/index.php": "<?php\n$users = db()->query('SELECT * FROM users');\nforeach ($users as $u) {\n  echo htmlspecialchars($u['name']);\n}\n",
    "/style.css": "body { margin: 0; }\n",
    "/lib/util.php": "<?php\nfunction db() { return null; }\n",
  };
  const tables = {
    users: { cols: [["id","int(11)","NO","PRI",null,"auto_increment"],["name","varchar(80)","NO","",null,""],["email","varchar(120)","YES","",null,""]], rows: [[1,"Ada","ada@example.org"],[2,"Grace","grace@example.org"],[3,"Linus",null]] },
    posts: { cols: [["id","int(11)","NO","PRI",null,"auto_increment"],["user_id","int(11)","NO","MUL",null,""],["title","varchar(120)","NO","",null,""]], rows: [[1,1,"Hello"],[2,2,"Compilers"]] },
  };
  const catalog = () => ({ tables: Object.entries(tables).map(([name, t]) => ({
    name, kind: "BASE TABLE", rows: t.rows.length, ddl: `CREATE TABLE \`${name}\` (...)`,
    indexes: [{ name: "PRIMARY", unique: true, columns: ["id"] }],
    fks: name === "posts" ? [{ name: "fk_posts_user", column: "user_id", refTable: "users", refColumn: "id", columns: ["user_id"], refColumns: ["id"], onDelete: "CASCADE", onUpdate: "CASCADE" }] : [],
    columns: t.cols.map(([n, type, nl, key, def, extra]) => ({ name: n, type, nullable: nl === "YES", key, default: def, extra, comment: "", charset: null, collation: null, generation: null })),
  })) });
  const result = (columns, rows, sql) => ({ columns, rows, sql, metadata: columns.map((name) => ({ name })), affected: 0 });
  let sess = 0;
  const api = {
    kind: "fake", caps: { removeSession: true, mkdir: false },
    on(type, fn) { if (!bus.has(type)) bus.set(type, new Set()); bus.get(type).add(fn); return () => bus.get(type).delete(fn); },
    emit,
    async initialize() {}, async measure() {}, memory: () => null, env: () => ({ php: "8.4", maria: "MariaDB", isolated: true, persistent: true }),
    projects: new Proxy({ recents: () => [] }, { get: (t, k) => (k in t ? t[k] : async () => ({})) }),
    fs: {
      async list() { return Object.keys(files).map((path) => ({ path, size: files[path].length, kind: "text", storeKind: "code" })); },
      async read(p) { if (!(p in files)) throw Error("Fichier introuvable"); return { text: files[p] }; },
      async write(p, d) { files[p] = d; emit("changed", { kind: "files", path: p }); },
      async remove(p) { delete files[p]; emit("changed", { kind: "files", path: p }); },
      async move(a, b) { files[b] = files[a]; delete files[a]; },
      async context() { return null; },
    },
    db: {
      ready: true, async init() {}, async close() {},
      async databases() { return [{ name: "test", system: false }]; },
      async catalog() { return catalog(); },
      async query(sql) {
        const t = /FROM\s+`?(\w+)`?/i.exec(sql)?.[1];
        if (/COUNT\(/i.test(sql) && tables[t]) return [result(["COUNT(*)"], [[tables[t].rows.length]], sql)];
        if (/^\s*SELECT\s+1\b/i.test(sql)) return [result(["1"], [[1]], sql)];
        if (tables[t]) return [result(tables[t].cols.map((c) => c[0]), tables[t].rows, sql)];
        if (!/^\s*(SELECT|SHOW)/i.test(sql)) emit("changed", { kind: "sql" });
        return [{ columns: null, rows: [], sql, affected: 0, msg: "Requête exécutée" }];
      },
    },
    sessions: {
      list() { return [{ id: "s1", label: "Session 1", hue: "#276ac4", short: "1", cookies: [], hidden: 0 }]; },
      async create() { return "s1"; },
      async run() { return { status: 200, ms: 4 }; },
      async frame(_id, path) { return { src: "/demo/page.html" }; },
      routeURL: () => "/demo/page.html",
    },
  };
  return api;
}
