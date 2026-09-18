import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

// Complete datasets are generated outside the repository for private backend upload.
// Preserve every field and row. This generator never evaluates source HTML,
// changes the original file, aggregates records, or prints personal values.
const DATASET_IDS = ['dataset', 'semester-dataset', 'course-dataset', 'full-dataset', 'recommendation-dataset'];
const args = process.argv.slice(2);
const sourcePath = args.find((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--out');
const outputIndex = args.indexOf('--out');
const checkOnly = args.includes('--check');
if (!sourcePath || (outputIndex >= 0 && !args[outputIndex + 1])) {
  console.error('Usage: node scripts/build-moon-workbench-data.mjs <source.html> [--out data.json] [--check]');
  process.exit(1);
}
const outputPath = outputIndex >= 0
  ? path.resolve(args[outputIndex + 1])
  : fileURLToPath(new URL('../../moon-private/workbench-v1.json', import.meta.url));
const repositoryPath = fileURLToPath(new URL('../', import.meta.url));
const relativeOutput = path.relative(repositoryPath, outputPath);
assert.ok(relativeOutput.startsWith('..' + path.sep) || path.isAbsolute(relativeOutput), 'Complete data must be written outside the website repository');
assert.notEqual(path.resolve(sourcePath).toLowerCase(), outputPath.toLowerCase(), 'The source must never be overwritten');

function parseJson(text, label) {
  try { return JSON.parse(text); }
  catch { throw new Error(`${label} is not valid JSON; no source values were printed`); }
}

const source = await readFile(sourcePath, 'utf8');
const extracted = new Map();
for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
  const attributes = match[1];
  const id = /\bid\s*=\s*(["'])([^"']+)\1/i.exec(attributes)?.[2];
  const type = /\btype\s*=\s*(["'])([^"']+)\1/i.exec(attributes)?.[2];
  if (!DATASET_IDS.includes(id) && type !== 'application/json') continue;
  assert.ok(DATASET_IDS.includes(id), 'An unexpected JSON block requires explicit review');
  assert.equal(type, 'application/json', 'A required block has an unexpected script type');
  assert.ok(!/\bsrc\s*=/i.test(attributes), 'Dataset blocks must contain inline JSON');
  assert.ok(!extracted.has(id), 'Duplicate dataset blocks are not allowed');
  const parsed = parseJson(match[2], 'A source dataset');
  assert.ok(parsed && typeof parsed === 'object' && !Array.isArray(parsed), 'Each dataset must be an object');
  extracted.set(id, parsed);
}
assert.equal(extracted.size, DATASET_IDS.length, 'All five original datasets are required');
assert.ok(DATASET_IDS.every((id) => extracted.has(id)), 'A required dataset block is missing');
const data = Object.fromEntries(DATASET_IDS.map((id) => [id, extracted.get(id)]));
const D = data.dataset;
const SD = data['semester-dataset'];
const CD = data['course-dataset'];
const FD = data['full-dataset'];
const RD = data['recommendation-dataset'];

function nonemptyArray(value, label) {
  assert.ok(Array.isArray(value) && value.length > 0, `${label} must be a nonempty array`);
  return value;
}
nonemptyArray(D.rows, 'Overview rows');
nonemptyArray(D.years, 'Overview years');
nonemptyArray(D.colleges, 'Overview colleges');
nonemptyArray(D.majors, 'Overview majors');
nonemptyArray(SD.gpas, 'Semester trajectories');
nonemptyArray(SD.terms, 'Semester terms');
assert.equal(D.rows.length, SD.gpas.length, 'Overview and semester people must align');
assert.ok(D.rows.every((row) => Array.isArray(row) && row.length >= 8), 'Overview row structure is incomplete');
assert.ok(SD.gpas.every((row) => Array.isArray(row) && row.length === SD.terms.length), 'Semester columns must align with term metadata');
nonemptyArray(CD.groups, 'Core-course groups');
for (const group of CD.groups) {
  nonemptyArray(group.students, 'Core-course people');
  nonemptyArray(group.courses, 'Core-course subjects');
  assert.ok(group.students.every((student) => Array.isArray(student.scores) && student.scores.length === group.courses.length), 'Core-course scores must align with subjects');
}
nonemptyArray(FD.students, 'Full-transcript people');
nonemptyArray(FD.records, 'Full-transcript records');
nonemptyArray(FD.courses, 'Full-transcript courses');
nonemptyArray(FD.terms, 'Full-transcript terms');
nonemptyArray(FD.years, 'Full-transcript years');
assert.ok(FD.records.every((record) => Number.isInteger(record.student) && record.student >= 0 && record.student < FD.students.length && Number.isInteger(record.course) && record.course >= 0 && record.course < FD.courses.length), 'A transcript record has an invalid person or course reference');
nonemptyArray(RD.entries, 'Recommendation entries');
assert.ok(Array.isArray(RD.aliases), 'Recommendation aliases must be retained as an array');
assert.ok(RD.meta && typeof RD.meta === 'object' && !Array.isArray(RD.meta), 'Recommendation source metadata is required');
assert.ok(RD.entries.every((entry) => entry && typeof entry === 'object'), 'Recommendation entry structure is incomplete');
assert.ok(RD.entries.every((entry) => !['exact', 'alias'].includes(entry.status) || (Number.isInteger(entry.rowIndex) && entry.rowIndex >= 0 && entry.rowIndex < D.rows.length)), 'A matched recommendation entry has an invalid overview reference');

const serialized = `${JSON.stringify(data)}\n`;
assert.ok(isDeepStrictEqual(parseJson(serialized, 'Serialized output'), data), 'Serialization changed the source data');
if (!checkOnly) { await mkdir(path.dirname(outputPath), { recursive: true }); await writeFile(outputPath, serialized, 'utf8'); }
const actualText = await readFile(outputPath, 'utf8');
const actual = parseJson(actualText, 'Published data');
assert.ok(isDeepStrictEqual(Object.keys(actual), DATASET_IDS), 'Published data must contain exactly the five original blocks');
for (const id of DATASET_IDS) {
  // Do not pass original objects to assert.deepEqual: its failure diff could
  // expose records in logs. Comparing the boolean preserves quiet verification.
  assert.ok(isDeepStrictEqual(actual[id], extracted.get(id)), 'A published data block differs from its complete original');
}
assert.ok(isDeepStrictEqual(actual, data), 'Published data does not exactly match the source');

console.log(JSON.stringify({
  status: checkOnly ? 'verified' : 'written',
  completeOriginalBlocks: DATASET_IDS.length,
  deepEqualityVerified: true,
  people: D.rows.length,
  cohorts: D.years.length,
  colleges: D.colleges.length,
  majors: D.majors.length,
  semesterTerms: SD.terms.length,
  semesterRecords: SD.gpas.reduce((sum, row) => sum + row.filter((value) => typeof value === 'number').length, 0),
  coreCourseGroups: CD.groups.length,
  coreCoursePeople: CD.groups.reduce((sum, group) => sum + group.students.length, 0),
  coreCourseScores: CD.groups.reduce((sum, group) => sum + group.students.reduce((count, student) => count + student.scores.length, 0), 0),
  fullTranscriptPeople: FD.students.length,
  fullTranscriptCourses: FD.courses.length,
  fullTranscriptRecords: FD.records.length,
  recommendationEntries: RD.entries.length,
  recommendationAliases: RD.aliases.length,
  recommendationMatchedEntries: RD.entries.filter((entry) => ['exact', 'alias'].includes(entry.status)).length,
  bytes: Buffer.byteLength(actualText),
}));
