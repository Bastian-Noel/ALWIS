/** Guest preview URLs are local capabilities, not host project/session identifiers. */
const TOKEN = /^[a-f0-9]{32}$/;
const PREFIX = "/__pbl-guest/";

export function validGuestChannel(value) { return typeof value === "string" && TOKEN.test(value); }

export function guestPreviewURL(channel, path = "/index.php") {
  if (!validGuestChannel(channel)) throw Error("Invalid guest preview channel");
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//"))
    throw Error("Invalid guest preview path");
  const url = new URL(path, "https://preview.invalid");
  if (url.origin !== "https://preview.invalid" || url.pathname.startsWith(PREFIX))
    throw Error("Invalid guest preview path");
  return PREFIX + channel + url.pathname + url.search + url.hash;
}

export function parseGuestPreviewURL(input) {
  const url = new URL(input, "https://preview.invalid");
  const match = url.pathname.match(/^\/__pbl-guest\/([a-f0-9]{32})(\/.*)$/);
  return match ? { channel: match[1], path: match[2] + url.search } : null;
}

/** ProjectHub redirects to /__pbl/<host-project>/<host-session>/... must remain inside the guest's own preview. */
export function guestPreviewLocation(location, channel, origin) {
  if (typeof location !== "string") return location;
  const target = new URL(location, origin);
  if (target.origin !== new URL(origin).origin) return location;
  const match = target.pathname.match(/^\/__pbl\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+(\/.*)$/);
  return match ? guestPreviewURL(channel, match[1] + target.search + target.hash) : location;
}
