import type { KaleidoscopeScene } from '../data/kaleidoscope';
import type { LightNotePhoto } from '../data/lightNotes';

type Scene = KaleidoscopeScene & { photo: LightNotePhoto };
type View = 'chance' | 'curated';
let activeRoot: HTMLElement | null = null;
let activeController: AbortController | null = null;

function setupKaleidoscope() {
  const root = document.querySelector<HTMLElement>('[data-kaleidoscope]');
  if (root && root === activeRoot && activeController && !activeController.signal.aborted) return;
  activeController?.abort();
  activeRoot = root;
  activeController = null;
  if (!root) return;
  const data = root.querySelector('[data-kw-data]');
  if (!data?.textContent) return;
  let scenes: Scene[];
  try { scenes = JSON.parse(data.textContent) as Scene[]; } catch { return; }
  if (!Array.isArray(scenes) || !scenes.length) return;
  const controller = new AbortController();
  activeController = controller;
  const { signal } = controller;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const query = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const all = <T extends HTMLElement = HTMLElement>(selector: string) => [...root.querySelectorAll<T>(selector)];
  const stations = all<HTMLButtonElement>('[data-kw-station]');
  const scenePanels = all('[data-kw-scene]');
  const notes = all('[data-kw-note]');
  const points = all<HTMLAnchorElement>('[data-kw-point]');
  const toneInput = query<HTMLInputElement>('[data-kw-tone]');
  const announcement = query('[data-kw-announcement]');
  const visited = new Set<string>();
  let scene = scenes[0];
  let view: View = 'chance';
  let detail = '';
  let tone = 70;
  let motionWanted = false;
  let markerVisible = true;
  let lastPoint: HTMLElement | null = null;
  let noticeTimer = 0;

  function say(text: string) { announcement.textContent = text; }
  function imageForCurrent() { return query<HTMLImageElement>(`[data-kw-scene="${scene.id}"] .kw-landscape`); }
  function checkImage() {
    const img = imageForCurrent();
    query('[data-kw-image-error]').hidden = !img.complete || img.naturalWidth > 0;
  }
  function loadSceneImage() {
    const img = imageForCurrent();
    img.loading = 'eager';
    checkImage();
  }
  function urlForState(detailId = detail, sceneId: string = scene.id) {
    const url = new URL('/kaleidoscope/', location.origin);
    url.searchParams.set('scene', sceneId);
    if (view === 'curated') { url.searchParams.set('view', view); if (tone !== 70) url.searchParams.set('tone', String(tone)); }
    if (detailId) url.searchParams.set('detail', detailId);
    return url;
  }
  function writeUrl() {
    const url = urlForState();
    history.replaceState(history.state, '', url.pathname + url.search);
  }
  function updateDetailLinks() {
    points.forEach(point => { point.href = urlForState(point.dataset.kwPoint, point.dataset.kwPointScene).href; });
    all<HTMLAnchorElement>('[data-kw-detail-link]').forEach(link => { link.href = urlForState(link.dataset.kwDetailLink, link.dataset.kwDetailScene).href; });
  }
  function setMotion() {
    const playing = motionWanted && !reducedMotion.matches && !document.hidden;
    root!.dataset.motion = playing ? 'playing' : 'paused';
    const button = query<HTMLButtonElement>('[data-kw-motion]');
    button.setAttribute('aria-pressed', String(playing));
    button.textContent = reducedMotion.matches ? '已减少动态' : playing ? '暂停光影' : '让光影流动';
    button.disabled = reducedMotion.matches;
    button.title = reducedMotion.matches ? '已遵循系统的减少动态效果设置' : '';
  }
  function render() {
    root!.dataset.view = view;
    root!.style.setProperty('--kw-tone', String(tone / 100));
    query('.kw-carriage').style.setProperty('--scene-accent', scene.accent);
    stations.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.kwStation === scene.id)));
    scenePanels.forEach(panel => { panel.hidden = panel.dataset.kwScene !== scene.id; });
    all('[data-kw-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.kwView === view)));
    query('[data-kw-tone-control]').hidden = view !== 'curated';
    toneInput.value = String(tone);
    query<HTMLOutputElement>('[data-kw-tone-value]').value = `${tone}%`;
    query('[data-kw-counter]').textContent = `${scene.number} / ${String(scenes.length).padStart(2, '0')}`;
    query('[data-kw-place]').textContent = scene.photo.location.place;
    const time = query<HTMLTimeElement>('[data-kw-time]');
    time.textContent = scene.timeLabel;
    time.dateTime = scene.photo.shotAt;
    query<HTMLAnchorElement>('[data-kw-original]').href = scene.photo.full;
    query<HTMLAnchorElement>('[data-kw-error-source]').href = scene.photo.full;
    query('[data-kw-scene-title]').textContent = scene.title;
    query('[data-kw-introduction]').textContent = scene.introduction;
    query('[data-kw-view-note]').textContent = view === 'chance' ? scene.chanceNote : scene.curatedNote;
    query('[data-kw-view-label]').textContent = view === 'chance' ? '保留偶然' : '修饰风景';
    all('[data-kw-detail-list]').forEach(list => { list.hidden = list.dataset.kwDetailList !== scene.id; });
    notes.forEach(note => { note.hidden = note.dataset.kwNoteScene !== scene.id || note.dataset.kwNote !== detail; });
    points.forEach(point => {
      point.setAttribute('aria-expanded', String(point.dataset.kwPointScene === scene.id && point.dataset.kwPoint === detail));
    });
    all<HTMLAnchorElement>('[data-kw-detail-link]').forEach(link => {
      if (link.dataset.kwDetailScene === scene.id && link.dataset.kwDetailLink === detail) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
    updateDetailLinks();
    query('[data-kw-empty]').hidden = Boolean(detail);
    const count = scene.details.filter(item => visited.has(`${scene.id}/${item.id}`)).length;
    query('[data-kw-progress]').textContent = count ? `已留意 ${count} / ${scene.details.length} 处细节` : '从一处细节开始';
    query('[data-kw-share-fallback]').hidden = true;
    loadSceneImage();
  }
  function restore() {
    const url = new URL(location.href);
    const hashScene = scenes.find(item => item.details.some(note => url.hash === `#kw-note-${item.id}-${note.id}`));
    scene = hashScene ?? scenes.find(item => item.id === url.searchParams.get('scene')) ?? scenes[0];
    view = url.searchParams.get('view') === 'curated' ? 'curated' : 'chance';
    const requestedTone = url.searchParams.get('tone');
    tone = requestedTone !== null && /^\d{1,3}$/.test(requestedTone) ? Math.max(0, Math.min(100, Number(requestedTone))) : 70;
    detail = scene.details.find(item => url.hash === `#kw-note-${scene.id}-${item.id}`)?.id
      ?? scene.details.find(item => item.id === url.searchParams.get('detail'))?.id ?? '';
    if (detail) visited.add(`${scene.id}/${detail}`);
    render();
  }
  function selectScene(id: string) {
    const next = scenes.find(item => item.id === id);
    if (!next || next === scene) return;
    scene = next;
    detail = '';
    lastPoint = null;
    render();
    writeUrl();
    say(`窗景已切换为${scene.city}，${scene.title}。有三个细节可以观察。`);
  }
  function selectDetail(id: string, trigger: HTMLElement) {
    const item = scene.details.find(item => item.id === id);
    if (!item) return;
    detail = item.id;
    visited.add(`${scene.id}/${detail}`);
    lastPoint = trigger;
    render();
    writeUrl();
    const article = query(`[data-kw-note-scene="${scene.id}"][data-kw-note="${detail}"]`);
    article.focus({ preventScroll: true });
    const box = article.getBoundingClientRect();
    if (box.top < 85 || box.bottom > innerHeight - 16) article.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'nearest' });
    say(`窗边观察：${item.title}。`);
  }
  function closeDetail() {
    if (!detail) return;
    const closedDetail = detail;
    detail = '';
    render();
    writeUrl();
    if (lastPoint?.isConnected && lastPoint.getClientRects().length && getComputedStyle(lastPoint).visibility === 'visible') lastPoint.focus();
    else {
      const indexLink = root!.querySelector<HTMLAnchorElement>(`[data-kw-detail-scene="${scene.id}"][data-kw-detail-link="${closedDetail}"]`);
      (indexLink ?? stations.find(button => button.dataset.kwStation === scene.id))?.focus();
    }
    say('已收起窗边观察。');
  }

  root.dataset.enhanced = 'true';
  ['[data-kw-controls]', '[data-kw-stations]', '[data-kw-detail-index]', '[data-kw-hint]'].forEach(selector => { query(selector).hidden = false; });
  all('[data-kw-note-close]').forEach(button => { button.hidden = false; });
  stations.forEach((button, index) => {
    button.addEventListener('click', () => selectScene(button.dataset.kwStation!), { signal });
    button.addEventListener('keydown', event => {
      let next: number | undefined;
      if (event.key === 'ArrowRight') next = (index + 1) % stations.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + stations.length) % stations.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = stations.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      stations[next].focus();
      selectScene(stations[next].dataset.kwStation!);
    }, { signal });
  });
  all<HTMLButtonElement>('[data-kw-view]').forEach(button => button.addEventListener('click', () => {
    view = button.dataset.kwView === 'curated' ? 'curated' : 'chance';
    render(); writeUrl(); say(view === 'chance' ? '保留偶然：显示照片本来的色彩。' : '修饰风景：调整色彩与玻璃光晕，照片细节保持原样。');
  }, { signal }));
  toneInput.addEventListener('input', () => {
    tone = Number(toneInput.value);
    root.style.setProperty('--kw-tone', String(tone / 100));
    query<HTMLOutputElement>('[data-kw-tone-value]').value = `${tone}%`;
    updateDetailLinks();
    writeUrl();
  }, { signal });
  root.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const point = target.closest<HTMLAnchorElement>('[data-kw-point], [data-kw-detail-link]');
    if (!point || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    selectDetail(point.dataset.kwPoint ?? point.dataset.kwDetailLink ?? '', point);
  }, { signal });
  all<HTMLButtonElement>('[data-kw-note-close]').forEach(button => button.addEventListener('click', closeDetail, { signal }));
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('[data-search-dialog][open]')) closeDetail();
  }, { signal });
  query<HTMLButtonElement>('[data-kw-markers]').addEventListener('click', event => {
    markerVisible = !markerVisible;
    root.dataset.markers = markerVisible ? 'visible' : 'hidden';
    const button = event.currentTarget as HTMLButtonElement;
    button.setAttribute('aria-pressed', String(markerVisible));
    button.textContent = markerVisible ? '收起观察点' : '显示观察点';
    query('[data-kw-hint]').hidden = !markerVisible;
  }, { signal });
  query<HTMLButtonElement>('[data-kw-motion]').addEventListener('click', () => { motionWanted = !motionWanted; setMotion(); }, { signal });
  reducedMotion.addEventListener('change', setMotion, { signal });
  document.addEventListener('visibilitychange', setMotion, { signal });
  all<HTMLImageElement>('.kw-landscape').forEach(img => {
    img.addEventListener('load', checkImage, { signal });
    img.addEventListener('error', checkImage, { signal });
  });
  query<HTMLButtonElement>('[data-kw-retry]').addEventListener('click', () => {
    const img = imageForCurrent();
    query('[data-kw-image-error]').hidden = true;
    // A new URL bypasses a cached failed response without adding an external source.
    img.removeAttribute('srcset');
    img.src = `${scene.photo.full}?retry=${Date.now()}`;
  }, { signal });
  query<HTMLButtonElement>('[data-kw-copy]').addEventListener('click', async event => {
    const button = event.currentTarget as HTMLButtonElement;
    const url = urlForState().href;
    try {
      await navigator.clipboard.writeText(url);
      if (signal.aborted) return;
      button.textContent = '窗景地址已复制';
      say('已复制当前场景、观看方式与观察点的链接。');
      window.clearTimeout(noticeTimer);
      noticeTimer = window.setTimeout(() => { if (!signal.aborted) button.textContent = '带走这扇窗 ↗'; }, 2400);
    } catch {
      if (signal.aborted) return;
      query('[data-kw-share-fallback]').hidden = false;
      const input = query<HTMLInputElement>('[data-kw-share-url]');
      input.value = url; input.focus(); input.select();
      say('已显示窗景地址，可以直接复制。');
    }
  }, { signal });
  query<HTMLButtonElement>('[data-kw-share-close]').addEventListener('click', () => {
    query('[data-kw-share-fallback]').hidden = true;
    query<HTMLButtonElement>('[data-kw-copy]').focus();
  }, { signal });
  window.addEventListener('popstate', restore, { signal });
  window.addEventListener('hashchange', restore, { signal });
  signal.addEventListener('abort', () => { window.clearTimeout(noticeTimer); }, { once: true });
  restore();
  setMotion();
}

document.addEventListener('astro:before-swap', () => { activeController?.abort(); activeRoot = null; activeController = null; });
document.addEventListener('astro:after-swap', setupKaleidoscope);
document.addEventListener('astro:page-load', setupKaleidoscope);
setupKaleidoscope();
