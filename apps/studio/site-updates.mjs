/** Preserve the workspace, validate the new entrypoint, then reload a coherent build. */
export function installSiteUpdates({
  persist = async () => {},
  close = async () => {},
} = {}) {
  const build = document.querySelector('meta[name="alwis-build"]')?.content;
  const version =
    document.querySelector('meta[name="alwis-version"]')?.content ??
    "développement";
  const label = document.querySelector("#siteVersion"),
    button = document.querySelector("#siteUpdate");
  if (!label || !button) return;
  label.textContent = `v${version}${build ? " · " + build.slice(0, 7) : ""}`;
  label.title = build
    ? `${version} — build ${build}`
    : "Sources locales, non empaquetées";
  if (!build) return;
  let latest,
    checking,
    applying = false,
    repair = false;
  async function check(manual = false) {
    if (checking) return checking;
    if (applying || (!manual && document.hidden)) return;
    checking = (async () => {
      try {
        const response = await fetch("/release.json?check=" + Date.now(), {
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok)
          throw Error("Le serveur ne répond pas (" + response.status + ").");
        const value = await response.json();
        if (
          !/^[a-f0-9]{40}$/.test(value.revision) ||
          !/^\d+\.\d+\.\d+/.test(value.version) ||
          value.assetBase !== "/_alwis/" + value.revision
        )
          throw Error("Le serveur fournit un manifeste de version invalide.");
        latest = value;
        button.dataset.available = String(latest.revision !== build);
        button.textContent =
          latest.revision === build
            ? repair
              ? "Recharger cette version"
              : "Vérifier les mises à jour"
            : `Mettre à jour vers ${latest.version}`;
      } catch (error) {
        latest = null;
        button.textContent = "Vérification indisponible — réessayer";
        label.title = error.message;
      }
    })();
    try {
      await checking;
    } finally {
      checking = null;
    }
  }
  button.hidden = false;
  button.textContent = "Vérifier les mises à jour";
  button.onclick = async () => {
    if (applying) return;
    await check(true);
    if (!latest) return;
    if (latest.revision === build && !repair) {
      repair = true;
      button.textContent = "Recharger cette version";
      button.title =
        "Forcer le rechargement des fichiers de cette version, sans effacer les projets.";
      return;
    }
    const targetRevision = latest.revision;
    let overlay;
    const app = document.querySelector("#app");
    try {
      applying = true;
      button.disabled = true;
      // Detect a stale root index or a deployment that has not finished, before closing the owner.
      const entry = await fetch(
        "/?build=" + targetRevision + "&verify=" + Date.now(),
        { cache: "no-store", signal: AbortSignal.timeout(15000) },
      );
      if (!entry.ok)
        throw Error("L’accueil de la nouvelle version est indisponible.");
      const html = new DOMParser().parseFromString(
        await entry.text(),
        "text/html",
      );
      if (
        html.querySelector('meta[name="alwis-build"]')?.content !==
        targetRevision
      )
        throw Error(
          "La mise à jour du serveur n’est pas complète. Votre projet reste ouvert ; réessayez dans un instant.",
        );
      overlay = document.createElement("div");
      overlay.className = "site-updating";
      overlay.setAttribute("role", "status");
      overlay.textContent =
        "Enregistrement du projet et chargement de la version…";
      document.body.append(overlay);
      if (app) app.inert = true;
      await persist();
      for (const registration of await navigator.serviceWorker.getRegistrations())
        if (
          new URL(registration.active?.scriptURL ?? location.href).pathname ===
          "/service-worker.js"
        )
          await registration.update();
      await close();
      const target = new URL("/", location.origin);
      target.searchParams.set("build", targetRevision);
      target.searchParams.set("refresh", Date.now());
      location.replace(target.href);
    } catch (error) {
      overlay?.remove();
      if (app) app.inert = false;
      applying = false;
      button.disabled = false;
      button.textContent = "Mise à jour interrompue — réessayer";
      label.title = error.message;
      const notice = document.createElement("p");
      notice.className = "site-update-error";
      notice.setAttribute("role", "alert");
      notice.textContent = error.message;
      document.querySelector(".site-update-error")?.remove();
      button.closest("footer")?.append(notice);
    }
  };
  const interval = setInterval(() => check(), 60000);
  window.addEventListener("focus", () => check());
  window.addEventListener("pagehide", () => clearInterval(interval), {
    once: true,
  });
  void check();
}
