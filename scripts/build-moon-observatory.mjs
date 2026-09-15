import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The source stays outside the website. Only the explicitly constructed aggregates
// below may be serialized; source objects and individual records are never copied.
const MIN_PEOPLE = 10;
const args = process.argv.slice(2);
const sourcePath = args.find((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--out');
const outputOption = args.indexOf('--out');
const checkOnly = args.includes('--check');
if (!sourcePath || (outputOption >= 0 && !args[outputOption + 1])) {
  console.error('Usage: node scripts/build-moon-observatory.mjs <private-source.html> [--out aggregate.json] [--check]');
  process.exit(1);
}
const outputPath = outputOption >= 0
  ? path.resolve(args[outputOption + 1])
  : fileURLToPath(new URL('../src/data/moon-observatory.json', import.meta.url));
assert.notEqual(path.resolve(sourcePath).toLowerCase(), outputPath.toLowerCase(), 'The source must never be overwritten');

const html = await readFile(sourcePath, 'utf8');
function dataset(id) {
  const match = html.match(new RegExp(`<script\\s+id="${id}"[^>]*>([\\s\\S]*?)<\\/script>`));
  assert.ok(match, `Missing required dataset: ${id}`);
  return JSON.parse(match[1]);
}
const D = dataset('dataset');
const SD = dataset('semester-dataset');
const CD = dataset('course-dataset');
const FD = dataset('full-dataset');
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
function quantile(sorted, probability) {
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower);
}
function stats(values) {
  assert.ok(values.length >= MIN_PEOPLE, 'A public statistics group is too small');
  assert.ok(values.every(finite), 'Non-numeric values must be removed before aggregation');
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: values.length,
    mean: round(mean(values)),
    median: round(quantile(sorted, 0.5)),
    q1: round(quantile(sorted, 0.25)),
    q3: round(quantile(sorted, 0.75)),
  };
}
function groupBy(rows, selector) {
  const map = new Map();
  for (const row of rows) {
    const key = selector(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

// Adjacent bins are combined, including zero-count tails. No residual count of
// 1–9 can be recovered by subtracting visible bins from their published total.
function distribution(values) {
  const boundaries = [0, 2, 2.5, 3, 3.5, 4, 5];
  const bins = boundaries.slice(0, -1).map((lower, index) => ({
    lower,
    upper: boundaries[index + 1],
    count: values.filter((value) => value >= lower && (index === boundaries.length - 2 ? value <= 5 : value < boundaries[index + 1])).length,
  }));
  const merged = [];
  let pending = null;
  for (const bin of bins) {
    pending = pending ? { lower: pending.lower, upper: bin.upper, count: pending.count + bin.count } : { ...bin };
    if (pending.count >= MIN_PEOPLE) {
      merged.push(pending);
      pending = null;
    }
  }
  if (pending) {
    assert.ok(merged.length, 'Distribution has insufficient people');
    merged.at(-1).upper = pending.upper;
    merged.at(-1).count += pending.count;
  }
  return merged.map(({ lower, upper, count }) => ({
    label: `${lower}–${upper}${upper === 5 ? '（含 5）' : '（不含右端）'}`,
    lower,
    upper,
    count,
  }));
}

assert.equal(D.rows.length, new Set(D.rows.map((row) => row[4])).size, 'Source contains duplicate people');
assert.equal(D.rows.length, SD.gpas.length, 'Semester rows do not align with overview rows');
assert.ok(D.rows.every((row) => finite(row[5]) && row[5] >= 0 && row[5] <= 5), 'Source GPA outside 0–5');
assert.ok(SD.gpas.every((row) => row.length === SD.terms.length), 'Semester columns do not align');
assert.ok(SD.gpas.flat().every((value) => value === null || (finite(value) && value >= 0 && value <= 5)), 'Semester GPA outside 0–5');
assert.equal(FD.students.length, new Set(FD.students.map((student) => student.id)).size, 'Duplicate transcript people');
assert.ok(FD.records.every((record) => record.score === null || (finite(record.score) && record.score >= 0 && record.score <= 100)), 'Course score outside 0–100');
for (const group of CD.groups) {
  assert.equal(group.students.length, new Set(group.students.map((student) => student.id)).size, 'Duplicate core-course people');
}
assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5, 'Even-sized median must interpolate');
assert.deepEqual(distribution([...Array(9).fill(0), ...Array(12).fill(4.5)]).map((bin) => bin.count), [21]);

const gpaStats = (rows) => stats(rows.map((row) => row[5]));
const years = D.years;
const cohortStats = (rows) => years.flatMap((year, index) => {
  const selected = rows.filter((row) => row[0] === index);
  return selected.length >= MIN_PEOPLE ? [{ year, ...gpaStats(selected) }] : [];
});
const aggregateGroups = (column, label, keyPrefix) => [...groupBy(D.rows, (row) => row[column])]
  .filter(([, rows]) => rows.length >= MIN_PEOPLE)
  .map(([index, rows]) => ({
    key: `${keyPrefix}-${index}`,
    name: label(index),
    ...(column === 2 ? { college: `college-${rows[0][1]}` } : {}),
    all: gpaStats(rows),
    cohorts: cohortStats(rows),
  }));

const visibleTerms = SD.terms.map((term, index) => ({ term, index }))
  .filter(({ term }) => Number(term.name.slice(0, 4)) >= 2022);
const courseGroups = CD.groups.map((group) => {
  const records = FD.records.filter((record) => FD.students[record.student].group === group.id);
  const graded = records.filter((record) => finite(record.score));
  const uniquePeople = (rows) => new Set(rows.map((row) => row.student)).size;
  const recordStats = (rows) => {
    const scored = rows.filter((row) => finite(row.score));
    assert.ok(uniquePeople(scored) >= MIN_PEOPLE, 'Course results require ten distinct graded people');
    const credits = scored.reduce((sum, row) => sum + row.credit, 0);
    return {
      people: uniquePeople(rows),
      recordCount: rows.length,
      scoredCount: scored.length,
      mean: round(mean(scored.map((row) => row.score))),
      median: round(quantile(scored.map((row) => row.score).sort((a, b) => a - b), 0.5)),
      weightedMean: credits > 0 ? round(scored.reduce((sum, row) => sum + row.score * row.credit, 0) / credits) : null,
    };
  };
  return {
    key: group.id,
    name: group.name,
    people: new Set(FD.students.filter((student) => student.group === group.id).map((student) => student.id)).size,
    recordCount: records.length,
    scoredCount: graded.length,
    academicYears: [...new Set(records.map((record) => record.year))].sort(),
    ...recordStats(records),
    core: group.courses.flatMap((course, index) => {
      const scores = group.students.map((student) => student.scores[index]?.value).filter(finite);
      if (scores.length < MIN_PEOPLE) return [];
      const summary = stats(scores);
      return [{
        key: `core-${index}`,
        name: course.name,
        people: scores.length,
        recordCount: group.students.length,
        scoredCount: scores.length,
        mean: summary.mean,
        median: summary.median,
        weightedMean: summary.mean,
        credit: course.credit,
        core: true,
      }];
    }),
    catalogue: [...groupBy(records, (record) => record.course)]
      .filter(([, rows]) => uniquePeople(rows.filter((row) => finite(row.score))) >= MIN_PEOPLE)
      .map(([index, rows]) => ({
        key: `course-${index}`,
        name: FD.courses[index],
        ...recordStats(rows),
        core: rows.some((row) => row.core),
      }))
      .sort((a, b) => b.people - a.people || a.name.localeCompare(b.name, 'zh')),
    terms: FD.terms.flatMap((term, index) => {
      const rows = records.filter((record) => record.term === index);
      if (uniquePeople(rows.filter((row) => finite(row.score))) < MIN_PEOPLE) return [];
      return [{ term: term.key, label: term.label, academicYear: term.academicYear, ...recordStats(rows) }];
    }),
  };
});

const output = {
  meta: {
    schemaVersion: 1,
    asOf: D.meta.asOf,
    minGroupSize: MIN_PEOPLE,
    studentCount: D.rows.length,
    cohortYears: years,
    collegeCount: D.colleges.length,
    sourceMajorCount: D.majors.length,
    semesterRecordCount: SD.gpas.flat().filter(finite).length,
    source: '东华大学本科教务数据的本地汇总；课程部分来自两份成绩单样本。',
    sampleNote: '课程部分仅含应用物理、光电各 20 人的成绩单样本；样本来自前 20 名资料，存在选择偏差，不能代表整个专业或用于比较教学质量。',
    methodology: [
      '累计绩点按每名学生等权汇总，范围为 0–5；系统返回的数值 0 保留，缺失学期不补 0。',
      '均值、四分位数与中位数四舍五入至两位小数；分位数按排序位置线性插值。未发布最高分、最低分及个人轨迹。',
      '年级指系统年级。不同年级的修读阶段和课程结构不同；学期曲线是各期有记录人群的汇总，不是同一组学生的成长曲线。',
      '学期趋势自 2022 秋展示；早年的零散记录未纳入图表。2026 秋资料尚未齐全，应结合每个点的人数判断覆盖情况。',
      '只有达到 10 人的统计组才公开。课程均分要求至少 10 名不同学生已有数值成绩；人数不足的课程或学期直接省略，不能将缺项解释为 0。',
      '绩点分布将相邻区间合并到至少 10 人，尾部不足 10 人并入前一区间；不同年级的区间边界可能不同。',
      '课程目录保留重复修读的每次成绩作为独立记录；未出分记录计入记录数，但不参与分数均值。课程人数为去重人数，记录数可能更大。',
      '课程普通均分按有分记录等权，学分加权均分为 Σ(成绩 × 学分) / Σ(有分记录学分)，均为百分制分数，不是绩点。',
      '核心十课采用原可视化中已经整理的计入成绩口径；完整课程目录使用原始成绩记录，二者可能存在口径差异。',
      '发布内容仅为预计算汇总，不含姓名、学号、逐人成绩或成绩单原文。汇总可以公开访问；彩蛋入口不承担身份验证。',
    ],
  },
  overview: {
    all: { ...gpaStats(D.rows), distribution: distribution(D.rows.map((row) => row[5])) },
    cohorts: years.map((year, index) => {
      const rows = D.rows.filter((row) => row[0] === index);
      return { year, ...gpaStats(rows), distribution: distribution(rows.map((row) => row[5])) };
    }),
  },
  semesters: {
    terms: visibleTerms.map(({ term }) => ({ key: term.name, label: term.label, current: term.current })),
    cohorts: years.map((year, yearIndex) => ({
      year,
      points: visibleTerms.flatMap(({ term, index }) => {
        const values = D.rows.flatMap((row, rowIndex) => row[0] === yearIndex && finite(SD.gpas[rowIndex][index]) ? [SD.gpas[rowIndex][index]] : []);
        return values.length >= MIN_PEOPLE ? [{ term: term.name, ...stats(values) }] : [];
      }),
    })),
  },
  colleges: aggregateGroups(1, (index) => D.colleges[index], 'college'),
  majors: aggregateGroups(2, (index) => D.majors[index].name, 'major'),
  courses: { groups: courseGroups },
};

// Privacy checks compare only in memory. Error messages contain no source values.
const serialized = JSON.stringify(output, null, 2) + '\n';
const identities = new Set([
  ...D.rows.flatMap((row) => [row[3], row[4]]),
  ...FD.students.flatMap((student) => [student.name, student.id]),
  ...CD.groups.flatMap((group) => group.students.flatMap((student) => [student.name, student.id])),
]);
const numericIdentities = [...identities].filter((value) => /^\d{6,}$/.test(value));
assert.ok(numericIdentities.every((identity) => !serialized.includes(identity)), 'An identifying number reached the output');
const forbiddenKeys = new Set(['rows', 'students', 'student', 'studentId', 'studentName', 'scores', 'gpas', 'raw', 'pages', 'pdfGpa', 'rank', 'flags']);
function inspect(value) {
  if (typeof value === 'string') {
    assert.ok(!identities.has(value), 'An identifying string reached the output');
    assert.ok(!/[A-Z]:[\\/]|xwechat_files|\.pdf/i.test(value), 'A private path or source filename reached the output');
  } else if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), 'Non-finite aggregate');
  } else if (Array.isArray(value)) {
    value.forEach(inspect);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      assert.ok(!forbiddenKeys.has(key), 'A record-level field reached the output');
      inspect(child);
    }
    if ('n' in value) assert.ok(value.n >= MIN_PEOPLE, 'An undersized GPA group reached the output');
    if ('people' in value) assert.ok(value.people >= MIN_PEOPLE, 'An undersized course group reached the output');
    if ('distribution' in value) {
      assert.equal(value.distribution.reduce((sum, bin) => sum + bin.count, 0), value.n, 'Histogram must conserve population');
      assert.ok(value.distribution.every((bin) => bin.count >= MIN_PEOPLE), 'An undersized histogram bin reached the output');
    }
  }
}
inspect(output);
assert.equal(output.overview.cohorts.reduce((sum, cohort) => sum + cohort.n, 0), output.meta.studentCount);
assert.equal(output.meta.semesterRecordCount, SD.meta.records);
assert.equal(output.courses.groups.reduce((sum, group) => sum + group.recordCount, 0), FD.meta.records);
assert.equal(output.courses.groups.reduce((sum, group) => sum + group.scoredCount, 0), FD.meta.graded);

if (checkOnly) {
  assert.equal(await readFile(outputPath, 'utf8'), serialized, 'Generated aggregates differ from the checked-in file');
} else {
  await writeFile(outputPath, serialized, 'utf8');
}
console.log(JSON.stringify({
  status: checkOnly ? 'verified' : 'generated',
  people: output.meta.studentCount,
  cohorts: output.overview.cohorts.length,
  collegeGroups: output.colleges.length,
  majorGroups: output.majors.length,
  semesterPoints: output.semesters.cohorts.reduce((sum, cohort) => sum + cohort.points.length, 0),
  courseGroups: output.courses.groups.map((group) => ({ key: group.key, people: group.people, publicCourses: group.catalogue.length, coreCourses: group.core.length })),
  privacy: 'No identifying strings or numbers, individual records, private paths, undersized statistics groups or histogram bins.',
  bytes: Buffer.byteLength(serialized),
}, null, 2));
