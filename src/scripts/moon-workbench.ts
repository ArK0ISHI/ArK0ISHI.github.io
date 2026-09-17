import { readMoonState } from '../lib/moon-gate';
import { datasetIds, describeWorkbench, type WorkbenchData, type WorkbenchSnapshot } from '../lib/moon-workbench';
import frameStyles from '../styles/moon-workbench-frame.css?raw';
import frameEnhancements from './moon-workbench-frame.js?raw';

const host = window as Window & { __arWorkbenchCleanup?: () => void; __arWorkbenchElement?: HTMLElement; __arWorkbenchController?: AbortController };
const tokens = ['__MOON_DATASET__', '__MOON_SEMESTER_DATASET__', '__MOON_COURSE_DATASET__', '__MOON_FULL_DATASET__', '__MOON_RECOMMENDATION_DATASET__'];
const safeJson = (value: unknown) => JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
function frameDocument(template: string, snapshot: WorkbenchSnapshot, nonce: string) {
  let html = template;
  datasetIds.forEach((id, index) => { html = html.replace(tokens[index], () => safeJson(snapshot.data[id])); });
  const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'";
  const sendError = `parent.postMessage({type:'moon-workbench',nonce:${safeJson(nonce)},status:'error'},'*')`;
  const bootstrap = `<meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><style>html{background:#10171f}.wb-booting body{visibility:hidden}</style><script>document.documentElement.classList.add('wb-booting');addEventListener('error',()=>{${sendError}});addEventListener('unhandledrejection',()=>{${sendError}});<\/script>`;
  html = html.replace(/<head\b[^>]*>/i, match => match + bootstrap);
  html = html.replace('</head>', `<style>${frameStyles}</style></head>`);
  const finish = `<script>(()=>{try{document.getElementById('theme').click();for(const id of ['semester-mask','full-mask','course-mask','mask-personal','rec-mask']){const input=document.getElementById(id);if(input){input.checked=false;input.dispatchEvent(new Event('change',{bubbles:true}));}}const brand=document.querySelector('.sidebar .brand>span:last-child');if(brand){brand.textContent='月之暗面';const sub=document.createElement('small');sub.textContent='COMPLETE DATA ATLAS';brand.append(sub);}document.documentElement.classList.remove('wb-booting');requestAnimationFrame(()=>parent.postMessage({type:'moon-workbench',nonce:${safeJson(nonce)},status:'ready'},'*'));}catch(_){${sendError}}})();<\/script>`;
  const bodyEnd = html.toLowerCase().lastIndexOf('</body>');
  if (bodyEnd < 0) throw new Error('Missing workbench document boundary');
  return html.slice(0, bodyEnd) + finish + `<script>${frameEnhancements}<\/script>` + html.slice(bodyEnd);
}

