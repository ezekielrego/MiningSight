import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
const root = await mkdtemp(path.join(tmpdir(), 'miningsight-edit-api-'));
const source = process.cwd(), db = path.join(root, 'test.sqlite');
const database = (operation, payload) => JSON.parse(execFileSync('python3', [path.join(source, 'server/database.py'), db, operation, JSON.stringify(payload)], { encoding: 'utf8' }));
let server;
try {
  const owner = database('register', { username: 'editowner', password: 'isolated-test-password' });
  const other = database('register', { username: 'otherowner', password: 'isolated-test-password' });
  database('create_project', { token: owner.token, projectId: 'project_edits', projectName: 'Test', projectData: {} });
  database('add_asset', { token: owner.token, projectId: 'project_edits', id: 'asset_test', name: 'Test.glb', storedName: 'test.glb', kind: 'model', size: 10 });
  const mock = path.join(root, 'mock-provider.mjs');
  await writeFile(mock, `export class GoogleGenAI { constructor() { this.models = { generateContent: async ({contents}) => { const { assetId, guidance, parts } = JSON.parse(contents); if (guidance === 'ambiguous') return {text: JSON.stringify({clarification:'Which panel?'})}; return {text:JSON.stringify({version:1,assetId,guidance,operations:[{type:'hide',targetId:guidance === 'invalid' ? 'imported:other/0' : parts.find(part=>part.name==='Panel').id}]})}; } }; } }`);
  const bundle = path.join(root, 'server.cjs');
  await build({ entryPoints: ['server.ts'], outfile: bundle, bundle: true, platform: 'node', format: 'cjs', target: 'node20', external: ['vite'], alias: { '@google/genai': mock }, logLevel: 'silent' });
  const socket = createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve)); const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const start = async key => {
    server = spawn(process.execPath, [bundle], { cwd: root, env: { ...process.env, NODE_ENV: 'production', PORT: String(port), GEMINI_API_KEY: key, MININGSIGHT_DATABASE_FILE: db, MININGSIGHT_DATABASE_SCRIPT: path.join(source, 'server/database.py'), MININGSIGHT_PROJECTS_DIR: path.join(root, 'projects') }, stdio: 'ignore' });
    for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${port}/api/health`); return; } catch { await new Promise(resolve => setTimeout(resolve, 100)); } }
    throw new Error('Isolated server did not start');
  };
  const stop = () => new Promise(resolve => { server.once('exit', resolve); server.kill(); });
  const part = (id, name, locked = false) => ({ id, name, locked, visible: true, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } });
  const body = { projectId: 'project_edits', assetId: 'asset_test', guidance: 'Hide Panel', objects: [part('imported:asset_test', 'Root'), part('imported:asset_test/0', 'Panel')] };
  const call = (token, changes = {}) => fetch(`http://127.0.0.1:${port}/api/reconstruction/ai/model-edit-proposal`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...body, ...changes }) });
  await start('');
  assert.equal((await call('invalid')).status, 401);
  assert.equal((await call(other.token)).status, 404);
  assert.equal((await call(owner.token, { assetId: 'someone-elses-asset' })).status, 404);
  assert.equal((await call(owner.token, { objects: [part('imported:other', 'Wrong')] })).status, 400);
  assert.equal((await call(owner.token)).status, 428);
  await stop(); await start('isolated-mock-key');
  const response = await call(owner.token); assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).modelEditProposal.operations, [{ type: 'hide', targetId: 'imported:asset_test/0' }]);
  assert.equal((await call(owner.token, { guidance: 'invalid' })).status, 400);
  assert.equal((await call(owner.token, { objects: [part('imported:asset_test', 'Root', true), part('imported:asset_test/0', 'Panel')] })).status, 400);
  assert.equal((await (await call(owner.token, { guidance: 'ambiguous' })).json()).clarification, 'Which panel?');
  assert.deepEqual(database('get_project', { token: owner.token, projectId: 'project_edits' }).project.objects, undefined, 'proposing must not save any edits');
  await stop(); server = null;
  console.log('PASS: model-edit API authentication, owner isolation, asset scope, context validation, missing key, mock provider proposal, invalid/locked targets, clarification, and no project mutation. No external provider requests.');
} finally { if (server && server.exitCode === null) server.kill(); await rm(root, { recursive: true, force: true }); }
