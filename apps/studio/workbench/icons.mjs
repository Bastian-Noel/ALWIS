/** Icônes de fichiers : pastille colorée par famille, lisible dès 14 px. Aucune dépendance. */
const T = {
  php: ["PHP", "#6b7bd1"],
  phtml: ["PHP", "#6b7bd1"],
  html: ["HTML", "#e2643b"],
  htm: ["HTML", "#e2643b"],
  css: ["CSS", "#3d93dd"],
  scss: ["SCSS", "#cf5d97"],
  js: ["JS", "#cfa518"],
  mjs: ["JS", "#cfa518"],
  ts: ["TS", "#3b7bd0"],
  json: ["{ }", "#7f9440"],
  sql: ["SQL", "#2c9a97"],
  md: ["MD", "#7a8690"],
  csv: ["CSV", "#3f9f5f"],
  txt: ["TXT", "#8b959e"],
  env: ["ENV", "#a07f4c"],
  xml: ["XML", "#c27a2c"],
  zip: ["ZIP", "#8b6f4e"],
  png: ["IMG", "#c4558f"],
  jpg: ["IMG", "#c4558f"],
  jpeg: ["IMG", "#c4558f"],
  gif: ["IMG", "#c4558f"],
  webp: ["IMG", "#c4558f"],
  svg: ["SVG", "#c4558f"],
  ico: ["ICO", "#c4558f"],
};
export const extOf = (p) => {
  const n = p.split("/").pop().toLowerCase();
  return n.startsWith(".") && !n.slice(1).includes(".")
    ? "env"
    : n.includes(".")
      ? n.split(".").pop()
      : "";
};
export const fileKind = (p) =>
  ({
    php: "PHP",
    html: "HTML",
    htm: "HTML",
    css: "CSS",
    js: "JavaScript",
    mjs: "JavaScript",
    json: "JSON",
    sql: "SQL",
    md: "Markdown",
    csv: "CSV",
    env: "Environnement",
  })[extOf(p)] || "Texte";
export const fileColor = (p) => (T[extOf(p)] || ["", "#8b959e"])[1];
export const fileIcon = (p) => {
  const [l, c] = T[extOf(p)] || ["···", "#8b959e"];
  const rgb = c
    .slice(1)
    .match(/../g)
    .map((x) => parseInt(x, 16) / 255)
    .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  const ink =
    rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.179
      ? "#111"
      : "#fff";
  return `<svg class="fi" viewBox="0 0 22 14" width="22" height="14" aria-hidden="true"><rect width="22" height="14" rx="3" fill="${c}"/><text x="11" y="9.8" text-anchor="middle" font-size="${l.length > 3 ? 5.6 : 7}" font-weight="700" fill="${ink}" font-family="IBM Plex Sans,system-ui,sans-serif">${l}</text></svg>`;
};
export const folderIcon = (open) =>
  `<svg class="fi" viewBox="0 0 22 14" width="22" height="14" aria-hidden="true"><path d="M1.5 2.5A1.5 1.5 0 0 1 3 1h4.6l1.6 1.8H19A1.5 1.5 0 0 1 20.5 4.3V11.5A1.5 1.5 0 0 1 19 13H3a1.5 1.5 0 0 1-1.5-1.5z" fill="${open ? "#e6a93a" : "#d99a2b"}"/>${open ? '<path d="M1.5 6h19l-1.4 6.2a1 1 0 0 1-1 .8H3.2a1 1 0 0 1-1-.8z" fill="#f2c15e"/>' : ""}</svg>`;
export const isWeb = (p) => /\.(php|phtml|html?)$/i.test(p);
export const ui = {
  play: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4.5 2.8v10.4a.5.5 0 0 0 .76.43l8.1-5.2a.5.5 0 0 0 0-.86l-8.1-5.2a.5.5 0 0 0-.76.43z" fill="currentColor"/></svg>',
  plus: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  more: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="3.5" cy="8" r="1.3" fill="currentColor"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="12.5" cy="8" r="1.3" fill="currentColor"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  key: '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><circle cx="5" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 8h6M12 8v2.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  link: '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M6.5 9.5l3-3M5 8L3.6 9.4a2.2 2.2 0 0 0 3.1 3.1L8 11.2M11 8l1.4-1.4a2.2 2.2 0 0 0-3.1-3.1L8 4.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  trash:
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.5 8h5l.5-8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const lineIcon = (paths) =>
  `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
Object.assign(ui, {
  search: lineIcon(
    '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  ),
  save: lineIcon('<path d="M5 3h12l4 4v14H3V3Zm2 0v6h10V3M7 21v-8h10v8"/>'),
  format: lineIcon(
    '<path d="M9 5h12M9 10h8M9 15h12M9 20h8M3 5l1 1 2-3M3 15l1 1 2-3"/>',
  ),
  warning: lineIcon('<path d="m12 3 10 18H2ZM12 9v5m0 3h.01"/>'),
  rename: lineIcon('<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14ZM3 22h18"/>'),
  copy: lineIcon(
    '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  ),
  code: lineIcon('<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>'),
  arrow: lineIcon('<path d="M4 12h16m-6-6 6 6-6 6"/>'),
  folder: lineIcon('<path d="M3 7V4h7l3 3h8v13H3Zm0 0h10"/>'),
  settings: lineIcon(
    '<path d="M3 6h18M3 12h18M3 18h18"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
  ),
  download: lineIcon('<path d="M12 3v12m-5-5 5 5 5-5M3 16v5h18v-5"/>'),
  close: lineIcon('<path d="m6 6 12 12M18 6 6 18"/>'),
});
