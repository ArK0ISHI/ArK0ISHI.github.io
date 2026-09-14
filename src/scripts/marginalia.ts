let activeRoot: HTMLElement | null = null;
let activeController: AbortController | null = null;

function setupMarginalia() {
  const root = document.querySelector<HTMLElement>('[data-marginalia-room]');
  if (root && root === activeRoot && activeController && !activeController.signal.aborted) return;
  activeController?.abort();
  activeRoot = root;
  activeController = null;
  if (!root) return;

  const controller = new AbortController();
  activeController = controller;
  const { signal } = controller;
  const controls = root.querySelector<HTMLElement>('[data-marginalia-controls]');
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-note-filter]'));
  const notes = Array.from(root.querySelectorAll<HTMLElement>('[data-note-kind]'));
  const count = root.querySelector<HTMLElement>('[data-note-count]');
  if (!controls || !buttons.length || !count) return;

  function selectFilter(button: HTMLButtonElement) {
    const selected = button.dataset.noteFilter ?? 'all';
    buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    let visible = 0;
    notes.forEach(note => {
      const show = selected === 'all' || note.dataset.noteKind === selected;
      note.hidden = !show;
      if (show) visible += 1;
    });
    count!.textContent = selected === 'all' ? `共 ${visible} 则短笺` : `${selected} · ${visible} 则短笺`;
  }

  buttons.forEach((button, index) => {
    button.addEventListener('click', () => selectFilter(button), { signal });
    button.addEventListener('keydown', event => {
      let next: number | undefined;
      if (event.key === 'ArrowRight') next = (index + 1) % buttons.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + buttons.length) % buttons.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = buttons.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      buttons[next].focus();
      selectFilter(buttons[next]);
    }, { signal });
  });
  // A new page visit begins with the complete notebook; repeated page-load events keep the current filter.
  selectFilter(buttons[0]);
  controls.hidden = false;
}

document.addEventListener('astro:before-swap', () => {
  activeController?.abort();
  activeRoot = null;
  activeController = null;
});
document.addEventListener('astro:page-load', setupMarginalia);
setupMarginalia();
