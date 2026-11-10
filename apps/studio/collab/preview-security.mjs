/** Preview PHP emits arbitrary site JavaScript. Treat it as untrusted, even when a guest is read-only.
 * A same-origin iframe with BOTH allow-scripts and allow-same-origin can access its parent
 * and remove its own sandbox. Guest preview therefore uses an opaque origin until ALWIS
 * has a dedicated isolated preview origin with a verified browser handshake.
 */
export const GUEST_INTERACTIVE_SANDBOX = 'allow-scripts allow-forms';
export const GUEST_MIRROR_SANDBOX = 'allow-same-origin'; // the legacy snapshot contains no executable scripts

export function guestPreviewSandbox(interactive) {
  return interactive ? GUEST_INTERACTIVE_SANDBOX : GUEST_MIRROR_SANDBOX;
}

export function isSafeGuestSandbox(tokens) {
  const all = new Set(String(tokens).split(/\s+/).filter(Boolean));
  return !(all.has('allow-same-origin') && all.has('allow-scripts'))
    && !all.has('allow-top-navigation') && !all.has('allow-top-navigation-by-user-activation')
    && !all.has('allow-popups-to-escape-sandbox');
}
