import test from "node:test";
import assert from "node:assert/strict";
import {
  archiveProjectName,
  unusedArchiveName,
} from "../apps/studio/workbench/project-name.mjs";
test("ZIP import names normalize accents and avoid existing projects", () => {
  assert.equal(archiveProjectName("Mon été.zip", []), "Mon-ete");
  assert.equal(
    archiveProjectName("site.ZIP", [{ name: "site" }, { name: "site-2" }]),
    "site-3",
  );
  assert.equal(archiveProjectName("🏫.zip", []), "projet-importe");
  const name = "a".repeat(64);
  assert.equal(
    archiveProjectName(name + ".zip", [{ name }]),
    "a".repeat(62) + "-2",
  );
  assert.match(
    archiveProjectName("../../projet ?!.zip", []),
    /^[A-Za-z0-9_-]{1,64}$/,
  );
});

test("ZIP names also protect projects absent from the recent list", async () => {
  assert.equal(
    await unusedArchiveName("ancien.zip", [], {
      databases: async () => [
        { name: "/.pbl/projects/@v2/ancien" },
        { name: "/.pbl/sql/ancien-2" },
      ],
    }),
    "ancien-3",
  );
  const name = await unusedArchiveName("ancien.zip", [], {
    databases: async () => {
      throw Error("unavailable");
    },
  });
  assert.match(name, /^ancien-[a-z0-9-]+$/);
  assert.ok(name.length <= 64);
});
