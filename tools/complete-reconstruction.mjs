// Run only after the requested geometry has been built, verified and deployed.
// node tools/complete-reconstruction.mjs <archive-root> <request-id> <result-json>
import { readFile, readdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
const [root, id, resultFile] = process.argv.slice(2);
if (!root || !/^[a-f0-9-]{36}$/.test(id || '') || !resultFile) throw Error('Usage: node tools/complete-reconstruction.mjs <archive-root> <request-id> <result-json>');
let directory;
for (const owner of await readdir(root)) {
  const candidate = path.join(root, owner, id);
  try { const request = JSON.parse(await readFile(path.join(candidate, 'request.json'), 'utf8')); if (request.id === id) directory = candidate; } catch {}
}
if (!directory) throw Error('Request not found');
const result = JSON.parse(await readFile(resultFile, 'utf8'));
if (!result.presetId && !result.data?.procedural3DParams) throw Error('Result requires a deployed presetId or data.procedural3DParams');
const output = { ...result, provider: 'assisted', status: 'completed', updatedAt: new Date().toISOString() };
await writeFile(path.join(directory, 'result.json.tmp'), JSON.stringify(output, null, 2), { mode: 0o600 });
await rename(path.join(directory, 'result.json.tmp'), path.join(directory, 'result.json'));
console.log(`Completed assisted request ${id}`);
