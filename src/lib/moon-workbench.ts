/** Private records exist only in this document's memory, never browser storage. */
export const datasetIds = ['dataset','semester-dataset','course-dataset','full-dataset'] as const;
export type DatasetId = typeof datasetIds[number];
export type WorkbenchData = Record<DatasetId, Record<string, unknown>>;
export type WorkbenchSession = { data: WorkbenchData; fileName: string; people: number; semesterRecords: number; courseRecords: number; asOf: string };
let current: WorkbenchSession | null = null;
export const getWorkbenchSession = () => current;
export const clearWorkbenchSession = () => { current = null; };
export const setWorkbenchSession = (session: WorkbenchSession) => { current = session; };
if (typeof document !== 'undefined') document.addEventListener('ar:moon-state', (event) => {
  if (!(event as CustomEvent<{unlocked:boolean}>).detail?.unlocked) clearWorkbenchSession();
});

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function arrayAt(data: Record<string, unknown>, key: string): unknown[] {
  const value = data[key];
  if (!Array.isArray(value) || !value.length) throw new Error('文件里的数据表不完整，请选择原始完整 HTML。');
  return value;
}

/** Extract inert JSON text without creating a document or evaluating any code. */
export function parseWorkbenchHtml(html: string, fileName: string): WorkbenchSession {
  const data = {} as WorkbenchData;
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const id = /\bid\s*=\s*(["'])([^"']+)\1/i.exec(match[1])?.[2] as DatasetId;
    if (!datasetIds.includes(id)) continue;
    if (!/\btype\s*=\s*(["'])application\/json\1/i.test(match[1]) || data[id]) throw new Error('文件的数据区块格式不正确，或存在重复区块。');
    let parsed: unknown;
    try { parsed = JSON.parse(match[2]); } catch { throw new Error('数据区块无法读取，请使用保存完整的原始 HTML。'); }
    if (!record(parsed)) throw new Error('数据区块格式与原工作台不一致。');
    data[id] = parsed;
  }
  if (datasetIds.some((id) => !data[id])) throw new Error('没有找到全部四组数据。请选择原来的「四年级绩点可视化.html」，而非当前主页的保存文件。');
  let nodes = 0;
  function validate(value: unknown, depth = 0): void {
    if (++nodes > 2000000 || depth > 35) throw new Error('文件结构过于复杂，无法在本机安全读取。');
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('文件包含无法识别的数值。');
    if (typeof value === 'string' && (/[<>]/.test(value) || /\bon[a-z]+\s*=|javascript:|data:text\/html/i.test(value))) throw new Error('数据中含有网页代码标记，请改用未经改写的原始数据文件。');
    if (Array.isArray(value)) value.forEach((item) => validate(item,depth+1));
    else if (record(value)) for (const [key,item] of Object.entries(value)) {
      if (['__proto__','constructor','prototype'].includes(key)) throw new Error('文件包含不支持的数据字段。');
      validate(item,depth+1);
    }
  }
  validate(data);
  const rows = arrayAt(data.dataset,'rows');
  arrayAt(data.dataset,'years'); arrayAt(data.dataset,'colleges'); arrayAt(data.dataset,'majors');
  const gpas = arrayAt(data['semester-dataset'],'gpas');
  const terms = arrayAt(data['semester-dataset'],'terms');
  if (rows.length !== gpas.length || rows.length > 200000 || !rows.every((row) => Array.isArray(row) && row.length >= 8) || !gpas.every((row) => Array.isArray(row) && row.length === terms.length)) throw new Error('学生与学期记录无法对应，请使用同一份完整可视化文件。');
  const groups = arrayAt(data['course-dataset'],'groups');
  if (!groups.every((group) => record(group) && Array.isArray(group.students) && Array.isArray(group.courses))) throw new Error('核心课程数据不完整。');
  const full = data['full-dataset'];
  const records = arrayAt(full,'records');
  arrayAt(full,'students'); arrayAt(full,'courses'); arrayAt(full,'terms'); arrayAt(full,'years');
  if (records.length > 500000) throw new Error('课程记录过多，请使用原始可视化文件。');
  const meta = record(data.dataset.meta) ? data.dataset.meta : {};
  return { data, fileName, people: rows.length, semesterRecords: gpas.reduce<number>((sum,row) => sum+(row as unknown[]).filter((v) => typeof v === 'number').length,0), courseRecords: records.length, asOf: typeof meta.asOf === 'string' ? meta.asOf : '以原文件为准' };
}
