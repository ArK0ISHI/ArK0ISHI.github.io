import { readMoonState } from '../lib/moon-gate';
import { datasetIds, parseWorkbenchHtml, getWorkbenchSession, setWorkbenchSession, clearWorkbenchSession, type WorkbenchSession } from '../lib/moon-workbench';
import frameStyles from '../styles/moon-workbench-frame.css?raw';

const host = window as Window & { __arWorkbenchCleanup?: () => void };
const tokens = ['__MOON_DATASET__','__MOON_SEMESTER_DATASET__','__MOON_COURSE_DATASET__','__MOON_FULL_DATASET__'];
const safeJson = (value: unknown) => JSON.stringify(value).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
function frameDocument(template: string, session: WorkbenchSession, nonce: string) {
  let html = template;
  datasetIds.forEach((id,index) => { html = html.replace(tokens[index],() => safeJson(session.data[id])); });
  const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'";
  const send = `parent.postMessage({type:'moon-workbench',nonce:${safeJson(nonce)},status:'error'},'*')`;
  const bootstrap = `<meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><style>html{background:#10171f}.wb-booting body{visibility:hidden}</style><script>document.documentElement.classList.add('wb-booting');addEventListener('error',()=>{${send}});addEventListener('unhandledrejection',()=>{${send}});<\/script>`;
  html = html.replace(/<head\b[^>]*>/i,(match) => match+bootstrap);
  html = html.replace('</head>',`<style>${frameStyles}</style></head>`);
  const finish = `<script>(()=>{try{document.getElementById('theme').click();for(const id of ['semester-mask','full-mask','course-mask','mask-personal']){const input=document.getElementById(id);if(input){input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));}}const brand=document.querySelector('.sidebar .brand>span:last-child');if(brand){brand.textContent='月之暗面';const sub=document.createElement('small');sub.textContent='FULL DATA WORKBENCH';brand.append(sub);}document.documentElement.classList.remove('wb-booting');requestAnimationFrame(()=>parent.postMessage({type:'moon-workbench',nonce:${safeJson(nonce)},status:'ready'},'*'));}catch(_){${send}}})();<\/script>`;
  const bodyEnd = html.toLowerCase().lastIndexOf('</body>');
  if (bodyEnd < 0) throw new Error('Missing workbench document boundary');
  return html.slice(0,bodyEnd)+finish+html.slice(bodyEnd);
}

