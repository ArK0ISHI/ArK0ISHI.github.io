import { navigate } from 'astro:transitions/client';
import { marginalia, marginaliaHref } from '../data/marginalia';

const archivePath = '/writing/marginalia/';
const categories = { narrative: '叙事细读', hifuu: '秘封札记', music: '听歌随笔', editing: '校订手记' } as const;
const notePaths = new Set(marginalia.map(marginaliaHref));
const noteAnchors = new Set(marginalia.map(note => `note-${note.id}`));
type ReadingPosition = { href: string; scrollY: number; anchor?: string; offset?: number };
let activeRoot: HTMLElement | null = null;
let activeController: AbortController | null = null;

function categoryFromUrl(url = new URL(location.href)): string {
  const key = url.searchParams.get('category');
  return key && Object.hasOwn(categories, key) ? categories[key as keyof typeof categories] : 'all';
}

function archiveHref(kind: string, hash = ''): string {
  const key = Object.entries(categories).find(([, value]) => value === kind)?.[0];
  return `${archivePath}${key ? `?category=${key}` : ''}${hash}`;
}

function readPosition(value: unknown): ReadingPosition | null {
  if (!value || typeof value !== 'object') return null;
  const position = value as Partial<ReadingPosition>;
  if (typeof position.href !== 'string' || typeof position.scrollY !== 'number' || !Number.isFinite(position.scrollY) || position.scrollY < 0 || position.scrollY > 10_000_000) return null;
  try {
    const url = new URL(position.href, location.origin);
    const key = url.searchParams.get('category');
    if (url.origin !== location.origin || url.pathname !== archivePath || [...url.searchParams.keys()].some(name => name !== 'category') || (key !== null && !Object.hasOwn(categories, key))) return null;
    if (url.hash && url.hash !== '#marginalia-notes' && url.hash !== '#marginalia-shelf' && !noteAnchors.has(url.hash.slice(1))) return null;
    if (position.anchor !== undefined && (!noteAnchors.has(position.anchor) || typeof position.offset !== 'number' || !Number.isFinite(position.offset) || Math.abs(position.offset) > 10_000)) return null;
    return { href: url.pathname + url.search + url.hash, scrollY: position.scrollY, ...(position.anchor ? { anchor: position.anchor, offset: position.offset } : {}) };
  } catch { return null; }
}

function historyData(): Record<string, unknown> {
  return history.state && typeof history.state === 'object' ? history.state : {};
}

function regularClick(event: MouseEvent, link: HTMLAnchorElement): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !link.hasAttribute('download') && (!link.target || link.target === '_self');
}

function setupMarginalia() {
  const root = document.querySelector<HTMLElement>('[data-marginalia-room], [data-marginalia-post]');
  if (root && root === activeRoot && activeController && !activeController.signal.aborted) return;
  activeController?.abort();
  activeRoot = root;
  activeController = null;
  if (!root) return;
  const controller = new AbortController();
  activeController = controller;
  const { signal } = controller;

  if (root.hasAttribute('data-marginalia-room')) {
    const controls = root.querySelector<HTMLElement>('[data-marginalia-controls]');
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-note-filter]'));
    const notes = Array.from(root.querySelectorAll<HTMLElement>('[data-note-kind]'));
    const count = root.querySelector<HTMLElement>('[data-note-count]');
    if (!controls || !buttons.length || !count) return;

    function selectFilter(button: HTMLButtonElement, updateUrl = true) {
      const kind = button.dataset.noteFilter ?? 'all';
      buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      let visible = 0;
      notes.forEach(note => { note.hidden = kind !== 'all' && note.dataset.noteKind !== kind; if (!note.hidden) visible += 1; });
      count!.textContent = kind === 'all' ? `共 ${visible} 则短笺` : `${kind} · ${visible} 则短笺`;
      if (updateUrl) {
        // A category is shareable, while choosing it does not add a Back-button stop.
        const state = { ...historyData() };
        delete state.arMarginaliaPosition;
        history.replaceState(state, '', archiveHref(kind, '#marginalia-notes'));
      }
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
        event.preventDefault(); buttons[next].focus(); selectFilter(buttons[next]);
      }, { signal });
    });
    const kind = categoryFromUrl();
    selectFilter(buttons.find(button => button.dataset.noteFilter === kind) ?? buttons[0], false);
    controls.hidden = false;

    const saved = readPosition(historyData().arMarginaliaPosition);
    if (saved && categoryFromUrl(new URL(saved.href, location.origin)) === kind) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (signal.aborted) return;
        const anchor = saved.anchor ? document.getElementById(saved.anchor) : null;
        const top = anchor && !anchor.hidden ? anchor.getBoundingClientRect().top + scrollY - (saved.offset ?? 0) : saved.scrollY;
        window.scrollTo({ top, behavior: 'instant' });
        anchor?.querySelector<HTMLAnchorElement>('h3 a')?.focus({ preventScroll: true });
      }));
    }

    root.addEventListener('click', event => {
      const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
      if (!link || !regularClick(event, link) || link.origin !== location.origin || !notePaths.has(link.pathname)) return;
      const card = link.closest<HTMLElement>('[data-note-kind]');
      const position: ReadingPosition = {
        href: archiveHref(categoryFromUrl(), location.hash === '#marginalia-shelf' ? '#marginalia-shelf' : '#marginalia-notes'), scrollY,
        ...(card ? { anchor: card.id, offset: card.getBoundingClientRect().top } : {}),
      };
      history.replaceState({ ...historyData(), arMarginaliaPosition: position }, '');
      event.preventDefault();
      void navigate(link.href, { state: { arMarginaliaReturn: position }, sourceElement: link });
    }, { signal });
  } else {
    // Context belongs to this history entry: refresh keeps it, a fresh article visit does not.
    const position = readPosition(historyData().arMarginaliaReturn);
    if (!position) return;
    root.querySelectorAll<HTMLAnchorElement>('[data-marginalia-return]').forEach(link => {
      link.href = position.href;
      const label = link.querySelector<HTMLElement>('[data-marginalia-return-label]');
      if (label) label.textContent = link.classList.contains('back-link') ? '返回刚才的边注' : '回到刚才的列表';
    });
    root.addEventListener('click', event => {
      const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
      if (!link || !regularClick(event, link) || link.origin !== location.origin) return;
      if (link.hasAttribute('data-marginalia-return')) {
        event.preventDefault();
        void navigate(position.href, { state: { arMarginaliaPosition: position }, sourceElement: link });
      } else if (notePaths.has(link.pathname)) {
        event.preventDefault();
        void navigate(link.href, { state: { arMarginaliaReturn: position }, sourceElement: link });
      }
    }, { signal });
  }
}

document.addEventListener('astro:before-swap', () => {
  activeController?.abort(); activeRoot = null; activeController = null;
});
// The new page and its history state are ready here; do not leave visible links
// uninitialized while astro:page-load waits for the remaining page scripts.
document.addEventListener('astro:after-swap', setupMarginalia);
document.addEventListener('astro:page-load', setupMarginalia);
setupMarginalia();
