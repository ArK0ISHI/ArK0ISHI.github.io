export const datasetIds = ['dataset', 'semester-dataset', 'course-dataset', 'full-dataset', 'recommendation-dataset'] as const;
export type DatasetId = typeof datasetIds[number];
export type WorkbenchData = Record<DatasetId, Record<string, unknown>>;
export type WorkbenchSnapshot = { data: WorkbenchData; people: number; semesterRecords: number; courseRecords: number; recommendations: number; asOf: string };
export const workbenchModules = ['总绩点全景', '保研分析', '学期趋势', '学期变化', '学生轨迹', '学院分析', '专业对比', '全部课程', '核心十课', '学生明细', '数据与口径'];

export function describeWorkbench(data: WorkbenchData): WorkbenchSnapshot {
  for (const id of datasetIds) if (!data[id] || typeof data[id] !== 'object') throw new Error('工作台数据尚未完整载入。');
  const rows = data.dataset.rows as unknown[][];
  const gpas = data['semester-dataset'].gpas as (number | null)[][];
  const records = data['full-dataset'].records as unknown[];
  const entries = data['recommendation-dataset'].entries as unknown[];
  if (![rows, gpas, records, entries].every(Array.isArray) || rows.length !== gpas.length) throw new Error('工作台数据版本不一致。');
  const meta = data.dataset.meta as { asOf?: string };
  return { data, people: rows.length, semesterRecords: gpas.reduce((total, row) => total + row.filter(value => typeof value === 'number').length, 0), courseRecords: records.length, recommendations: entries.length, asOf: meta?.asOf || '' };
}
