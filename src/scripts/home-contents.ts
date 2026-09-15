let activeContents: HTMLElement | null = null;
let contentsController: AbortController | null = null;
let contentsFrame = 0;

function setupHomeContents() {
  const nav = document.querySelector<HTMLElement>('[data-home-contents]');
  if (nav && nav === activeContents && contentsController && !contentsController.signal.aborted) return;
  contentsController?.abort();
  cancelAnimationFrame(contentsFrame);
  activeContents = nav;
  contentsController = null;
  if (!nav) return;

  const controller = new AbortController();
  contentsController = controller;
  const { signal } = controller;
  const list = nav.querySelector<HTMLElement>('.edition-contents-links');
  const sections = [...nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')]
    .map(link => ({ link, target: document.getElementById(link.hash.slice(1)) }))
    .filter((item): item is { link: HTMLAnchorElement; target: HTMLElement } => !!item.target);
  let selected: HTMLAnchorElement | undefined;

  function update() {
    if (!nav || !list || !sections.length) return;
    const threshold = parseFloat(getComputedStyle(nav).top) + nav.offsetHeight + 100;
    let next = sections[0].link;
    for (const section of sections) {
      if (section.target.getBoundingClientRect().top <= threshold) next = section.link;
    }
    if (next === selected) return;
    selected = next;
    for (const { link } of sections) {
      if (link === next) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
    // Keep the current chapter visible without moving the document vertically.
    const bounds = list.getBoundingClientRect();
    const item = next.getBoundingClientRect();
    if (item.left < bounds.left || item.right > bounds.right) {
      list.scrollTo({ left: list.scrollLeft + item.left - bounds.left - (bounds.width - item.width) / 2, behavior: 'instant' });
    }
  }
  function schedule() {
    cancelAnimationFrame(contentsFrame);
    contentsFrame = requestAnimationFrame(update);
  }
  window.addEventListener('scroll', schedule, { passive: true, signal });
  window.addEventListener('resize', schedule, { signal });
  window.addEventListener('hashchange', schedule, { signal });
  document.fonts.ready.then(() => { if (!signal.aborted) schedule(); });
  update();
}

document.addEventListener('astro:before-swap', () => {
  contentsController?.abort();
  cancelAnimationFrame(contentsFrame);
  activeContents = null;
});
document.addEventListener('astro:page-load', setupHomeContents);
setupHomeContents();
