import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// This is a build-time extraction from a trusted, locally held dashboard. The
// public result contains its UI and calculation code, never its dataset bodies.
// Do not use an imported visitor's HTML to supply scripts or markup at runtime.
const args = process.argv.slice(2);
const sourcePath = args.find((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--out');
const outputIndex = args.indexOf('--out');
const checkOnly = args.includes('--check');
if (!sourcePath || (outputIndex >= 0 && !args[outputIndex + 1])) {
  console.error('Usage: node scripts/build-moon-workbench.mjs <private-source.html> [--out template.html] [--check]');
  process.exit(1);
}
const outputPath = outputIndex >= 0
  ? path.resolve(args[outputIndex + 1])
  : fileURLToPath(new URL('../src/data/moon-workbench-template.html', import.meta.url));
assert.notEqual(path.resolve(sourcePath).toLowerCase(), outputPath.toLowerCase(), 'The source must never be overwritten');

const tokens = new Map([
  ['dataset', '__MOON_DATASET__'],
  ['semester-dataset', '__MOON_SEMESTER_DATASET__'],
  ['course-dataset', '__MOON_COURSE_DATASET__'],
  ['full-dataset', '__MOON_FULL_DATASET__'],
  ['recommendation-dataset', '__MOON_RECOMMENDATION_DATASET__'],
]);
const expectedViews = [
  'overview', 'recommendation', 'trends', 'changes', 'trajectories', 'colleges',
  'majors', 'allcourses', 'courses', 'students', 'method',
];
const source = await readFile(sourcePath, 'utf8');
const datasets = new Map();
let executableScripts = 0;
const template = source.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (element, attributes, body) => {
  const type = attributes.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1];
  assert.ok(!/\bsrc\s*=/i.test(attributes), 'An external script was found; review the source before extraction');
  if (type !== 'application/json') {
    executableScripts += 1;
    return element;
  }
  const id = attributes.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1];
  assert.ok(tokens.has(id), 'An unexpected data block requires explicit review');
  assert.ok(!datasets.has(id), 'Duplicate data blocks are not allowed');
  assert.ok(!source.includes(tokens.get(id)), 'The source already contains a template token');
  datasets.set(id, JSON.parse(body));
  return `<script${attributes}>${tokens.get(id)}</script>`;
});

assert.equal(datasets.size, tokens.size, 'All five datasets must be found and removed');
assert.equal(executableScripts, 7, 'The dashboard script layout changed; review extraction before publishing');
for (const [id, token] of tokens) {
  assert.equal(template.split(token).length - 1, 1, 'Each data token must appear exactly once');
  assert.match(template, new RegExp(`<script\\b[^>]*\\bid=["']${id}["'][^>]*>${token}<\\/script>`));
}
for (const view of expectedViews) {
  assert.ok(template.includes(`data-view="${view}"`), 'A dashboard navigation item is missing');
  assert.ok(template.includes(`id="${view}"`), 'A dashboard section is missing');
}
const actualViews = [...template.matchAll(/<button\b[^>]*\bdata-view="([^"]+)"[^>]*>/g)].map((match) => match[1]);
assert.ok(actualViews.length === expectedViews.length && actualViews.every((view, index) => view === expectedViews[index]), 'The dashboard navigation changed; review every view before publishing');

// Verify the remaining static document against identities in every dataset.
// Report no matching values: a failed check must not expose records in logs.
const D = datasets.get('dataset');
const CD = datasets.get('course-dataset');
const FD = datasets.get('full-dataset');
const RD = datasets.get('recommendation-dataset');
assert.ok(Array.isArray(D.rows) && Array.isArray(CD.groups) && Array.isArray(FD.students));
const people = [
  ...D.rows.map((row) => ({ name: row[3], id: row[4] })),
  ...CD.groups.flatMap((group) => group.students),
  ...FD.students,
];
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function privateValuesRemain(values) {
  const unique = [...new Set(values.filter((value) => typeof value === 'string' && value.length > 0))];
  return unique.length > 0 && new RegExp(unique.map(escapeRegExp).join('|'), 'u').test(template);
}
assert.ok(!privateValuesRemain(people.map((person) => String(person.id))), 'An individual identifier remains outside the stripped datasets');
assert.ok(!privateValuesRemain(FD.students.map((student) => student.source)), 'A private source filename remains outside the stripped datasets');
// A common noun in curriculum descriptions also happens to match one name in
// this source. Keep the ordinary static label; it contains no identity context.
const staticVocabulary = new Set(['方向']);
assert.ok(!privateValuesRemain([...people.map((person) => person.name), ...RD.entries.map((entry) => entry.name)].filter((name) => !staticVocabulary.has(name))), 'A personal name remains outside the stripped datasets');
assert.ok(!/(?:["'\s])[A-Za-z]:[\\/]|file:\/\//.test(template), 'A local filesystem path remains in the template');

if (checkOnly) {
  assert.equal(await readFile(outputPath, 'utf8'), template, 'The checked-in dashboard template is out of date');
} else {
  await writeFile(outputPath, template, 'utf8');
}
console.log(JSON.stringify({
  status: checkOnly ? 'verified' : 'written',
  views: expectedViews.length,
  dataPlaceholders: datasets.size,
  executableScripts,
  bytes: Buffer.byteLength(template),
  personalRecordsEmbedded: false,
}));
