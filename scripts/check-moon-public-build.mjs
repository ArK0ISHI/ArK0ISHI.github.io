import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
for (const privatePath of ['src/data/moon-workbench.json','src/data/moon-observatory.json']) {
try { await access(path.join(root, privatePath)); throw new Error('Complete workbench data must remain outside the repository'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const blocks = ['dataset','semester-dataset','course-dataset','full-dataset','recommendation-dataset'];
async function scan(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) { await scan(file); continue; }
    if (/^\.dev\.vars|\.bundle$|(?:workbench|overview)-v1\.json$/.test(item.name)) throw new Error('Private material in public output: ' + path.relative(root,file));
    if (!/\.(?:js|json|html|map|txt)$/i.test(item.name)) continue;
    const text = await readFile(file,'utf8');
    const normalized = text.replaceAll('\\"','"');
    if (normalized.includes('cohortYears') && normalized.includes('sampleNote') && /(?:"asOf"|\basOf)\s*:\s*["']\d{4}[.\-]\d{2}[.\-]\d{2}/.test(normalized)) throw new Error('Moon overview data detected in public output: ' + path.relative(root,file));
    if (blocks.every(id=>normalized.includes(id)) && /(?:"rows"|\brows)\s*:\s*\[\s*\[/.test(normalized)) throw new Error('Complete dataset detected in public output: ' + path.relative(root,file));
  }
}
await scan(path.join(root,'dist'));
console.log('Public build check passed: no complete workbench dataset or private deployment files.');
