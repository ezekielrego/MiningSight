// Run: node tools/test-desktop-auth.mjs [--server-bundle /path/to/server.cjs]
// With no bundle argument, build the current server using the installed esbuild.
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const usage = 'node tools/test-desktop-auth.mjs [--server-bundle /path/to/server.cjs]';
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log(usage);
  process.exit(0);
}
if (args.length && (args.length !== 2 || args[0] !== '--server-bundle' || !args[1])) {
  throw new Error(`Usage: ${usage}`);
}
const suppliedBundle = args[1] || process.env.MININGSIGHT_TEST_SERVER_BUNDLE;
const checkout = fileURLToPath(new URL('../', import.meta.url));
const exec = promisify(execFile);

async function fixtureBundle(directory) {
  const output = path.join(directory, 'server.cjs');
  let source;
  if (suppliedBundle) {
    source = await readFile(path.resolve(suppliedBundle), 'utf8');
  } else {
    const { build } = await import('esbuild');
    const result = await build({
      absWorkingDir: checkout,
      entryPoints: ['server.ts'],
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'cjs',
      external: ['vite'],
      write: false,
      logLevel: 'silent',
    });
    source = result.outputFiles[0].text;
  }
  // Patch only the fixture's listener and startup notification. Auth handlers stay intact.
  // Port 0 lets the OS reserve a random free port atomically; IPC reports the actual port.
  const listener = /app\.listen\(\s*port\s*,\s*(['"])0\.0\.0\.0\1\s*,\s*\(\)\s*=>\s*\{/g;
  assert.equal([...source.matchAll(listener)].length, 1, 'Expected exactly one server listener; refusing an unknown bundle');
  source = source.replace(listener, `app.listen(port, '127.0.0.1', function () {
    process.send({ type: 'desktop-auth-test-ready', port: this.address().port });`);
  await writeFile(output, source, { mode: 0o600 });
  return output;
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}

function readyPort(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('Fixture server did not become ready within 15 seconds')), 15_000);
    const onExit = () => finish(new Error('Fixture server exited before becoming ready'));
    const onError = () => finish(new Error('Fixture server could not start'));
    const onMessage = (message) => {
      if (message?.type === 'desktop-auth-test-ready' && Number.isInteger(message.port) && message.port > 0 && message.port <= 65535) {
        finish(null, message.port);
      }
    };
    function finish(error, port) {
      clearTimeout(timer);
      child.off('exit', onExit);
      child.off('error', onError);
      child.off('message', onMessage);
      if (error) reject(error);
      else resolve(port);
    }
    child.once('exit', onExit);
    child.once('error', onError);
    child.on('message', onMessage);
  });
}

