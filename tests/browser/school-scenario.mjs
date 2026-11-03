import assert from "node:assert/strict";
/** Run against an already opened demo in the actual shipped studio. */
export async function schoolScenario(page, assetBase) {
  const catalog = await page.evaluate(async (base) => {
    const { ctx } = await import(base + "/apps/studio/workbench/state.mjs");
    const [tables] = await ctx.engine.db.query("SHOW TABLES", "school");
    const names = tables.rows.map((r) => r[0]);
    const empty = [];
    for (const name of names) {
      const [result] = await ctx.engine.db.query(
        "SELECT COUNT(*) FROM `" + name + "`",
        "school",
      );
      if (Number(result.rows[0][0]) === 0) empty.push(name);
    }
    const [links] = await ctx.engine.db.query(
      "SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA='school' AND REFERENCED_TABLE_NAME IS NOT NULL",
      "school",
    );
    return {
      names,
      empty,
      links: Number(links.rows[0][0]),
      sessions: ctx.engine.sessions
        .list()
        .map((s) => ({
          id: s.id,
          label: s.label,
          url: ctx.engine.sessions.routeURL(s.id),
        })),
    };
  }, assetBase);
  assert.equal(catalog.names.length, 34);
  assert.deepEqual(catalog.empty, []);
  assert.ok(catalog.links >= 30);
  assert.equal(catalog.sessions.length, 4);
  const clients = await Promise.all(
    catalog.sessions.map(() => page.context().newPage()),
  );
  try {
    for (const client of clients) client.setDefaultTimeout(60000);
    const route = (i, pageName) =>
      new URL(
        catalog.sessions[i].url + (pageName ? "?page=" + pageName : ""),
        page.url(),
      ).href;
    await Promise.all(
      clients.map((client, i) =>
        client.goto(new URL(catalog.sessions[i].url, page.url()).href),
      ),
    );
    const names = [
      "Camille Martin",
      "Nora Bernard",
      "Alice Dupont",
      "Emma Dupont",
    ];
    for (let i = 0; i < 4; i++)
      assert.equal(await clients[i].locator("#profile").innerText(), names[i]);
    const ids = await Promise.all(
      clients.map((c) => c.locator("#session").innerText()),
    );
    assert.equal(new Set(ids).size, 4);
    for (const client of clients) {
      for (const link of [
        "students",
        "courses",
        "assignments",
        "library",
        "messages",
        "finance",
      ]) {
        await client.goto(route(clients.indexOf(client), link));
        assert.equal(await client.locator("h1").count(), 1);
        assert.equal(
          await client
            .locator("body")
            .innerText()
            .then((s) => s.includes("Fatal error")),
          false,
        );
      }
      await client.goto(route(clients.indexOf(client)));
    }
    await clients[2].locator("select[name=user_id]").selectOption("5");
    await clients[2].getByRole("button", { name: "Changer de profil" }).click();
    try {
      await clients[2]
        .locator("#profile")
        .filter({ hasText: "Sami Diallo" })
        .waitFor({ timeout: 10000 });
    } catch (error) {
      throw Error(
        "Profile form failed at " +
          clients[2].url() +
          ": " +
          (await clients[2].locator("body").innerText()),
      );
    }
    const note = "Note simultanée " + Date.now();
    await clients[0].getByLabel("Nouvelle note", { exact: true }).fill(note);
    await clients[0]
      .getByRole("button", { name: "Ajouter à la base commune" })
      .click();
    await clients[0].locator("#notes").filter({ hasText: note }).waitFor();
    await Promise.all(clients.slice(1).map((c) => c.reload()));
    for (let i = 1; i < 4; i++)
      await clients[i].locator("#notes").filter({ hasText: note }).waitFor();
    assert.equal(
      await clients[0].locator("#profile").innerText(),
      "Camille Martin",
    );
    assert.equal(
      await clients[1].locator("#profile").innerText(),
      "Nora Bernard",
    );
    assert.equal(
      await clients[3].locator("#profile").innerText(),
      "Emma Dupont",
    );
    await clients[1].goto(route(1, "assignments"));
    await clients[1].locator("select[name=student_id]").selectOption("2");
    await clients[1].getByLabel("Note sur 20").fill("17.75");
    await clients[1]
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await clients[1].locator("td").filter({ hasText: "17.75" }).waitFor();
    await clients[2].goto(route(2, "assignments"));
    await clients[2].locator("td").filter({ hasText: "17.75" }).waitFor();
    assert.equal(
      await clients[2]
        .getByRole("button", { name: "Enregistrer", exact: true })
        .count(),
      0,
    );
    await clients[1].goto(route(1, "messages"));
    await clients[1].locator("select[name=recipient_id]").selectOption("5");
    await clients[1]
      .getByLabel("Objet", { exact: true })
      .fill("Message entre sessions");
    await clients[1]
      .getByLabel("Message", { exact: true })
      .fill("Le devoir est corrigé.");
    await clients[1]
      .getByRole("button", { name: "Envoyer", exact: true })
      .click();
    await clients[1]
      .locator(".notice")
      .filter({ hasText: "Message envoyé" })
      .waitFor();
    await clients[2].goto(route(2, "messages"));
    await clients[2]
      .getByRole("heading", { name: "Message entre sessions" })
      .waitFor();
    // Invalid recipient rolls back both inserts and keeps the form draft.
    await clients[1].evaluate(() => {
      const option = new Option("Inexistant", "9999");
      document.querySelector("select[name=recipient_id]").append(option);
    });
    await clients[1].locator("select[name=recipient_id]").selectOption("9999");
    await clients[1]
      .getByLabel("Objet", { exact: true })
      .fill("Ne doit pas rester");
    await clients[1]
      .getByLabel("Message", { exact: true })
      .fill("Saisie conservée");
    await clients[1]
      .getByRole("button", { name: "Envoyer", exact: true })
      .click();
    await clients[1]
      .locator(".notice")
      .filter({ hasText: "saisie est conservée" })
      .waitFor();
    assert.equal(
      await clients[1].getByLabel("Objet", { exact: true }).inputValue(),
      "Ne doit pas rester",
    );
    const orphan = await page.evaluate(async (base) => {
      const { ctx } = await import(base + "/apps/studio/workbench/state.mjs");
      return (
        await ctx.engine.db.query(
          "SELECT COUNT(*) FROM messages WHERE subject='Ne doit pas rester'",
          "school",
        )
      )[0].rows[0][0];
    }, assetBase);
    assert.equal(Number(orphan), 0);
    await page.evaluate(async (base) => {
      const { A } = await import(base + "/apps/studio/workbench/state.mjs");
      await A.save();
    }, assetBase);
    await clients[2].goto(route(2));
    assert.equal(
      await clients[2].locator("#profile").innerText(),
      "Sami Diallo",
    );
    await clients[2].locator("#notes").filter({ hasText: note }).waitFor();
    return {
      tables: 34,
      foreignKeys: catalog.links,
      simultaneousSessions: 4,
      sharedNotes: true,
      grades: true,
      messaging: true,
      rollback: true,
      persistence: true,
    };
  } finally {
    await Promise.all(clients.map((c) => c.close()));
  }
}
