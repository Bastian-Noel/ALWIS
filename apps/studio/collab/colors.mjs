// Deterministic identity: same name => same colour. A duplicate name gets a
// different "variant" from the server (smallest free index), which shifts the hue.
export function hashName(name) {
  let h = 2166136261;
  for (const ch of String(name).trim().toLowerCase()) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
const GOLDEN = 137.508;
export function colorFor(name, variant = 0) {
  const hue = Math.round((hashName(name) % 360 + variant * GOLDEN) % 360);
  const sat = 68 + (variant % 3) * 6;
  return {
    hue,
    solid: `hsl(${hue} ${sat}% 42%)`, // avatar background, white text >= 4.5:1
    bright: `hsl(${hue} ${sat + 10}% 58%)`, // carets, outlines
    soft: `hsl(${hue} ${sat}% 55% / .22)`, // selections
    flash: `hsl(${hue} ${sat + 10}% 58% / .38)`, // recent insertions
  };
}
export function initial(name) {
  const clean = String(name).trim();
  const first = [...clean][0] ?? "?";
  return first.toLocaleUpperCase();
}
export function cssVars(name, variant = 0) {
  const c = colorFor(name, variant);
  return `--c:${c.solid};--cb:${c.bright};--cs:${c.soft};--cf:${c.flash}`;
}