function setupWorkbench() {
  host.__arWorkbenchCleanup?.();
  const root = document.querySelector<HTMLElement>('[data-workbench]');
  if (!root) return;
  const controller = new AbortController(); const {signal} = controller;
  const q = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const input = q<HTMLInputElement>('[data-wb-file]');
  const frame = q<HTMLIFrameElement>('[data-wb-frame]');
  const room = q<HTMLElement>('[data-wb-room]');
  let operation = 0;
  let channel = '';
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const status = (message: string, error = false) => { const node=q('[data-wb-status]');node.textContent=message;node.dataset.error=String(error); };
  const picking = (busy: boolean) => root.querySelectorAll<HTMLButtonElement>('[data-wb-pick]').forEach((button) => button.disabled=busy);
  function clearFrame() {
    if (document.fullscreenElement === room) void document.exitFullscreen().catch(() => {});
    operation++; channel=''; clearTimeout(watchdog); frame.removeAttribute('srcdoc'); frame.src='about:blank'; room.hidden=true;
    q('[data-wb-import]').hidden=false; input.value=''; root!.removeAttribute('data-loaded'); picking(false);
  }
  function forget() { clearWorkbenchSession(); clearFrame(); status('本机明细已从这间工作台清除。需要时可重新导入。'); }
  async function mount(session: WorkbenchSession) {
    const version=++operation; picking(true); status('正在本机展开十个分析视角……');
    try {
      const {default:template} = await import('../data/moon-workbench-template.html?raw');
      if(signal.aborted || version!==operation || !readMoonState().unlocked) return;
      channel=crypto.randomUUID();
      setWorkbenchSession(session);
      q('[data-wb-summary]').textContent=`${session.people.toLocaleString('zh-CN')} 人 · ${session.semesterRecords.toLocaleString('zh-CN')} 条学期记录 · ${session.courseRecords.toLocaleString('zh-CN')} 条课程记录`;
      q('[data-wb-import]').hidden=true; room.hidden=false; frame.removeAttribute('src');
      frame.srcdoc=frameDocument(template,session,channel);
      clearTimeout(watchdog);
      watchdog=setTimeout(()=>{ if(version!==operation)return; forget();status('工作台未能完成载入。请重新选择完整的原始 HTML。',true); },25000);
    } catch { if(!signal.aborted && version===operation) { picking(false);status('工作台暂时无法载入，请稍后再选择文件重试。',true); } }
  }
  async function acceptFile(file: File | undefined) {
    if(!file || !readMoonState().unlocked) return;
    if(file.size > 20*1024*1024 || !/\.html?$/i.test(file.name)) { status('请选择不超过 20 MB 的原始 HTML 文件。',true);return; }
    const version=++operation; picking(true); status('正在本机读取数据区块，不会上传文件……');
    try {
      const html=await file.text();
      if(signal.aborted || version!==operation || !readMoonState().unlocked)return;
      const session=parseWorkbenchHtml(html,file.name);
      await mount(session);
    } catch(error) { if(!signal.aborted && version===operation) { picking(false);status(error instanceof Error ? error.message : '文件无法读取，请重新选择原始 HTML。',true); } }
    finally { if(!signal.aborted && !channel) picking(false); input.value=''; }
  }
  function gate() {
    const unlocked=readMoonState().unlocked;
    q('[data-wb-locked]').hidden=unlocked; q('[data-wb-content]').hidden=!unlocked;
    if(!unlocked) { forget(); }
    else { const session=getWorkbenchSession(); if(session && !channel) void mount(session); }
  }
  window.addEventListener('message',(event) => {
    if(event.source!==frame.contentWindow || !event.data || event.data.type!=='moon-workbench' || event.data.nonce!==channel || !channel) return;
    clearTimeout(watchdog); picking(false);
    if(event.data.status==='ready') { root.dataset.loaded='true';status('完整工作台已就绪 · 明细仅在本机内存中 · 刷新页面后需重新导入。'); }
    if(event.data.status==='error') { forget();status('这份文件与当前工作台的数据格式不兼容，未保留明细。请使用原始完整 HTML。',true); }
  },{signal});
  root.addEventListener('click',(event) => {
    const button=(event.target as Element).closest<HTMLButtonElement>('button'); if(!button)return;
    if(button.hasAttribute('data-wb-pick')) input.click();
    if(button.hasAttribute('data-wb-clear')) { forget();q<HTMLButtonElement>('.wb-import [data-wb-pick]').focus(); }
    if(button.hasAttribute('data-wb-expand')) {
      const toggle = document.fullscreenElement ? document.exitFullscreen() : room.requestFullscreen();
      void toggle.catch(()=>status('当前浏览器未允许全屏，仍可在页面内使用完整工作台。'));
    }
  },{signal});
  input.addEventListener('change',()=>void acceptFile(input.files?.[0]),{signal});
  const dropZone=q('[data-wb-import]');
  dropZone.addEventListener('dragover',(event)=>{event.preventDefault();dropZone.classList.add('is-dragging');},{signal});
  dropZone.addEventListener('dragleave',()=>dropZone.classList.remove('is-dragging'),{signal});
  dropZone.addEventListener('drop',(event)=>{event.preventDefault();dropZone.classList.remove('is-dragging');if(event.dataTransfer?.files.length!==1){status('请一次放入一个原始 HTML 文件。',true);return;}void acceptFile(event.dataTransfer.files[0]);},{signal});
  document.addEventListener('ar:moon-state',gate,{signal});
  document.addEventListener('fullscreenchange',()=>{q('[data-wb-expand]').textContent=document.fullscreenElement?'退出展开':'展开工作台';},{signal});
  if(!document.fullscreenEnabled) q('[data-wb-expand]').hidden=true;
  host.__arWorkbenchCleanup=()=>{operation++;controller.abort();clearTimeout(watchdog);frame.removeAttribute('srcdoc');};
  document.addEventListener('astro:before-swap',host.__arWorkbenchCleanup,{once:true,signal});
  gate();
}
document.addEventListener('astro:page-load',setupWorkbench);
setupWorkbench();
