// Move the papers visually while held. Only the release changes the saved list.
export function startNoteDrag(row: HTMLElement, startY: number, commit: (target: string, ids: string[]) => void) {
  const list = row.parentElement!;
  const scroller = row.closest<HTMLElement>("main")!;
  const rows = Array.from(list.querySelectorAll<HTMLElement>("[data-note-id]"));
  const from = rows.indexOf(row);
  if (from < 0 || rows.length < 2) return null;
  const step = rows[1].offsetTop - rows[0].offsetTop;
  const ids = rows.map(item => item.dataset.noteId!);
  const initialScroll = scroller.scrollTop;
  let pointerY = startY;
  let to = from;
  let frame = 0;
  let lastTime = performance.now();
  list.dataset.sorting = "true";
  row.dataset.held = "true";

  function place() {
    const delta = Math.max(-from * step, Math.min((rows.length - 1 - from) * step,
      pointerY - startY + scroller.scrollTop - initialScroll));
    const target = Math.max(0, Math.min(rows.length - 1, from + Math.round(delta / step)));
    row.style.setProperty("--shift", delta + "px");
    if (target === to) return;
    to = target;
    rows.forEach((item, index) => {
      if (index === from) return;
      const shift = index > from && index <= to ? -step : index >= to && index < from ? step : 0;
      item.style.setProperty("--shift", shift + "px");
    });
  }

  function tick(time: number) {
    const box = scroller.getBoundingClientRect();
    const edge = 72;
    const speed = pointerY < box.top + edge ? -Math.min(1, (box.top + edge - pointerY) / edge)
      : Math.max(0, Math.min(1, (pointerY - box.bottom + edge) / edge));
    if (speed) scroller.scrollTop += speed * 0.32 * Math.min(32, time - lastTime);
    lastTime = time;
    place();
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);

  return {
    move(y: number) { pointerY = y; place(); },
    end(save: boolean) {
      cancelAnimationFrame(frame);
      delete list.dataset.sorting;
      delete row.dataset.held;
      rows.forEach(item => item.style.removeProperty("--shift"));
      if (save && from !== to) commit(ids[to], ids);
    },
  };
}
