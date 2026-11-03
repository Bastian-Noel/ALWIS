/** One visible step, real milestones, and gentle activity feedback during long tasks. */
let active = false;
export async function withProjectLoading(run) {
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
  screen.innerHTML = '<div class="project-loading-content"><p class="project-loading-label">Ouverture du projet</p><div class="project-loading-step"></div><div class="project-loading-dots" aria-hidden="true"><i></i><i></i><i></i></div></div>';
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
  function step(message) {
    clearInterval(timer);
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
