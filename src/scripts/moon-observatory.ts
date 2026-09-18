import { fetchMoonObservatoryData, MoonAccessError } from '../lib/moon-access';
import type { MoonObservatoryData } from '../lib/moon-observatory-data';
import { readMoonState, resetMoonState } from '../lib/moon-gate';
import { drawMoonChart, type ChartSpec } from '../lib/moon-charts';

type Data = MoonObservatoryData;
type View = 'overview' | 'semesters' | 'groups' | 'courses';
type Cell = string | number;
type Stats = { n: number; mean: number; median: number; q1: number; q3: number };
type State = { view: View; year: string; groupKind: string; groupSort: string; groupSearch: string; courseGroup: string; courseKind: string; courseSort: string; courseSearch: string; courseTable: string; metric: string; overviewTable: string; page: number };
const defaults: State = { view: 'overview', year: 'all', groupKind: 'college', groupSort: 'mean', groupSearch: '', courseGroup: 'physics', courseKind: 'core', courseSort: 'mean', courseSearch: '', courseTable:'courses', metric: 'mean', overviewTable: 'distribution', page: 0 };
const colors = ['#d2b879', '#91bac9', '#afa3cf', '#a2c5b0'];
const stateKey = 'ar-moon-view-v1';
const fmt = (value: number | null | undefined, digits = 2) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
const escapeHtml = (text: unknown) => String(text).replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]!));
const moonWindow = window as Window & { __arObservatoryCleanup?: () => void };

