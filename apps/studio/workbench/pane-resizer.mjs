/** Pointer capture + shield keep dragging across embedded pages reliable. */
export function bindPaneResizer(
  element,
  { axis, initial, min, max, measure, apply, key, reverse = false },
) {
  let value = initial;
  try {
    const saved = Number(localStorage.getItem(key));
    if (saved >= min && saved <= max) value = saved;
  } catch {}
  const set = (next) => {
    value = Math.max(min, Math.min(max, next));
    apply(value);
    element.setAttribute("aria-valuenow", Math.round(value));
    element.setAttribute("aria-valuetext", `${Math.round(value)} %`);
  };
  const save = () => {
    try {
      localStorage.setItem(key, value);
    } catch {}
  };
  set(value);
  element.addEventListener("dblclick", () => {
    set(initial);
    save();
  });
  element.addEventListener("keydown", (event) => {
    const directions =
      axis === "x"
        ? { ArrowLeft: -1, ArrowRight: 1 }
        : { ArrowUp: -1, ArrowDown: 1 };
    if (!(event.key in directions) && !["Home", "End"].includes(event.key))
      return;
    event.preventDefault();
    set(
      event.key === "Home"
        ? min
        : event.key === "End"
          ? max
          : value +
            directions[event.key] *
              (reverse ? -1 : 1) *
              (event.shiftKey ? 10 : 2),
    );
    save();
  });
  element.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    element.focus();
    const start = axis === "x" ? event.clientX : event.clientY,
      before = value,
      size = measure();
    if (size <= 0) return;
    const shield = document.createElement("div");
    shield.className = `resize-shield ${axis}`;
    document.body.append(shield);
    element.classList.add("dragging");
    element.setPointerCapture(event.pointerId);
    const move = (e) =>
      set(
        before +
          (((axis === "x" ? e.clientX : e.clientY) - start) / size) *
            100 *
            (reverse ? -1 : 1),
      );
    const end = () => {
      shield.remove();
      element.classList.remove("dragging");
      save();
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", end);
      element.removeEventListener("pointercancel", end);
      element.removeEventListener("lostpointercapture", end);
      if (element.hasPointerCapture(event.pointerId))
        element.releasePointerCapture(event.pointerId);
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", end);
    element.addEventListener("pointercancel", end);
    element.addEventListener("lostpointercapture", end);
  });
}
