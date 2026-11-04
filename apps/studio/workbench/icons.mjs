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

/** Jeu d'icônes unique : un sprite SVG injecté au démarrage, utilisable en HTML statique (<svg class="ic"><use href="#i-x"/></svg>) comme en JS (icon("x")). */
export const SPRITE = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><symbol id="i-enter" viewBox="0 0 24 24"><path d="M20 5v7a2 2 0 0 1-2 2H5m5-5-5 5 5 5"/></symbol><symbol id="i-x" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></symbol><symbol id="i-chevron-down" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></symbol><symbol id="i-chevron-up" viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></symbol><symbol id="i-chevron-right" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></symbol><symbol id="i-chevron-left" viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></symbol><symbol id="i-arrow-right" viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6"/></symbol><symbol id="i-arrow-left" viewBox="0 0 24 24"><path d="M19 12H5m6-6-6 6 6 6"/></symbol><symbol id="i-arrow-up" viewBox="0 0 24 24"><path d="M12 19V5m-6 6 6-6 6 6"/></symbol><symbol id="i-arrow-down" viewBox="0 0 24 24"><path d="M12 5v14m-6-6 6 6 6-6"/></symbol><symbol id="i-refresh" viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5"/></symbol><symbol id="i-external" viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></symbol><symbol id="i-activity" viewBox="0 0 24 24"><path d="M4 17V9m5 8V4m5 13v-6m5 6V7"/></symbol><symbol id="i-compare" viewBox="0 0 24 24"><rect x="3" y="4" width="8" height="16" rx="2"/><rect x="13" y="4" width="8" height="16" rx="2"/></symbol><symbol id="i-command" viewBox="0 0 24 24"><path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3Z"/></symbol><symbol id="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4"/></symbol><symbol id="i-moon" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></symbol><symbol id="i-check" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></symbol><symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></symbol><symbol id="i-alert" viewBox="0 0 24 24"><path d="m12 3 10 18H2Z"/><path d="M12 10v5m0 3h.01"/></symbol><symbol id="i-error" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/></symbol><symbol id="i-success" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/></symbol><symbol id="i-collapse-all" viewBox="0 0 24 24"><path d="m7 20 5-5 5 5M7 4l5 5 5-5"/></symbol><symbol id="i-expand-all" viewBox="0 0 24 24"><path d="m7 15 5 5 5-5M7 9l5-5 5 5"/></symbol><symbol id="i-minus" viewBox="0 0 24 24"><path d="M5 12h14"/></symbol><symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol><symbol id="i-fit" viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></symbol><symbol id="i-link" viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11.7 6.6M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.3-1.3"/></symbol><symbol id="i-table" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/></symbol><symbol id="i-trash" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/></symbol><symbol id="i-upload" viewBox="0 0 24 24"><path d="M12 16V4m-5 5 5-5 5 5M4 17v3h16v-3"/></symbol><symbol id="i-download" viewBox="0 0 24 24"><path d="M12 3v12m-5-5 5 5 5-5M3 16v5h18v-5"/></symbol><symbol id="i-users" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9.5" r="2.5"/><path d="M3 20c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5M15 14.8c.7-.2 1.3-.3 2-.3 2.4 0 4 1.6 4.5 4.5"/></symbol><symbol id="i-cookie" viewBox="0 0 24 24"><path d="M20.5 13A8.5 8.5 0 1 1 11 3.5a3 3 0 0 0 4 4 3 3 0 0 0 5.5 5.5Z"/><path d="M9 10h.01M13 15h.01M8.5 14.5h.01M16 12h.01"/></symbol><symbol id="i-database" viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></symbol><symbol id="i-code" viewBox="0 0 24 24"><path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/></symbol><symbol id="i-folder" viewBox="0 0 24 24"><path d="M3 7V4h7l3 3h8v13H3Zm0 0h10"/></symbol><symbol id="i-folder-plus" viewBox="0 0 24 24"><path d="M3 7V4h7l3 3h8v13H3Zm0 0h10M12 11v6m-3-3h6"/></symbol><symbol id="i-file-plus" viewBox="0 0 24 24"><path d="M6 3h8l5 5v13H6Zm8 0v5h5M12 12v6m-3-3h6"/></symbol><symbol id="i-search" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></symbol><symbol id="i-save" viewBox="0 0 24 24"><path d="M5 3h12l4 4v14H3V3Zm2 0v6h10V3M7 21v-8h10v8"/></symbol><symbol id="i-play" viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5Z"/></symbol><symbol id="i-help" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/></symbol><symbol id="i-spinner" viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9"/></symbol><symbol id="i-layers" viewBox="0 0 24 24"><path d="m12 3 9 5-9 5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/></symbol><symbol id="i-columns-add" viewBox="0 0 24 24"><rect x="3" y="4" width="14" height="16" rx="2"/><path d="M10 4v16M21 9v6m-3-3h6"/></symbol><symbol id="i-key" viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="m11 12 8-8m-3 3 3 3"/></symbol><symbol id="i-relation" viewBox="0 0 24 24"><rect x="3" y="4" width="7" height="6" rx="1.5"/><rect x="14" y="14" width="7" height="6" rx="1.5"/><path d="M10 7h2a2 2 0 0 1 2 2v5"/></symbol><symbol id="i-shuffle" viewBox="0 0 24 24"><path d="M3 7h4l10 10h4M3 17h4l3-3m4-4 3-3h4M18 4l3 3-3 3m0 4 3 3-3 3"/></symbol><symbol id="i-image" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-8 8"/></symbol><symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></symbol><symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></symbol><symbol id="i-grip-v" viewBox="0 0 24 24"><g fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></g></symbol><symbol id="i-grip-h" viewBox="0 0 24 24"><g fill="currentColor" stroke="none"><circle cx="6" cy="9" r="1.5"/><circle cx="12" cy="9" r="1.5"/><circle cx="18" cy="9" r="1.5"/><circle cx="6" cy="15" r="1.5"/><circle cx="12" cy="15" r="1.5"/><circle cx="18" cy="15" r="1.5"/></g></symbol><symbol id="i-more" viewBox="0 0 24 24"><g fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></g></symbol></svg>';
export const icon = (name, cls = "") =>
  `<svg class="ic ${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