function setupWorkbench() {
  const root = document.querySelector<HTMLElement>('[data-workbench]');
  if (root && root === host.__arWorkbenchElement && !host.__arWorkbenchController?.signal.aborted) return;
  host.__arWorkbenchCleanup?.();
  if (!root) return;
  const controller = new AbortController(); const { signal } = controller;
  host.__arWorkbenchElement = root; host.__arWorkbenchController = controller;
  const q = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const frame = q<HTMLIFrameElement>('[data-wb-frame]');
  const room = q('[data-wb-room]');
  const more = q<HTMLDetailsElement>('[data-wb-tools]');
  let operation = 0;
  let channel = '';
  let phase: 'idle' | 'loading' | 'ready' = 'idle';
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const status = (message: string, error = false) => { const node = q('[data-wb-status]'); node.textContent = message; node.dataset.error = String(error); };
  function resetFrame() {
    if (document.fullscreenElement === root) void document.exitFullscreen().catch(() => {});
    operation++; channel = ''; phase = 'idle'; clearTimeout(watchdog);
    frame.removeAttribute('srcdoc'); frame.src = 'about:blank'; room.hidden = true;
    root!.removeAttribute('data-loaded'); root!.setAttribute('aria-busy', 'false');
    q<HTMLButtonElement>('[data-wb-reload]').disabled = false;
  }
  function fail() {
    resetFrame(); q('[data-wb-error]').hidden = false;
    status('工作台暂时未能载入。请检查网络后重试。', true);
  }
  async function load() {
    if (phase !== 'idle' || !readMoonState().unlocked) return;
    const version = ++operation; phase = 'loading';
    root!.setAttribute('aria-busy', 'true');
    q('[data-wb-error]').hidden = true; q('[data-wb-loading]').hidden = false;
    q<HTMLButtonElement>('[data-wb-reload]').disabled = true;
    room.hidden = false; status('正在展开完整数据与十一个分析视角……');
    try {
      const [{ default: template }, { default: data }] = await Promise.all([
        import('../data/moon-workbench-template.html?raw'),
        import('../data/moon-workbench.json'),
      ]);
      if (signal.aborted || version !== operation || !readMoonState().unlocked) return;
      const snapshot = describeWorkbench(data as unknown as WorkbenchData);
      channel = crypto.randomUUID();
      q('[data-wb-summary]').textContent = `${snapshot.people.toLocaleString('zh-CN')} 人 · ${snapshot.semesterRecords.toLocaleString('zh-CN')} 条学期记录 · ${snapshot.courseRecords.toLocaleString('zh-CN')} 条课程记录 · ${snapshot.recommendations.toLocaleString('zh-CN')} 条保研记录`;
      frame.removeAttribute('src'); frame.srcdoc = frameDocument(template, snapshot, channel);
      watchdog = setTimeout(() => { if (version === operation) fail(); }, 25000);
    } catch { if (!signal.aborted && version === operation) fail(); }
  }
  function gate() {
    const unlocked = readMoonState().unlocked;
    root!.dataset.unlocked = String(unlocked);
    more.hidden = !unlocked; more.open = false;
    q('[data-wb-expand]').hidden = !unlocked || !document.fullscreenEnabled;
    q('[data-wb-locked]').hidden = unlocked; q('[data-wb-content]').hidden = !unlocked;
    if (!unlocked) { resetFrame(); q('[data-wb-error]').hidden = true; }
    else void load();
  }
  window.addEventListener('message', event => {
    if (event.source !== frame.contentWindow || !event.data || event.data.type !== 'moon-workbench' || event.data.nonce !== channel || !channel) return;
    clearTimeout(watchdog);
    if (event.data.status === 'ready') {
      phase = 'ready'; root.dataset.loaded = 'true'; root.setAttribute('aria-busy', 'false');
      q('[data-wb-loading]').hidden = true; q<HTMLButtonElement>('[data-wb-reload]').disabled = false;
      status('完整原版已展开 · 可直接查看明细、切换视角与导出。');
    } else if (event.data.status === 'error') fail();
  }, { signal });
  root.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button'); if (!button) return;
    // A failed module fetch stays cached in the current document; retry with a fresh one.
    if (button.hasAttribute('data-wb-retry')) { window.location.reload(); return; }
    if (button.hasAttribute('data-wb-reload')) { more.open = false; resetFrame(); void load(); }
    if (button.hasAttribute('data-wb-expand')) {
      const toggle = document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen();
      void toggle.catch(() => status('当前浏览器未允许全屏，仍可在页面内使用完整工作台。'));
    }
  }, { signal });
  document.addEventListener('click', event => { if (!more.contains(event.target as Node)) more.open = false; }, { signal });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && more.open) { more.open = false; more.querySelector('summary')?.focus(); } }, { signal });
  more.addEventListener('focusout', event => { if (event.relatedTarget && !more.contains(event.relatedTarget as Node)) more.open = false; }, { signal });
  window.addEventListener('blur', () => { more.open = false; }, { signal });
  q<HTMLDialogElement>('[data-moon-dialog]').addEventListener('close', () => {
    if (readMoonState().unlocked && (!document.activeElement || !document.activeElement.getClientRects().length || document.activeElement === document.body)) q<HTMLDetailsElement>('[data-wb-tools]').querySelector('summary')?.focus();
  }, { signal });
  document.addEventListener('ar:moon-state', gate, { signal });
  document.addEventListener('fullscreenchange', () => { q('[data-wb-expand]').textContent = document.fullscreenElement ? '退出全屏' : '全屏'; }, { signal });
  if (!document.fullscreenEnabled) q('[data-wb-expand]').hidden = true;
  host.__arWorkbenchCleanup = () => { operation++; controller.abort(); clearTimeout(watchdog); frame.removeAttribute('srcdoc'); };
  document.addEventListener('astro:before-swap', host.__arWorkbenchCleanup, { once: true, signal });
  gate();
}
document.addEventListener('astro:page-load', setupWorkbench);
setupWorkbench();
