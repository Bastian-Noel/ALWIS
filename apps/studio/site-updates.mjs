/** A version change only reloads after the workspace draft is persisted. */
export function installSiteUpdates({
  persist = async () => {},
  close = async () => {},
} = {}) {
  const build = document.querySelector('meta[name="alwis-build"]')?.content;
  const version =
    document.querySelector('meta[name="alwis-version"]')?.content ??
    "développement";
  const label = document.querySelector("#siteVersion");
  const button = document.querySelector("#siteUpdate");
  if (!label || !button) return;
  label.textContent = `v${version}${build ? " · " + build.slice(0, 7) : ""}`;
  label.title = build ? `${version} — build ${build}` : "Sources locales, non empaquetées";
  if (!build) return;
  let latest,
    checking = false,
    applying = false;
  async function check() {
    if (checking || applying || document.hidden) return;
    checking = true;
    try {
      const response = await fetch("/release.json?check=" + Date.now(), {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return;
      const value = await response.json();
      if (
        !/^[a-f0-9]{40}$/.test(value.revision) ||
        !/^\d+\.\d+\.\d+/.test(value.version)
      )
        return;
      latest = value;
      button.hidden = false;
      button.textContent =
        latest.revision === build
          ? "Vérifier les mises à jour"
          : `Mettre à jour vers ${latest.version}`;
      button.dataset.available = String(latest.revision !== build);
    } catch {
      /* Keep the current working version usable when offline. */
    } finally {
      checking = false;
    }
  }
  button.hidden = false;
  button.textContent = "Vérifier les mises à jour";
  button.onclick = async () => {
    if (applying) return;
    try {
      await check();
      if (!latest || latest.revision === build) {
        button.textContent = latest
          ? "Version à jour"
          : "Vérification indisponible — réessayer";
        return;
      }
      applying = true;
      button.disabled = true;
      button.textContent = "Conservation des brouillons…";
      await persist();
      // Update only the SW registration owned by this application; never touch project storage.
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations
          .filter(
            (r) =>
              new URL(
                r.active?.scriptURL ?? r.waiting?.scriptURL ?? location.href,
              ).pathname === "/service-worker.js",
          )
          .map((r) => r.update()),
      );
      await close();
      const target = new URL("/", location.origin);
      target.searchParams.set("build", latest.revision);
      location.replace(target.href);
    } catch (error) {
      applying = false;
      button.disabled = false;
      button.textContent = "Mise à jour interrompue — réessayer";
      label.title = "Brouillons conservés. " + error.message;
    }
  };
  const interval = setInterval(check, 60000);
  window.addEventListener("focus", check);
  window.addEventListener("pagehide", () => clearInterval(interval), {
    once: true,
  });
  void check();
}
