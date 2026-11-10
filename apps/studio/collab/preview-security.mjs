/** Untrusted PHP pages may execute script ONLY on a dedicated separate origin.
 * The old in-studio DOM mirror is script-free; a same-origin scripted iframe
 * would be able to read the workbench, even when the guest is read-only.
 */
export const GUEST_INTERACTIVE_SANDBOX = "allow-scripts allow-forms";
export const GUEST_ISOLATED_INTERACTIVE_SANDBOX = "allow-scripts allow-forms allow-same-origin";
export const GUEST_MIRROR_SANDBOX = "allow-same-origin";

function separateOrigin(previewOrigin, studioOrigin) {
  try {
    const remote = new URL(previewOrigin), studio = new URL(studioOrigin);
    return !!previewOrigin && !!studioOrigin
      && remote.origin === previewOrigin && remote.origin !== studio.origin
      && (remote.protocol === "https:" ||
        (remote.protocol === "http:" && (remote.hostname === "localhost" || remote.hostname.endsWith(".localhost") || ["127.0.0.1", "[::1]"].includes(remote.hostname))));
  } catch { return false; }
}

export function guestPreviewSandbox(interactive, { previewOrigin, studioOrigin } = {}) {
  if (!interactive) return GUEST_MIRROR_SANDBOX;
  return separateOrigin(previewOrigin, studioOrigin)
    ? GUEST_ISOLATED_INTERACTIVE_SANDBOX : GUEST_INTERACTIVE_SANDBOX;
}

export function isSafeGuestSandbox(tokens, { previewOrigin, studioOrigin } = {}) {
  const all = new Set(String(tokens).split(/\s+/).filter(Boolean));
  return !(all.has("allow-same-origin") && all.has("allow-scripts") &&
      !separateOrigin(previewOrigin, studioOrigin))
    && !all.has("allow-top-navigation") && !all.has("allow-top-navigation-by-user-activation")
    && !all.has("allow-popups-to-escape-sandbox");
}
