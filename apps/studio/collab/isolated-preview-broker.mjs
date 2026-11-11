/**
 * Persistent window on the untrusted preview origin; relays SW request MessagePorts
 * across origins to the trusted studio owner, which alone owns PHP and MariaDB.
 */
const page = new URL(location.href);
const channel = page.searchParams.get("channel");
const studioOrigin = page.searchParams.get("studioOrigin");
if (!/^[a-f0-9]{32}$/.test(channel || "")) throw Error("Invalid guest preview token");
const sameOrigin = studioOrigin === location.origin;
const scopedPath = "/__alwis-guest/" + channel + "/";
const trustedSameOrigin = sameOrigin && page.searchParams.get("trustedSameOrigin") === "1"
  && page.pathname === scopedPath + "__broker.html";
if (!studioOrigin || !["https:", "http:"].includes(new URL(studioOrigin).protocol)
    || new URL(studioOrigin).origin !== studioOrigin
    || (sameOrigin && !trustedSameOrigin))
  throw Error("An isolated preview must use a different origin from the studio");

const registration = await navigator.serviceWorker.register("/guest-sw.js", {
  type: "module", scope: trustedSameOrigin ? scopedPath : "/",
});
// navigator.serviceWorker.ready may refer to the studio root registration.
// Wait for this broker's actual guest worker, without replacing that root.
await new Promise((resolve, reject) => {
  const matches = () => navigator.serviceWorker.controller?.scriptURL === new URL("/guest-sw.js", location.href).href;
  const check = () => { if (matches()) { clearTimeout(timer); navigator.serviceWorker.removeEventListener("controllerchange", check); resolve(); } };
  const timer = setTimeout(() => { navigator.serviceWorker.removeEventListener("controllerchange", check); reject(Error("Guest Service Worker not controlling broker")); }, 12000);
  navigator.serviceWorker.addEventListener("controllerchange", check);
  check();
});
navigator.serviceWorker.addEventListener("message", event => {
  if (!["alwis-preview-http", "alwis-preview-cookie"].includes(event.data?.type)
      || event.data.channel !== channel || !event.ports?.[0]) return;
  parent.postMessage({
    type: event.data.type, channel,
    request: event.data.request,
    value: event.data.value, url: event.data.url,
  }, studioOrigin, [event.ports[0]]);
});
parent.postMessage({ type: "alwis-preview-ready", channel }, studioOrigin);