function setupObservatory() {
  moonWindow.__arObservatoryCleanup?.();
  const root = document.querySelector<HTMLElement>('[data-observatory]');
  if (!root) return;
  const controller = new AbortController();
  const { signal } = controller;
  const q = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  let state = { ...defaults };
  try {
    const saved = JSON.parse(sessionStorage.getItem(stateKey) || 'null');
    if (saved && typeof saved === 'object') {
      for (const key of Object.keys(defaults) as (keyof State)[]) {
        if (key !== 'page' && typeof saved[key] === 'string') (state as unknown as Record<string, unknown>)[key] = saved[key].slice(0,120);
      }
    }
  } catch { /* A visit still works without browser storage. */ }
  if (!['overview','semesters','groups','courses'].includes(state.view)) state.view = 'overview';
  if (!['all','2022','2023','2024','2025'].includes(state.year)) state.year = 'all';
  if (!['college','major'].includes(state.groupKind)) state.groupKind = 'college';
  if (!['mean','median'].includes(state.metric)) state.metric = 'mean';
  if (!['core','catalogue'].includes(state.courseKind)) state.courseKind = 'core';
  if (!['physics','opto'].includes(state.courseGroup)) state.courseGroup = 'physics';
  if (!['distribution','cohorts'].includes(state.overviewTable)) state.overviewTable = 'distribution';
  if (!['courses','terms'].includes(state.courseTable)) state.courseTable = 'courses';
  let data: Data | undefined;
  let loading = false;
  let columns: string[] = [];
  let rows: Cell[][] = [];
  let tableTitle = '';
  let primary: ChartSpec | undefined;
  let secondary: ChartSpec | undefined;
  let frame = 0;
  const store = () => { try { sessionStorage.setItem(stateKey, JSON.stringify(state)); } catch { /* optional */ } };
  const feedback = (message: string) => { q('[data-mo-feedback]').textContent = message; };
  const scope = () => state.year === 'all' ? '四届合计' : `${state.year} 级`;
  const tableScope = () => state.view === 'courses' ? '独立前 20 名成绩单样本' : state.view === 'overview' && state.overviewTable === 'cohorts' ? '四届固定参照' : scope();
  const cohortColor = (year: number) => colors[data!.meta.cohortYears.indexOf(year)] || colors[0];
  const activeStats = () => state.year === 'all' ? data!.overview.all : data!.overview.cohorts.find((c) => String(c.year) === state.year)!;
  const selectedCohorts = () => data!.semesters.cohorts.filter((c) => state.year === 'all' || String(c.year) === state.year);
  const termLabel = (key: string) => data!.semesters.terms.find((t) => t.key === key)?.label || key;

  function metrics(items: [string,string,string][]) {
    q('[data-mo-metrics]').innerHTML = items.map(([label,value,note]) => `<div class="mo-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></div>`).join('');
  }
  function select(name: keyof State, label: string, options: [string,string][]) {
    return `<label class="mo-field">${escapeHtml(label)}<select data-mo-filter="${name}">${options.map(([value,text]) => `<option value="${escapeHtml(value)}" ${state[name] === value ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}</select></label>`;
  }
  function search(name: keyof State, label: string, placeholder: string) {
    return `<label class="mo-field">${escapeHtml(label)}<input type="search" data-mo-filter="${name}" value="${escapeHtml(state[name])}" placeholder="${escapeHtml(placeholder)}" maxlength="100" autocomplete="off" /></label>`;
  }
  function filters() {
    let html = '';
    if (state.view === 'overview') html = select('overviewTable', '展开数据表', [['distribution','当前分布区间'],['cohorts','四届统计对照']]);
    if (state.view === 'semesters') html = select('metric', '曲线指标', [['mean','平均绩点'],['median','绩点中位数']]) + '<p class="mo-filter-note">横轴按实际学期对齐；末期可能尚未齐全。</p>';
    if (state.view === 'groups') html = select('groupKind','观察层级',[['college','学院'],['major','专业']]) + select('groupSort','排列方式',[['mean','平均绩点 · 从高到低'],['median','中位数 · 从高到低'],['n','样本人数 · 从多到少'],['name','名称顺序']]) + search('groupSearch','查找分组','输入学院或专业名称');
    if (state.view === 'courses') html = select('courseGroup','成绩单样本', data!.courses.groups.map((g) => [g.key,`${g.name} · ${g.people} 人`])) + select('courseKind','课程口径',[['core','核心十课 · 整理口径'],['catalogue','完整目录 · 原始记录']]) + select('courseSort','排列方式',[['mean','普通均分 · 从高到低'],['weightedMean','学分加权均分 · 从高到低'],['name','课程名称顺序']]) + search('courseSearch','查找课程','例如：力学、数学');
    if (state.view === 'courses') html += select('courseTable','展开数据表',[['courses','课程汇总'],['terms','学期汇总 · 固定参照']]);
    q('[data-mo-filters]').innerHTML = html;
  }
  function table() {
    const pageSize = 12;
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    state.page = Math.max(0, Math.min(state.page, pages - 1));
    q('[data-mo-thead]').innerHTML = `<tr>${columns.map((c) => `<th scope="col">${escapeHtml(c)}</th>`).join('')}</tr>`;
    q('[data-mo-tbody]').innerHTML = rows.length ? rows.slice(state.page*pageSize,(state.page+1)*pageSize).map((row) => `<tr>${row.map((cell, index) => index === 0 ? `<th scope="row">${escapeHtml(cell)}</th>` : `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${columns.length}" style="text-align:center;padding:35px">没有符合条件的汇总记录。试试更短的关键词。</td></tr>`;
    q('[data-mo-table-title]').textContent = tableTitle;
    q('[data-mo-table-accessible]').textContent = `${tableTitle}，${tableScope()}`;
    q('[data-mo-table-count]').textContent = `${rows.length} 组记录${rows.length ? ` · 本页 ${state.page*pageSize+1}–${Math.min(rows.length,(state.page+1)*pageSize)}` : ''}`;
    q('[data-mo-page]').textContent = `${state.page+1} / ${pages}`;
    q<HTMLButtonElement>('[data-mo-prev]').disabled = state.page === 0;
    q<HTMLButtonElement>('[data-mo-next]').disabled = state.page >= pages - 1;
    q<HTMLButtonElement>('[data-mo-csv]').disabled = rows.length === 0;
  }
  function draw() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (signal.aborted || q('[data-mo-content]').hidden) return;
      for (const [key,spec] of [['primary',primary],['secondary',secondary]] as const) {
        if (!spec) continue;
        const canvas = q<HTMLCanvasElement>(`[data-mo-chart="${key}"]`);
        canvas.setAttribute('aria-label', `${spec.title}。${spec.series.map((series) => `${series.label}：${spec.labels.map((label,index) => `${label} ${series.values[index] === null ? '无公开记录' : fmt(series.values[index],spec.unit === '人' ? 0 : 2)}`).join('，')}`).join('；')}。可切换展开数据表，阅读相应的汇总记录。`);
        drawMoonChart(canvas,spec);
      }
    });
  }
  function chart(key: string, spec: ChartSpec, note: string) {
    q(`[data-mo-chart-title="${key}"]`).textContent = spec.title;
    q(`[data-mo-chart-note="${key}"]`).textContent = note;
    spec.subtitle = state.view === 'courses' ? `${data!.courses.groups.find((g) => g.key === state.courseGroup)!.name} · 样本课程` : `${scope()} · 截至 ${data!.meta.asOf}`;
    if (state.view === 'overview' && key === 'secondary') spec.subtitle = `四届固定参照 · 截至 ${data!.meta.asOf}`;
    if (key === 'primary') primary = spec; else secondary = spec;
  }
  function render(redrawFilters = true) {
    if (!data) return;
    store();
    if (redrawFilters) filters();
    feedback('');
    root!.dataset.view = state.view;
    root!.querySelectorAll<HTMLButtonElement>('[data-mo-tab]').forEach((button) => {
      const active = button.dataset.moTab === state.view;
      button.setAttribute('aria-selected',String(active)); button.tabIndex = active ? 0 : -1;
    });
    q('#mo-panel').setAttribute('aria-labelledby',`mo-tab-${state.view}`);
    q<HTMLFieldSetElement>('.mo-cohorts').disabled = state.view === 'courses';
    root!.querySelectorAll<HTMLButtonElement>('[data-mo-year]').forEach((button) => button.setAttribute('aria-pressed',String(button.dataset.moYear === state.year)));
    const stat = activeStats();
    metrics([['观察样本',fmt(stat.n,0),'人 · 累计绩点记录'],['平均绩点',fmt(stat.mean),'每名学生等权 · 0–5'],['绩点中位数',fmt(stat.median),'排序后居于中间的位置'],['中间 50% 区间',`${fmt(stat.q1)}–${fmt(stat.q3)}`,'第一至第三四分位数']]);
    q('[data-mo-scope]').textContent = `${scope()} · 数据截至 ${data.meta.asOf} · 系统年级，不同年级修读阶段不同`;
    const intro: Record<View,[string,string,string]> = {
      overview:['01 / DISTRIBUTION','先看一片星群，再看它的形状。','均值之外，分布也是答案的一部分。'],
      semesters:['02 / TRAJECTORIES','把时间展开，看看曲线如何经过。','各期有记录人群的汇总。人数变化也值得一起阅读。'],
      groups:['03 / PERSPECTIVES','换一个尺度，重新看见差异。','学院与专业有不同的课程结构，数值差异不等于教学质量的高低。'],
      courses:['04 / COURSE NOTES','回到一门门具体的课。','两组成绩单样本中的课程观察；原始百分制分数，不换算为绩点。'],
    };
    const [kicker,title,description] = intro[state.view];
    q('[data-mo-kicker]').textContent = kicker; q('[data-mo-title]').textContent = title; q('[data-mo-description]').textContent = description;
    let observation = '';
    if (state.view === 'overview') {
      const dist = stat.distribution;
      chart('primary',{kind:'columns',title:'绩点分布',unit:'人',labels:dist.map((bin) => `${bin.lower}–${bin.upper}`),series:[{label:'区间人数',color:state.year === 'all' ? colors[0] : cohortColor(Number(state.year)),values:dist.map((bin) => bin.count)}]},'区间宽度不一，柱高表示人数；除末段含 5 外，各段不含右端点。');
      chart('secondary',{kind:'bars',title:'四届对照 · 固定参照',unit:'绩点',max:5,labels:data.overview.cohorts.map((c) => `${c.year} 级`),series:[{label:'均值',color:colors[0],values:data.overview.cohorts.map((c) => c.mean)},{label:'中位数',color:colors[1],values:data.overview.cohorts.map((c) => c.median)}]},'右图始终保留四届作为参照。年份指系统年级，不能视为同等修读进度。');
      if (state.overviewTable === 'cohorts') {
        columns = ['年级','人数','平均绩点','中位数','Q1','Q3'];
        rows = data.overview.cohorts.map((c) => [`${c.year} 级`,fmt(c.n,0),fmt(c.mean),fmt(c.median),fmt(c.q1),fmt(c.q3)]);
        tableTitle = '四届统计对照';
        q('[data-mo-table-caption]').textContent = '固定参照表：列出四个年级的独立统计。上方年级选择仅影响左图与指标。';
      } else {
        columns = ['绩点区间','人数','占当前样本'];
        rows = dist.map((bin) => [bin.label,fmt(bin.count,0),`${fmt(bin.count/stat.n*100,1)}%`]);
        tableTitle = `${scope()} · 分布区间`;
        q('[data-mo-table-caption]').textContent = '相邻小区间已合并。人数与占比描述当前选择，不将区间内的个人记录公开。';
      }
      observation = `${scope()}的平均绩点为 ${fmt(stat.mean)}，中位数为 ${fmt(stat.median)}；中间一半记录落在 ${fmt(stat.q1)}–${fmt(stat.q3)}。这几个数一起读，比单看一个平均值更接近分布的形状。`;
    } else if (state.view === 'semesters') {
      const cohorts = selectedCohorts();
      const terms = data.semesters.terms;
      const metric = state.metric as 'mean'|'median';
      const label = metric === 'mean' ? '平均绩点' : '绩点中位数';
      const series = cohorts.map((c) => ({label:`${c.year} 级`,color:cohortColor(c.year),values:terms.map((term) => c.points.find((p) => p.term === term.key)?.[metric] ?? null)}));
      chart('primary',{kind:'lines',title:`逐学期${label}`,unit:'绩点',max:5,labels:terms.map((t) => t.label),series},'缺失或不足 10 人的点留空，不补 0。2026 秋资料尚未齐全，末期低值不能直接解释为成绩下降。');
      chart('secondary',{kind:'lines',title:'每一期，有多少记录？',unit:'人',labels:terms.map((t) => t.label),series:cohorts.map((c) => ({label:`${c.year} 级`,color:cohortColor(c.year),values:terms.map((t) => c.points.find((p) => p.term === t.key)?.n ?? null)}))},'与左图对应的样本人数。每期覆盖人群可能改变，曲线并非同一批人的连续追踪。');
      columns = ['年级','学期','有记录人数','平均绩点','中位数','Q1','Q3'];
      rows = cohorts.flatMap((c) => c.points.map((p) => [`${c.year} 级`,termLabel(p.term),fmt(p.n,0),fmt(p.mean),fmt(p.median),fmt(p.q1),fmt(p.q3)]));
      tableTitle = '学期记录与覆盖人数';
      q('[data-mo-table-caption]').textContent = '按年级、实际学期排列。早于 2022 秋的零散记录不在本图范围内。';
      observation = '一条曲线的转折，可能同时来自课程难度、修读阶段和记录覆盖范围的变化。将左侧的绩点与右侧的人数放在一起看，再决定如何理解它。';
    } else if (state.view === 'groups') {
      const list = state.groupKind === 'major' ? data.majors : data.colleges;
      const keyword = state.groupSearch.trim().toLocaleLowerCase();
      const groups = list.flatMap((g) => {
        const stats = state.year === 'all' ? g.all : g.cohorts.find((c) => String(c.year) === state.year);
        const college = 'college' in g ? data!.colleges.find((c) => c.key === g.college)?.name || '' : '';
        return stats && `${g.name} ${college}`.toLocaleLowerCase().includes(keyword) ? [{name:g.name,college,...stats}] : [];
      });
      const key = ['mean','median','n'].includes(state.groupSort) ? state.groupSort as keyof Stats : null;
      groups.sort((a,b) => key ? b[key]-a[key] || a.name.localeCompare(b.name,'zh') : a.name.localeCompare(b.name,'zh'));
      const shown = groups.slice(0,10);
      const label = state.groupKind === 'major' ? '专业' : '学院';
      chart('primary',{kind:'bars',title:`${label}绩点 · 当前排列前 10 组`,unit:'绩点',max:5,labels:shown.map((g) => g.name),series:[{label:'平均绩点',color:colors[0],values:shown.map((g) => g.mean)}]},'图中名称可能缩写；下方汇总表保留完整名称和所有匹配分组。');
      chart('secondary',{kind:'bars',title:'同一组别的样本人数',unit:'人',labels:shown.map((g) => g.name),series:[{label:'有记录人数',color:colors[1],values:shown.map((g) => g.n)}]},'与左图使用相同组别与顺序。至少 10 人的分组才会出现在这里。');
      columns = [label,...(state.groupKind === 'major' ? ['学院'] : []),'人数','平均绩点','中位数','Q1','Q3'];
      rows = groups.map((g) => [g.name,...(state.groupKind === 'major' ? [g.college] : []),fmt(g.n,0),fmt(g.mean),fmt(g.median),fmt(g.q1),fmt(g.q3)]);
      tableTitle = `${scope()} · ${label}汇总`;
      q('[data-mo-table-caption]').textContent = `${groups.length} 个符合条件的分组。导出包含全部匹配汇总，分页仅影响屏幕显示。`;
      observation = '排序只是整理视线的方法。课程设置、给分方式与修读进度都会影响组间差异；人数更多，也并不意味着个体之间更相似。';
    } else {
      const group = data.courses.groups.find((g) => g.key === state.courseGroup)!;
      const list = state.courseKind === 'core' ? group.core : group.catalogue;
      const filtered = list.filter((c) => c.name.toLocaleLowerCase().includes(state.courseSearch.trim().toLocaleLowerCase()));
      filtered.sort((a,b) => state.courseSort === 'name' ? a.name.localeCompare(b.name,'zh') : (b[state.courseSort === 'weightedMean' ? 'weightedMean' : 'mean'] ?? 0) - (a[state.courseSort === 'weightedMean' ? 'weightedMean' : 'mean'] ?? 0));
      const shown = filtered.slice(0,10);
      const kind = state.courseKind === 'core' ? '核心十课' : '完整课程目录';
      metrics([['成绩单样本',fmt(group.people,0),`${group.name} · 前 20 名资料`],['有数值成绩',fmt(group.scoredCount,0),`原始 ${fmt(group.recordCount,0)} 条修读记录`],['原始记录均分',fmt(group.mean),'有分记录等权 · 百分制'],['公开课程组',fmt(group.catalogue.length,0),'至少 10 人有数值成绩']]);
      q('[data-mo-scope]').textContent = `独立样本 · ${group.name} · 不受上方年级筛选影响 · 样本存在选择偏差`;
      chart('primary',{kind:'bars',title:`${kind} · 当前排列前 10 门`,unit:'分',max:100,labels:shown.map((c) => c.name),series:[{label:'普通均分',color:state.courseGroup === 'physics' ? colors[1] : colors[2],values:shown.map((c) => c.mean)}]},state.courseKind === 'core' ? '采用原可视化的核心课程整理口径；与完整目录的原始记录口径可能不同。' : '每次有数值成绩的修读记录等权。重复修读保留；未出分记录不计入均分。');
      chart('secondary',{kind:'lines',title:'样本的逐学期课程均分',unit:'分',max:100,labels:group.terms.map((t) => t.label),series:[{label:'学分加权均分',color:colors[0],values:group.terms.map((t) => t.weightedMean)}]},'固定参照：完整目录按学期汇总，不随课程关键词和排列方式改变。');
      columns = ['课程','修读人数','修读记录','有分记录','普通均分','中位数','学分加权均分'];
      rows = filtered.map((c) => [c.name,fmt(c.people,0),fmt(c.recordCount,0),fmt(c.scoredCount,0),fmt(c.mean),fmt(c.median),fmt(c.weightedMean)]);
      tableTitle = `${group.name} · ${kind}`;
      q('[data-mo-table-caption]').textContent = '修读人数为全部修读记录的去重人数，含尚未出分的记录；公开门槛另按至少 10 人已有分数判断。重复修读可能使记录数大于人数。';
      if (state.courseTable === 'terms') {
        columns = ['学期','修读人数','修读记录','有分记录','普通均分','中位数','学分加权均分'];
        rows = group.terms.map((term) => [term.label,fmt(term.people,0),fmt(term.recordCount,0),fmt(term.scoredCount,0),fmt(term.mean),fmt(term.median),fmt(term.weightedMean)]);
        tableTitle = `${group.name} · 学期汇总`;
        q('[data-mo-table-caption]').textContent = '右侧曲线的固定参照数据：完整目录按学期汇总，不受核心课程口径、课程关键词或排序影响。';
      }
      observation = data.meta.sampleNote;
    }
    q('[data-mo-observation]').textContent = observation;
    table(); draw();
  }

  async function load() {
    if (loading || data || signal.aborted) return;
    loading = true; q('[data-mo-load-error]').hidden = true;
    try {
      const received = await fetchMoonObservatoryData(signal);
      if (signal.aborted || !readMoonState().unlocked) return;
      data = received as Data;
      q('[data-mo-cohorts]').innerHTML = [['all','四届'],...data.meta.cohortYears.map((year) => [String(year),String(year)])].map(([key,label]) => `<button class="mo-cohort" type="button" data-mo-year="${key}" aria-pressed="${state.year === key}" aria-label="${key === 'all' ? '观察四届合计' : `观察 ${key} 级`}">${key === 'all' ? '' : `<i aria-hidden="true" style="--cohort-color:${cohortColor(Number(key))}"></i>`}${label}</button>`).join('');
      q('[data-mo-methodology]').innerHTML = `<p>资料截至 ${escapeHtml(data.meta.asOf)}。${escapeHtml(data.meta.source)}</p>${data.meta.methodology.filter((_,index) => index < 9).map((text) => `<p>${escapeHtml(text)}</p>`).join('')}<p>${escapeHtml(data.meta.sampleNote)}</p>`;
      updateGate();
      root!.dataset.ready = 'true';
    } catch (error) { if (!signal.aborted) { if (error instanceof MoonAccessError && error.code === 'expired') resetMoonState(); else q('[data-mo-load-error]').hidden = false; } }
    finally { loading = false; }
  }
  function updateGate() {
    const unlocked = readMoonState().unlocked;
    if (!unlocked) { data = undefined; rows = []; }
    q('[data-mo-locked]').hidden = unlocked;
    q('[data-mo-content]').hidden = !unlocked || !data;
    if (unlocked && data) render();
    if (unlocked && !data) void load();
  }
  function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url),10000);
  }
  root.addEventListener('click',(event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button) return;
    if (button.hasAttribute('data-mo-retry')) { void load(); return; }
    if (!data || !readMoonState().unlocked) return;
    if (button.dataset.moYear) { state.year = button.dataset.moYear; state.page = 0; render(); }
    if (button.dataset.moTab) { state.view = button.dataset.moTab as View; state.page = 0; render(); }
    if (button.hasAttribute('data-mo-reset')) { state = {...defaults}; render(); feedback('已回到四届总览。'); }
    if (button.hasAttribute('data-mo-prev')) { state.page--; table(); }
    if (button.hasAttribute('data-mo-next')) { state.page++; table(); }
    if (button.hasAttribute('data-mo-csv')) {
      const cell = (value: Cell) => { let text = String(value); if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"','""')}"`; };
      const metadata = [tableScope(),data.meta.asOf,state.view === 'courses' ? '前20名样本，不代表专业总体；有分人数至少10' : '至少10人分组；缺失不补0'];
      const csv = '\uFEFF' + [[...columns,'统计范围','资料日期','口径说明'],...rows.map((row) => [...row,...metadata])].map((row) => row.map(cell).join(',')).join('\r\n');
      download(new Blob([csv],{type:'text/csv;charset=utf-8'}),`月之暗面-${tableTitle}-${data.meta.asOf}.csv`);
      feedback(`已导出 ${rows.length} 组汇总记录。`);
    }
    if (button.dataset.moImage) {
      const key = button.dataset.moImage;
      q<HTMLCanvasElement>(`[data-mo-chart="${key}"]`).toBlob((blob) => { if (blob) { download(blob,`月之暗面-${key === 'primary' ? primary?.title : secondary?.title}.png`); feedback('图表已保存为 PNG 图片。'); } else feedback('图片暂时未能保存，请再试一次。'); },'image/png');
    }
  },{signal});
  root.addEventListener('change',(event) => {
    const element = event.target as HTMLSelectElement;
    if (!element.matches('select[data-mo-filter]')) return;
    const key = element.dataset.moFilter as keyof State;
    (state as unknown as Record<string, unknown>)[key] = element.value; state.page = 0; render();
    q<HTMLSelectElement>(`[data-mo-filter="${key}"]`).focus({preventScroll:true});
  },{signal});
  root.addEventListener('input',(event) => {
    const element = event.target as HTMLInputElement;
    if (!element.matches('input[data-mo-filter]')) return;
    const key = element.dataset.moFilter as 'groupSearch'|'courseSearch'; state[key] = element.value; state.page = 0; render(false);
  },{signal});
  q('.mo-tabs').addEventListener('keydown',(event) => {
    const keyboard = event as KeyboardEvent;
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(keyboard.key)) return;
    const buttons = [...root!.querySelectorAll<HTMLButtonElement>('[data-mo-tab]')];
    const index = buttons.findIndex((button) => button === document.activeElement);
    if (index < 0) return;
    keyboard.preventDefault();
    const next = keyboard.key === 'Home' ? 0 : keyboard.key === 'End' ? buttons.length-1 : (index + (keyboard.key === 'ArrowRight' ? 1 : -1) + buttons.length)%buttons.length;
    buttons[next].focus(); buttons[next].click();
  },{signal});
  document.addEventListener('ar:moon-state',() => {
    const hadContent = !q('[data-mo-content]').hidden;
    updateGate();
    if (hadContent && !readMoonState().unlocked) {
      const title = q('#mo-locked-title'); title.tabIndex = -1; title.focus({preventScroll:true});
      q('[data-mo-locked]').scrollIntoView({behavior:'instant',block:'center'});
    }
  },{signal});
  const observer = new ResizeObserver(draw);
  root.querySelectorAll('.mo-chart-wrap').forEach((element) => observer.observe(element));
  moonWindow.__arObservatoryCleanup = () => { controller.abort(); observer.disconnect(); cancelAnimationFrame(frame); };
  document.addEventListener('astro:before-swap',moonWindow.__arObservatoryCleanup,{once:true,signal});
  updateGate();
}
document.addEventListener('astro:page-load',setupObservatory);
setupObservatory();
