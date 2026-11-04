/** One visible step, real milestones, and gentle activity feedback during long tasks. */
let active = false;
export async function withProjectLoading(run, { name } = {}) {
  if (active) return;
  active = true;
  const app = document.querySelector('#app');
  const previous = document.activeElement;
  const wasInert = app.inert;
  const screen = document.createElement('div');
  screen.className = 'project-loading';
  screen.setAttribute('role', 'status');
  screen.setAttribute('aria-live', 'polite');
  screen.setAttribute('aria-atomic', 'true');
  screen.innerHTML = `<div class="project-loading-content"><div class="project-loading-brand" aria-hidden="true"><span>ALWIS</span></div><p class="project-loading-label">Ouverture du projet</p>${name ? `<p class="project-loading-name">${name.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])}</p>` : ""}<div class="project-loading-step"></div><div class="project-loading-track" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="project-loading-dots" aria-hidden="true"><i></i><i></i><i></i></div></div>`;
  document.body.append(screen);
  app.inert = true;
  const slot = screen.querySelector('.project-loading-step');
  let current, timer, disposed = false;
  const waiting = ['Votre projet se prépare…', 'Le chargement continue…', 'Encore un instant, nous préparons votre espace…'];
  let idle = 0;
  function show(message) {
    if (disposed || current?.textContent === message) return;
    slot.querySelectorAll('.leaving').forEach(el => el.remove());
    if (current) {
      const old = current;
      old.className = 'leaving';
      old.setAttribute('aria-hidden', 'true');
      setTimeout(() => old.remove(), 350);
    }
    current = document.createElement('p');
    current.textContent = message;
    slot.append(current);
  }
  let seen = 0;
  function mark() {
    const cells = screen.querySelectorAll('.project-loading-track i');
    seen = Math.min(seen + 1, cells.length);
    cells.forEach((el, i) => el.className = i < seen - 1 ? 'done' : i === seen - 1 ? 'now' : '');
  }
  function step(message) {
    clearInterval(timer);
    mark();
    show(message);
    idle = 0;
    timer = setInterval(() => show(waiting[idle++ % waiting.length]), 7000);
  }
  step('Préparation de votre projet…');
  try {
    // Paint before starting work; no artificial delay on fast projects.
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    return await run(step);
  } finally {
    disposed = true;
    clearInterval(timer);
    screen.remove();
    app.inert = wasInert;
    active = false;
    if (document.activeElement === document.body) {
      const next = document.querySelector('#ws:not([hidden]) #tabs [aria-selected=true]');
      (next || (previous?.isConnected ? previous : app))?.focus({preventScroll: true});
    }
  }
}
