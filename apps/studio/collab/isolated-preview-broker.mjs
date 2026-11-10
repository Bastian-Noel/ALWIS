/**
 * Persistent window on the untrusted preview origin; relays SW request MessagePorts
 * across origins to the trusted studio owner, which alone owns PHP and MariaDB.
 */
const params = new URL(import.meta.url).searchParams;
const page = new URL(location.href);
const channel = page.searchParams.get("channel");
const studioOrigin = page.searchParams.get("studioOrigin");
if (!/^[a-f0-9]{32}$/.test(channel || "")) throw Error("Invalid guest preview token");
if (!studioOrigin || !["https:", "http:"].includes(new URL(studioOrigin).protocol)
    || new URL(studioOrigin).origin !== studioOrigin
    || new URL(studioOrigin).origin === location.origin)
  throw Error("An isolated preview must use a different origin from the studio");

const registration = await navigator.serviceWorker.register("/guest-sw.js", { type: "module", scope: "/" });
await navigator.serviceWorker.ready;
if (!navigator.serviceWorker.controller) await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Error("Guest Service Worker not controlling broker")), 12000);
  navigator.serviceWorker.addEventListener("controllerchange", () => { clearTimeout(timer); resolve(); }, { once: true });
});
navigator.serviceWorker.addEventListener("message", event => {
  if (event.data?.type !== "alwis-preview-http" || event.data.channel !== channel || !event.ports?.[0]) return;
  parent.postMessage({
    type: "alwis-preview-http",
    channel,
    request: event.data.request,
  }, studioOrigin, [event.ports[0]]);
});
parent.postMessage({ type: "alwis-preview-ready", channel }, studioOrigin);