test('desktop browser auth handoff against the actual server and isolated SQLite', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tunnelsight-auth-test-'));
  let child;
  try {
    const bundle = await fixtureBundle(directory);
    const databaseScript = path.join(checkout, 'server/database.py');
    const databaseFile = path.join(directory, 'fixture.sqlite3');
    // Deliberately do not inherit account credentials, NODE_OPTIONS, proxy settings, or .env.
    // A nonempty dummy RTMP password also bypasses the server's real media-config read.
    const env = {
      PATH: process.env.PATH || '/usr/bin:/bin',
      NODE_ENV: 'production',
      NODE_PATH: path.join(checkout, 'node_modules'),
      PORT: '0',
      MININGSIGHT_DATABASE_FILE: databaseFile,
      MININGSIGHT_DATABASE_SCRIPT: databaseScript,
      MININGSIGHT_PROJECTS_DIR: path.join(directory, 'projects'),
      MININGSIGHT_DROP_UPLOAD_DIR: path.join(directory, 'uploads'),
      MININGSIGHT_BRIDGE_LOG_DIR: path.join(directory, 'bridge-logs'),
      MININGSIGHT_RTMP_PUBLISH_PASSWORD: 'isolated-test-no-media-access',
    };
    // Create synthetic identity directly in the temporary DB; no Google/network login.
    let fixture;
    try {
      const result = await exec('python3', [databaseScript, databaseFile, 'google_login', JSON.stringify({
        googleSub: `desktop-auth-test-${randomBytes(12).toString('hex')}`,
        email: 'desktop-auth-fixture@example.test',
        displayName: 'Desktop auth integration fixture',
      })], { cwd: directory, env, timeout: 10_000, maxBuffer: 1024 * 1024 });
      fixture = JSON.parse(result.stdout);
    } catch {
      // Child-process errors can contain argv/stdout; never print fixture session tokens.
      throw new Error('Could not create the isolated fixture account');
    }
    assert.ok(fixture.ok && typeof fixture.token === 'string' && fixture.user?.id, 'Fixture account created');

    child = spawn(process.execPath, [bundle], {
      cwd: directory,
      env,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    const port = await readyPort(child);
    const origin = `http://127.0.0.1:${port}`;
    async function call(endpoint, { body, token } = {}) {
      const response = await fetch(`${origin}${endpoint}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(5000),
        redirect: 'error',
      });
      if (endpoint.startsWith('/api/desktop/auth/')) {
        assert.equal(response.headers.get('cache-control'), 'no-store');
      }
      return { status: response.status, data: await response.json() };
    }
    const auth = (action, body, token) => call(`/api/desktop/auth/${action}`, { body, token });
    const me = (token) => call('/api/ai/auth/me', { token });
    const rejected = (result, status, error) => {
      assert.equal(result.status, status);
      assert.equal(result.data.success, false);
      assert.equal(result.data.error, error);
      assert.ok(!('token' in result.data) && !('user' in result.data), 'Rejected requests must not reveal session data');
    };
    let pollBody, approvalBody, desktopToken;

    await t.test('start returns independent secrets, hash-only approval URL, and five-minute ISO expiry', async () => {
      assert.equal((await me(fixture.token)).status, 200);
      const before = Date.now();
      const result = await auth('start', {});
      assert.equal(result.status, 200);
      const data = result.data;
      assert.deepEqual(Object.keys(data).sort(), ['approvalUrl', 'expiresAt', 'pollSecret', 'requestId', 'success']);
      assert.equal(data.success, true);
      assert.ok(/^[a-f0-9]{48}$/.test(data.requestId));
      assert.ok(/^[a-f0-9]{64}$/.test(data.pollSecret));
      const url = new URL(data.approvalUrl);
      assert.equal(url.origin, 'https://tunnelsight.applications.co.zw');
      assert.equal(url.pathname, '/desktop/connect.html');
      assert.equal(url.search, '');
      const fragment = new URLSearchParams(url.hash.slice(1));
      const approvalSecret = fragment.get('key');
      assert.ok(fragment.get('id') === data.requestId);
      assert.ok(/^[a-f0-9]{64}$/.test(approvalSecret));
      assert.ok(approvalSecret !== data.pollSecret, 'Polling and approval secrets differ');
      assert.ok(!data.approvalUrl.includes(data.pollSecret), 'Approval URL cannot poll');
      const expiresAt = Date.parse(data.expiresAt);
      assert.ok(Number.isFinite(expiresAt) && new Date(expiresAt).toISOString() === data.expiresAt);
      assert.ok(expiresAt >= before + 300_000 && expiresAt <= Date.now() + 300_000);
      pollBody = { requestId: data.requestId, pollSecret: data.pollSecret };
      approvalBody = { requestId: data.requestId, approvalSecret };
    });

    await t.test('pending requests reject incorrect/swapped secrets and unauthenticated approval', async () => {
      assert.deepEqual((await auth('poll', pollBody)).data, { success: true, status: 'pending' });
      for (const pollSecret of [randomBytes(32).toString('hex'), approvalBody.approvalSecret, null, []]) {
        rejected(await auth('poll', { ...pollBody, pollSecret }), 404, 'DESKTOP_AUTH_INVALID_OR_EXPIRED');
      }
      for (const approvalSecret of [randomBytes(32).toString('hex'), pollBody.pollSecret]) {
        rejected(await auth('approve', { ...approvalBody, approvalSecret }, fixture.token), 404, 'DESKTOP_AUTH_INVALID_OR_EXPIRED');
      }
      rejected(await auth('approve', approvalBody), 401, 'AUTH_REQUIRED');
      rejected(await auth('approve', approvalBody, 'invalid-fixture-session'), 401, 'AUTH_REQUIRED');
      // Checking the web account and failed approvals must leave the handoff pending.
      assert.equal((await me(fixture.token)).status, 200);
      assert.deepEqual((await auth('poll', pollBody)).data, { success: true, status: 'pending' });
    });

    await t.test('explicit approval returns no token to browser and refuses duplicate approval', async () => {
      const result = await auth('approve', approvalBody, fixture.token);
      assert.equal(result.status, 200);
      assert.deepEqual(result.data, { success: true, status: 'approved' });
      rejected(await auth('approve', approvalBody, fixture.token), 409, 'DESKTOP_AUTH_ALREADY_APPROVED');
      rejected(await auth('poll', { ...pollBody, pollSecret: approvalBody.approvalSecret }), 404, 'DESKTOP_AUTH_INVALID_OR_EXPIRED');
    });

    await t.test('concurrent polls deliver a fresh desktop session exactly once', async () => {
      const results = await Promise.all([auth('poll', pollBody), auth('poll', pollBody)]);
      assert.deepEqual(results.map((result) => result.status).sort(), [200, 404]);
      const accepted = results.find((result) => result.status === 200).data;
      assert.equal(accepted.success, true);
      assert.equal(accepted.status, 'approved');
      assert.ok(typeof accepted.token === 'string' && accepted.token.length > 32);
      assert.ok(accepted.token !== fixture.token, 'Desktop token must be distinct from web token');
      assert.ok(accepted.user.id === fixture.user.id && accepted.user.email === fixture.user.email);
      desktopToken = accepted.token;
      rejected(results.find((result) => result.status === 404), 404, 'DESKTOP_AUTH_INVALID_OR_EXPIRED');
      rejected(await auth('poll', pollBody), 404, 'DESKTOP_AUTH_INVALID_OR_EXPIRED');
      rejected(await auth('approve', approvalBody, fixture.token), 404, 'DESKTOP_AUTH_INVALID_OR_EXPIRED');
      assert.equal((await me(desktopToken)).status, 200);
    });

    await t.test('desktop logout invalidates only the desktop session', async () => {
      const logout = await call('/api/ai/auth/logout', { body: {}, token: desktopToken });
      assert.equal(logout.status, 200);
      assert.equal(logout.data.success, true);
      rejected(await me(desktopToken), 401, 'AUTH_REQUIRED');
      const web = await me(fixture.token);
      assert.equal(web.status, 200);
      assert.ok(web.data.success && web.data.user.id === fixture.user.id, 'Original browser session remains valid');
    });
  } finally {
    try { await stopChild(child); }
    finally { await rm(directory, { recursive: true, force: true }); }
  }
});
