import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
const root = await mkdtemp(path.join(tmpdir(), 'miningsight-public-test-'));
const source = process.cwd(), db = path.join(root, 'test.sqlite');
const database = (operation, payload) => JSON.parse(execFileSync('python3', [path.join(source, 'server/database.py'), db, operation, JSON.stringify(payload)], { encoding: 'utf8' }));
let server;
try {
  const owner = database('register', { username: 'publicowner', password: 'isolated-test-password' });
  const other = database('register', { username: 'otherowner', password: 'isolated-test-password' });
  for (const id of ['project_shared', 'project_private']) {
    database('create_project', { token: owner.token, projectId: id, projectName: id, projectData: { objects: [], materials: [], ownerId: owner.user.id, apiKey: 'never-public', reconstructionBrief: { image: 'private-input-not-published', mapGeometry: { name: 'Public map' } }, assets: [{ url: '/private?access_token=secret' }] } });
    database('add_asset', { token: owner.token, projectId: id, id: `asset_${id}`, name: 'test.glb', storedName: 'test.glb', kind: 'model', size: 10 });
    await mkdir(path.join(root, 'projects', id, 'assets'), { recursive: true });
    await writeFile(path.join(root, 'projects', id, 'assets', 'test.glb'), 'glTF-test!');
  }
  const socket = createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve)); const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const bundle = path.join(root, 'server.cjs');
  await build({ entryPoints: ['server.ts'], outfile: bundle, bundle: true, platform: 'node', format: 'cjs', target: 'node20', external: ['vite'], logLevel: 'silent' });
  server = spawn(process.execPath, [bundle], { cwd: root, env: { ...process.env, NODE_ENV: 'production', PORT: String(port), GEMINI_API_KEY: '', MININGSIGHT_DATABASE_FILE: db, MININGSIGHT_DATABASE_SCRIPT: path.join(source, 'server/database.py'), MININGSIGHT_PROJECTS_DIR: path.join(root, 'projects') }, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) { try { await fetch(base + '/api/health'); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); } }
  const get = suffix => fetch(base + '/api/ai/public/projects' + suffix);
  const share = (token, value) => fetch(base + '/api/ai/projects/project_shared/public', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ public: value }) });
  assert.deepEqual((await (await get('')).json()).projects, []);
  assert.equal((await get('/project_shared')).status, 404);
  assert.equal((await get('/project_shared/assets/asset_project_shared')).status, 404);
  assert.equal((await share('invalid', true)).status, 401);
  assert.equal((await share(other.token, true)).status, 404);
  assert.equal((await share(owner.token, true)).status, 200);
  const list = (await (await get('')).json()).projects;
  assert.equal(list.length, 1); assert.equal(list[0].public, true); assert.equal(list[0].id, 'public_project_shared');
  const response = await get('/project_shared'); assert.equal(response.status, 200);
  const project = (await response.json()).project;
  assert.equal(project.projectId, 'public_project_shared'); assert.equal(project.readOnly, true);
  assert.equal(project.ownerId, undefined); assert.equal(project.apiKey, undefined); assert.equal(project.reconstructionBrief.image, undefined);
  assert.equal(project.reconstructionBrief.mapGeometry.name, 'Public map');
  assert.equal(JSON.stringify(project).includes('access_token'), false);
  assert.equal(project.assets[0].storedName, undefined);
  assert.equal(await (await fetch(base + project.assets[0].url)).text(), 'glTF-test!');
  const range = await fetch(base + project.assets[0].url, { headers: { Range: 'bytes=0-3' } }); assert.equal(range.status, 206); assert.equal(await range.text(), 'glTF');
  assert.equal((await get('/project_private')).status, 404);
  assert.equal((await get('/project_shared/assets/asset_project_private')).status, 404);
  assert.equal((await fetch(base + '/api/ai/projects/project_shared')).status, 401, 'private owner endpoint remains authenticated');
  assert.equal((await fetch(base + '/api/ai/public/projects/project_shared', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"projectName":"Hacked"}' })).status, 404);
  assert.equal(database('get_project', { token: owner.token, projectId: 'project_shared' }).project.projectName, 'project_shared');
  assert.equal((await share(owner.token, false)).status, 200);
  assert.equal((await get('/project_shared')).status, 404); assert.equal((await get('/project_shared/assets/asset_project_shared')).status, 404);
  console.log('PASS: public projects default private; owner-only publishing; anonymous listing, model reads and ranges; token-free metadata; private/cross-project isolation; no anonymous writes; revocation.');
} finally { if (server && server.exitCode === null) { const stopped = new Promise(resolve => server.once('exit', resolve)); server.kill(); await stopped; } await rm(root, { recursive: true, force: true }); }
