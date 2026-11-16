'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');

const source = fs.readFileSync(path.join(__dirname, 'bridge.cjs'), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));
const drain = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const LINK = {
  success: true,
  publishUrl: 'rtmp://5.189.146.229:1935/dji/test?user=laptop_test&pass=PRIVATE_TEST_PASSWORD',
  playbackUrl: 'https://tunnelsight.applications.co.zw/dji/test/index.m3u8',
};
const START = { email: ' Owner@Example.com ', sourceId: 'window:123456:0' };

class Clock {
  constructor() { this.now = 0; this.next = 0; this.timers = new Map(); }
  set = (fn, ms) => {
    const id = ++this.next;
    this.timers.set(id, { at: this.now + ms, fn });
    return id;
  };
  clear = (id) => { this.timers.delete(id); };
  async advance(ms) {
    const target = this.now + ms;
    await drain();
    for (;;) {
      const first = [...this.timers].filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!first) break;
      this.now = first[1].at;
      this.timers.delete(first[0]);
      first[1].fn();
      await drain();
    }
    this.now = target;
    await drain();
  }
}

function harness(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnelsight-bridge-test-'));
  const resourcePath = path.join(root, 'resources');
  const userDataPath = path.join(root, 'user-data');
  for (const file of ['scrcpy/scrcpy.exe', 'scrcpy/adb.exe', 'scrcpy/scrcpy-server', 'ffmpeg/ffmpeg.exe']) {
    const target = path.join(resourcePath, 'tools', file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'mock bundled tool');
  }
  if (options.missing) fs.unlinkSync(path.join(resourcePath, 'tools', options.missing));
  if (options.settings) {
    fs.mkdirSync(userDataPath);
    fs.writeFileSync(path.join(userDataPath, 'bridge-settings.json'), JSON.stringify(options.settings));
  }
  const clock = new Clock();
  const events = [];
  const children = [];
  const kills = [];
  const requests = [];
  const control = { adbOutput: 'List of devices attached\r\nphone-1\tdevice product:test model:Pixel_8 transport_id:1\r\n',
    hangAdb: false, throwTool: null, errorTool: null, killFails: false, rootKillFails: false };
  let pid = 4000;
  const childProcess = {
    spawn(executable, args, spawnOptions) {
      const tool = path.basename(executable);
      if (control.throwTool === tool) throw new Error(`private native error ${LINK.publishUrl}`);
      const child = new EventEmitter();
      Object.assign(child, { executable, args, options: spawnOptions, tool,
        pid: control.errorTool === tool ? undefined : ++pid, stdout: new PassThrough(), stderr: new PassThrough(), exited: false });
      child.finish = (code = 0) => {
        if (child.exited) return;
        child.exited = true;
        child.emit('exit', code, null);
        child.emit('close', code, null);
      };
      child.frame = (n = 1) => child.stdout.write(`frame=${n}\nfps=25\nprogress=continue\n`);
      child.kill = () => {
        if (control.rootKillFails) return false;
        child.finish(1);
        return true;
      };
      children.push(child);
      queueMicrotask(() => {
        if (control.errorTool === tool) {
          child.emit('error', new Error(`spawn failure: ${LINK.publishUrl}`));
          child.finish(-1);
          return;
        }
        child.emit('spawn');
        if (tool === 'adb.exe' && !control.hangAdb) {
          child.stdout.write(control.adbOutput);
          child.finish();
        }
      });
      return child;
    },
    execFile(executable, args, execOptions, callback) {
      kills.push({ executable, args, options: execOptions });
      queueMicrotask(() => {
        if (control.killFails) return callback(new Error('private taskkill diagnostic'));
        const child = children.find((item) => String(item.pid) === args[1]);
        if (child) child.finish(1);
        callback(null, '', '');
      });
    },
  };
  const moduleObject = { exports: {} };
  vm.runInNewContext(source, {
    module: moduleObject, exports: moduleObject.exports, __dirname,
    require: (name) => name === 'node:child_process' ? childProcess : require(name),
    process: { platform: 'linux', env: { SystemRoot: 'C:\\Windows' } },
    globalThis: {}, URL, AbortController, Buffer, setTimeout: clock.set, clearTimeout: clock.clear,
    Date: class extends Date { static now() { return clock.now; } },
  }, { filename: 'bridge.cjs' });
  const bridge = moduleObject.exports.createBridge({ resourcePath, userDataPath, platform: options.platform || 'win32',
    emit: (name, payload) => {
      events.push({ name, payload: plain(payload) });
      if (options.emitThrows) throw new Error('renderer listener failed');
    },
    fetchImpl: async (url, init) => {
      requests.push({ url, ...init });
      if (options.fetch) return options.fetch(url, init);
      return { ok: true, json: async () => ({ ...LINK, ...options.link }) };
    },
  });
  const ofTool = (tool) => children.filter((child) => child.tool === `${tool}.exe`);
  const h = { bridge, root, resourcePath, userDataPath, clock, events, children, kills, requests, control, ofTool,
    latest: (tool = 'ffmpeg') => ofTool(tool).at(-1),
    async start(overrides = {}) {
      const result = bridge.startStream({ ...START, ...overrides });
      await drain();
      h.latest().frame();
      return result;
    },
  };
  t.after(async () => {
    control.killFails = false;
    control.rootKillFails = false;
    await bridge.dispose();
    await drain();
    assert.equal(clock.timers.size, 0, 'disposal clears every pending timer');
    assert.equal(children.filter((child) => child.pid && !child.exited).length, 0, 'no owned process survives disposal');
    fs.rmSync(root, { recursive: true, force: true });
  });
  return h;
}

function secretFree(h) {
  const visible = JSON.stringify({ status: h.bridge.status(), events: h.events });
  for (const secret of ['PRIVATE_TEST_PASSWORD', 'laptop_test', LINK.publishUrl, 'publishUrl', 'deviceId']) {
    assert.ok(!visible.includes(secret), `renderer output excludes ${secret}`);
  }
}

test('public CommonJS API, safe status shape, saved email only, and tools checks', async (t) => {
  const h = harness(t, { settings: { email: 'Saved@Example.com', publishUrl: 'discard', password: 'discard' } });
  assert.deepEqual(Object.keys(h.bridge).sort(), ['devices', 'dispose', 'mirror', 'startStream', 'status', 'stopMirror', 'stopStream']);
  assert.deepEqual(plain(h.bridge.status()), { state: 'idle', streaming: false, email: 'saved@example.com', playbackUrl: '',
    mirrorRunning: false, toolsReady: true, cleanupPending: false, error: null, status: 'Ready.', retryAttempt: 0 });
  const copy = h.bridge.status();
  copy.email = 'changed';
  assert.equal(h.bridge.status().email, 'saved@example.com');
  await h.start();
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(h.userDataPath, 'bridge-settings.json'))), { email: 'owner@example.com' });
  secretFree(h);
  const missing = harness(t, { missing: 'ffmpeg/ffmpeg.exe' });
  assert.equal(missing.bridge.status().toolsReady, false);
  await assert.rejects(missing.bridge.startStream(START), { code: 'TOOLS_MISSING' });
  const linux = harness(t, { platform: 'linux' });
  assert.equal(linux.bridge.status().toolsReady, false);
  for (const method of [() => linux.bridge.devices(), () => linux.bridge.mirror(), () => linux.bridge.startStream(START)]) {
    await assert.rejects(method(), { code: 'WINDOWS_ONLY' });
  }
  assert.equal(linux.children.length, 0);
});

test('ADB listing includes authorization and model; mirror never links or streams', async (t) => {
  const h = harness(t);
  h.control.adbOutput += 'locked unauthorized model:Locked_Phone\noffline-1 offline\nblocked no permissions (user missing)\n';
  assert.deepEqual(plain(await h.bridge.devices()), [
    { serial: 'phone-1', state: 'device', model: 'Pixel 8', authorized: true },
    { serial: 'locked', state: 'unauthorized', model: 'Locked Phone', authorized: false },
    { serial: 'offline-1', state: 'offline', model: '', authorized: false },
    { serial: 'blocked', state: 'no-permissions', model: '', authorized: false },
  ]);
  await assert.rejects(h.bridge.mirror('locked'), { code: 'UNAUTHORIZED' });
  await assert.rejects(h.bridge.mirror('offline-1'), { code: 'DEVICE_OFFLINE' });
  const mirrored = await h.bridge.mirror('phone-1');
  assert.equal(mirrored.mirrorRunning, true);
  assert.equal(mirrored.streaming, false);
  assert.equal(h.requests.length, 0);
  assert.equal(h.ofTool('ffmpeg').length, 0);
  const scrcpy = h.latest('scrcpy');
  assert.deepEqual(plain(scrcpy.args.slice(0, 2)), ['--serial', 'phone-1']);
  assert.equal(scrcpy.options.env.ADB, path.join(h.resourcePath, 'tools/scrcpy/adb.exe'));
  assert.equal(scrcpy.options.env.SCRCPY_SERVER_PATH, path.join(h.resourcePath, 'tools/scrcpy/scrcpy-server'));
  assert.ok(!scrcpy.args.includes('--no-control'));
  await assert.rejects(h.bridge.mirror('phone-1'), { code: 'MIRROR_BUSY' });
  await h.bridge.stopMirror();
  assert.equal(scrcpy.exited, true);
  assert.equal(h.bridge.status().mirrorRunning, false);
  for (const child of h.children) {
    assert.equal(child.options.shell, false);
    assert.equal(child.options.windowsHide, true);
    assert.ok(!child.args.includes('kill-server'));
  }
  assert.deepEqual(plain(h.kills[0].args), ['/pid', String(scrcpy.pid), '/t', '/f']);
  assert.equal(h.kills[0].options.shell, false);
  assert.equal(h.kills[0].options.windowsHide, true);
  assert.equal(path.win32.basename(h.kills[0].executable), 'taskkill.exe');
});

test('no device, unauthorized default, multiple phones, and serial injection give actionable errors', async (t) => {
  const h = harness(t);
  h.control.adbOutput = 'List of devices attached\n';
  assert.deepEqual(plain(await h.bridge.devices()), []);
  await assert.rejects(h.bridge.mirror(), { code: 'NO_DEVICE' });
  h.control.adbOutput += 'locked unauthorized\n';
  await assert.rejects(h.bridge.mirror(), { code: 'UNAUTHORIZED' });
  h.control.adbOutput = 'a device\nb device\n';
  await assert.rejects(h.bridge.mirror(), { code: 'CHOOSE_DEVICE' });
  await assert.rejects(h.bridge.mirror('not-present'), { code: 'NO_DEVICE' });
  for (const serial of ['--help', 'phone;whoami', 'phone\nnext', 'phone & x', {}, null]) {
    await assert.rejects(h.bridge.mirror(serial), { code: 'INVALID_DEVICE' });
  }
  assert.equal(h.ofTool('scrcpy').length, 0);
});

test('default encoder matches tested gdigrab settings and Start waits for a complete positive progress frame', async (t) => {
  const h = harness(t);
  let resolved = false;
  const starting = h.bridge.startStream(START).then((value) => { resolved = true; return value; });
  await drain();
  const ffmpeg = h.latest();
  const value = (name) => ffmpeg.args[ffmpeg.args.indexOf(name) + 1];
  assert.equal(value('-i'), 'hwnd=0x1e240');
  for (const [name, expected] of Object.entries({ '-f': 'gdigrab', '-framerate': '25', '-thread_queue_size': '8',
    '-draw_mouse': '0', '-progress': 'pipe:1', '-stats_period': '1', '-c:v': 'libx264', '-preset': 'ultrafast',
    '-tune': 'zerolatency', '-b:v': '1200k', '-maxrate': '1500k', '-bufsize': '300k', '-bf': '0', '-g': '12',
    '-keyint_min': '12', '-sc_threshold': '0', '-r': '25' })) assert.equal(value(name), expected, name);
  assert.equal(value('-vf'), 'transpose=dir=clock:passthrough=landscape,scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1');
  assert.equal(ffmpeg.args.at(-1), LINK.publishUrl);
  assert.equal(ffmpeg.options.shell, false);
  assert.equal(ffmpeg.options.windowsHide, true);
  ffmpeg.frame(0);
  ffmpeg.stderr.write(`frame=42 ${LINK.publishUrl}\n`);
  ffmpeg.stdout.write('fra');
  await drain();
  assert.equal(resolved, false);
  ffmpeg.stdout.write('me=  1');
  await drain();
  assert.equal(resolved, false);
  ffmpeg.stdout.write('\r\n');
  const result = await starting;
  assert.equal(result.state, 'streaming');
  assert.equal(result.playbackUrl, LINK.playbackUrl);
  assert.equal(h.requests[0].url, 'https://tunnelsight.applications.co.zw/api/bridge/scrcpy/link');
  assert.equal(h.requests[0].redirect, 'error');
  const body = JSON.parse(h.requests[0].body);
  assert.deepEqual(Object.keys(body).sort(), ['deviceId', 'email']);
  assert.equal(body.email, 'owner@example.com');
  assert.match(body.deviceId, /^[a-f0-9]{32}$/);
  assert.equal(fs.readFileSync(path.join(h.userDataPath, 'scrcpy-device-id.txt'), 'utf8'), body.deviceId);
  await h.bridge.stopStream();
  await h.start();
  assert.equal(JSON.parse(h.requests[1].body).deviceId, body.deviceId);
  secretFree(h);
});

test('low480 original fits without rotation, and HWND conversion preserves 64-bit precision', async (t) => {
  const h = harness(t, { link: { publishUrl: 'rtmps://tunnelsight.applications.co.zw/live/test?pass=PRIVATE_TEST_PASSWORD' } });
  await h.start({ sourceId: 'window:18446744073709551615:1', orientation: 'original', quality: 'low480' });
  const args = h.latest().args;
  assert.equal(args[args.indexOf('-i') + 1], 'hwnd=0xffffffffffffffff');
  assert.equal(args[args.indexOf('-vf') + 1], 'scale=854:480:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=854:480:(ow-iw)/2:(oh-ih)/2,setsar=1');
  assert.equal(args[args.indexOf('-b:v') + 1], '800k');
  assert.equal(args[args.indexOf('-maxrate') + 1], '1000k');
  secretFree(h);
});

test('source and option injection rejected before linking or spawning', async (t) => {
  const h = harness(t);
  for (const sourceId of ['screen:1:0', 'window:0:0', 'window:-1:0', 'window:18446744073709551616:0',
    'window:1:0\n', 'window:1:0 & calc.exe', 'window:1:0;whoami', 'window:1:2', {}, null]) {
    await assert.rejects(h.bridge.startStream({ ...START, sourceId }), { code: 'INVALID_SOURCE' });
  }
  await assert.rejects(h.bridge.startStream({ ...START, email: 'no-email' }), { code: 'INVALID_EMAIL' });
  await assert.rejects(h.bridge.startStream({ ...START, orientation: 'clock;calc' }), { code: 'INVALID_ORIENTATION' });
  await assert.rejects(h.bridge.startStream({ ...START, quality: '720;calc' }), { code: 'INVALID_QUALITY' });
  assert.equal(h.requests.length, 0);
  assert.equal(h.children.length, 0);
});

test('server link validation rejects unsafe hosts, protocols, redirects, and credential-bearing playback', async (t) => {
  for (const publishUrl of ['http://5.189.146.229/live/test', 'rtmp://evil.example/live/test',
    'rtmp://5.189.146.229.evil.example/live/test', 'rtmp://5.189.146.229@evil.example/live/test',
    'rtmp://5.189.146.229./live/test', 'rtmp://5.189.146.229/live/test\n',
    'rtmp://5.189.146.229/live/test"', 'rtmp://5.189.146.229/live/test#fragment',
    'file:///C:/private', null]) {
    const h = harness(t, { link: { publishUrl } });
    await assert.rejects(h.bridge.startStream(START), { code: 'INVALID_LINK' });
    assert.equal(h.children.length, 0);
    secretFree(h);
  }
  for (const playbackUrl of [LINK.publishUrl, LINK.playbackUrl + '?pass=PRIVATE_TEST_PASSWORD',
    'https://user:PRIVATE_TEST_PASSWORD@tunnelsight.applications.co.zw/dji/test/index.m3u8',
    'https://evil.example/live.m3u8']) {
    const h = harness(t, { link: { playbackUrl } });
    await assert.rejects(h.bridge.startStream(START), { code: 'INVALID_LINK' });
    secretFree(h);
  }
  for (const fetch of [async () => { throw new Error(LINK.publishUrl); },
    async () => ({ ok: false, json: async () => ({ message: LINK.publishUrl }) })]) {
    const h = harness(t, { fetch });
    await assert.rejects(h.bridge.startStream(START), { code: 'LINK_FAILED' });
    secretFree(h);
  }
});

test('15-second startup deadline rejects readably and kills encoder, preserving the mirror', async (t) => {
  const h = harness(t);
  await h.bridge.mirror();
  const starting = h.bridge.startStream(START);
  const rejected = assert.rejects(starting, { code: 'NO_FRAMES', message: /15 seconds/ });
  await drain();
  h.latest().stderr.write(LINK.publishUrl);
  await h.clock.advance(14999);
  assert.equal(h.bridge.status().state, 'connecting');
  await h.clock.advance(1);
  await rejected;
  assert.equal(h.bridge.status().state, 'error');
  assert.equal(h.latest().exited, true);
  assert.equal(h.latest('scrcpy').exited, false);
  assert.equal(h.clock.timers.size, 0);
  secretFree(h);
  await h.start(); // Manual retry works after the failure has cleaned up.
});

test('exit before first frame retries within the same startup deadline', async (t) => {
  const h = harness(t);
  const starting = h.bridge.startStream(START);
  await drain();
  h.latest().finish(1);
  await drain();
  assert.equal(h.bridge.status().state, 'reconnecting');
  await h.clock.advance(2999);
  assert.equal(h.ofTool('ffmpeg').length, 1);
  await h.clock.advance(1);
  assert.equal(h.ofTool('ffmpeg').length, 2);
  h.latest().frame();
  assert.equal((await starting).state, 'streaming');
  assert.equal(h.bridge.status().status, 'Stream recovered.');
});

test('reconnect has a three-second delay and finite lifetime budget even when attempts briefly succeed', async (t) => {
  const h = harness(t);
  await h.start();
  for (let attempt = 1; attempt <= 10; attempt++) {
    h.latest().stderr.write(LINK.publishUrl.slice(0, 25));
    h.latest().stderr.write(LINK.publishUrl.slice(25));
    h.latest().finish(1);
    await drain();
    assert.equal(h.bridge.status().state, 'reconnecting');
    assert.equal(h.bridge.status().streaming, false);
    assert.equal(h.bridge.status().retryAttempt, attempt);
    await h.clock.advance(2999);
    assert.equal(h.ofTool('ffmpeg').length, attempt);
    await h.clock.advance(1);
    h.latest().frame();
    assert.equal(h.bridge.status().state, 'streaming');
  }
  h.latest().finish(0); // Even an unexpected clean exit must recover or fail.
  await drain();
  assert.equal(h.bridge.status().state, 'error');
  assert.match(h.bridge.status().error, /10 retries/);
  assert.equal(h.clock.timers.size, 0);
  assert.equal(h.ofTool('ffmpeg').length, 11);
  const logs = h.events.filter((event) => event.name === 'log');
  assert.ok(logs.length <= 2, 'diagnostics are throttled to at most one per 30 seconds');
  secretFree(h);
});

test('recovery attempt without frames is killed and retried; Stop cancels timers without stopping mirror', async (t) => {
  const h = harness(t);
  await h.bridge.mirror();
  await h.start();
  h.latest().finish(1);
  await h.clock.advance(3000);
  const stalled = h.latest();
  await h.clock.advance(15000);
  assert.equal(stalled.exited, true);
  assert.equal(h.bridge.status().state, 'reconnecting');
  assert.equal(h.bridge.status().retryAttempt, 2);
  await h.bridge.stopStream();
  const count = h.children.length;
  await h.clock.advance(60000);
  assert.equal(h.children.length, count);
  assert.equal(h.latest('scrcpy').exited, false);
  assert.equal(h.bridge.status().state, 'idle');
  assert.equal(h.bridge.status().playbackUrl, '');
  assert.equal(h.clock.timers.size, 0);
});

test('Stop during linking cancels even a fetch implementation ignoring abort; late response cannot launch', async (t) => {
  let deliver;
  const h = harness(t, { fetch: () => new Promise((resolve) => { deliver = resolve; }) });
  const starting = h.bridge.startStream(START);
  const rejected = assert.rejects(starting, { code: 'CANCELLED' });
  await drain();
  await h.bridge.stopStream();
  await rejected;
  assert.equal(h.requests[0].signal.aborted, true);
  deliver({ ok: true, json: async () => LINK });
  await drain();
  await h.clock.advance(60000);
  assert.equal(h.children.length, 0);
  assert.equal(h.bridge.status().state, 'idle');
  secretFree(h);
});

test('link timeout is bounded and its eventual private failure is handled', async (t) => {
  let rejectFetch;
  const h = harness(t, { fetch: () => new Promise((resolve, reject) => { rejectFetch = reject; }) });
  const rejected = assert.rejects(h.bridge.startStream(START), { code: 'LINK_TIMEOUT' });
  await h.clock.advance(15000);
  await rejected;
  rejectFetch(new Error(LINK.publishUrl));
  await drain();
  assert.equal(h.requests[0].signal.aborted, true);
  assert.equal(h.bridge.status().state, 'error');
  secretFree(h);
});

test('dispose cancels pending first frame, mirror and discovery, and is idempotent', async (t) => {
  const h = harness(t);
  await h.bridge.mirror();
  const starting = h.bridge.startStream(START);
  const cancelledStart = assert.rejects(starting, { code: 'CANCELLED' });
  await drain();
  h.control.hangAdb = true;
  const discovery = h.bridge.devices();
  const cancelledDiscovery = assert.rejects(discovery, { code: 'CANCELLED' });
  const disposal = h.bridge.dispose();
  assert.equal(disposal, h.bridge.dispose());
  assert.equal((await disposal).state, 'disposed');
  await cancelledStart;
  await cancelledDiscovery;
  assert.equal(h.kills.length, 3);
  await h.clock.advance(60000);
  assert.equal(h.clock.timers.size, 0);
  assert.equal(h.bridge.status().mirrorRunning, false);
  await assert.rejects(h.bridge.startStream(START), { code: 'DISPOSED' });
  await assert.rejects(h.bridge.mirror(), { code: 'DISPOSED' });
});

test('dispose during retry clears it, and stopping mirror leaves a running encoder alone', async (t) => {
  const h = harness(t);
  await h.bridge.mirror();
  await h.start();
  await h.bridge.stopMirror();
  assert.equal(h.latest().exited, false);
  assert.equal(h.bridge.status().streaming, true);
  h.latest().finish(1);
  await drain();
  assert.equal(h.bridge.status().state, 'reconnecting');
  await h.bridge.dispose();
  await h.clock.advance(30000);
  assert.equal(h.ofTool('ffmpeg').length, 1);
  assert.equal(h.bridge.status().state, 'disposed');
});

test('ADB timeout, scrcpy spawn error, and FFmpeg spawn errors are friendly and cleaned up', async (t) => {
  const h = harness(t);
  h.control.hangAdb = true;
  const adbTimeout = assert.rejects(h.bridge.devices(), { code: 'ADB_TIMEOUT' });
  await h.clock.advance(10000);
  await adbTimeout;
  assert.equal(h.latest('adb').exited, true);
  h.control.hangAdb = false;
  h.control.errorTool = 'scrcpy.exe';
  await assert.rejects(h.bridge.mirror(), { code: 'MIRROR_FAILED' });
  h.control.errorTool = 'ffmpeg.exe';
  const noFrames = assert.rejects(h.bridge.startStream(START), { code: 'NO_FRAMES' });
  await h.clock.advance(15000);
  await noFrames;
  assert.equal(h.bridge.status().state, 'error');
  assert.equal(h.clock.timers.size, 0);
  secretFree(h);
});

test('synchronous native spawn failure and throwing UI listener cannot bypass cleanup', async (t) => {
  const h = harness(t, { emitThrows: true });
  h.control.throwTool = 'ffmpeg.exe';
  const failed = assert.rejects(h.bridge.startStream(START), { code: 'NO_FRAMES' });
  await h.clock.advance(15000);
  await failed;
  h.control.throwTool = null;
  await h.start();
  await h.bridge.dispose();
  secretFree(h);
});

test('failed process-tree termination is reported with a fixed error, not silently successful', async (t) => {
  const h = harness(t);
  await h.start();
  h.control.killFails = true;
  await assert.rejects(h.bridge.stopStream(), { code: 'PROCESS_STOP_FAILED' });
  assert.equal(h.bridge.status().state, 'error');
  assert.equal(h.bridge.status().streaming, false);
  assert.match(h.bridge.status().error, /process tree/);
  assert.equal(h.latest().exited, true, 'fallback attempts to stop the root process');
  assert.equal(h.bridge.status().cleanupPending, true, 'failed session remains retryable even after root exit');
  h.control.killFails = false;
  const stopped = await h.bridge.stopStream();
  assert.equal(stopped.cleanupPending, false);
  assert.equal(stopped.state, 'idle');
  await h.start();
  secretFree(h);
});

test('failed taskkill and fallback leave a surviving encoder; repeated Stop retries the same PID successfully', async (t) => {
  const h = harness(t);
  await h.bridge.mirror();
  assert.equal(h.bridge.status().cleanupPending, false, 'an interactive mirror is independent of stream cleanup');
  await h.start();
  const encoder = h.latest();
  assert.equal(h.bridge.status().cleanupPending, true);
  h.control.killFails = true;
  h.control.rootKillFails = true;
  await assert.rejects(h.bridge.stopStream(), { code: 'PROCESS_STOP_FAILED' });
  assert.equal(encoder.exited, false);
  assert.equal(h.bridge.status().state, 'error');
  assert.equal(h.bridge.status().cleanupPending, true);
  assert.equal(h.events.filter((event) => event.name === 'status').at(-1).payload.cleanupPending, true);
  await assert.rejects(h.bridge.startStream(START), { code: 'STREAM_BUSY' });
  h.control.killFails = false;
  const result = await h.bridge.stopStream();
  assert.equal(result.state, 'idle');
  assert.equal(result.cleanupPending, false);
  assert.equal(result.error, null);
  assert.equal(encoder.exited, true);
  assert.equal(h.latest('scrcpy').exited, false, 'Stop never terminates the mirror');
  assert.deepEqual(h.kills.map((kill) => kill.args[1]), [String(encoder.pid), String(encoder.pid)]);
  assert.equal(h.events.filter((event) => event.name === 'status').at(-1).payload.cleanupPending, false);
  assert.equal(h.clock.timers.size, 0);
  await h.start();
  secretFree(h);
});

test('failed dispose releases the cached rejection; subsequent attempts retry surviving owned processes', async (t) => {
  const h = harness(t);
  await h.bridge.mirror();
  await h.start();
  const mirror = h.latest('scrcpy');
  const encoder = h.latest();
  h.control.killFails = true;
  h.control.rootKillFails = true;
  const first = h.bridge.dispose();
  assert.equal(first, h.bridge.dispose(), 'concurrent disposal calls share one attempt');
  await assert.rejects(first, { code: 'PROCESS_STOP_FAILED' });
  assert.equal(h.bridge.status().state, 'disposed');
  assert.equal(h.bridge.status().cleanupPending, true);
  assert.equal(h.bridge.status().mirrorRunning, true);
  assert.equal(encoder.exited, false);
  assert.equal(mirror.exited, false);
  assert.equal(h.kills.length, 2);
  await assert.rejects(h.bridge.startStream(START), { code: 'DISPOSED' });
  const second = h.bridge.dispose();
  assert.notEqual(second, first, 'a rejected disposal is not cached permanently');
  assert.equal(second, h.bridge.dispose());
  await assert.rejects(second, { code: 'PROCESS_STOP_FAILED' });
  assert.equal(h.kills.length, 4);
  h.control.killFails = false;
  const third = h.bridge.dispose();
  assert.notEqual(third, second);
  const result = await third;
  assert.equal(result.state, 'disposed');
  assert.equal(result.cleanupPending, false);
  assert.equal(result.error, null);
  assert.equal(result.mirrorRunning, false);
  assert.equal(encoder.exited, true);
  assert.equal(mirror.exited, true);
  assert.equal(h.kills.length, 6);
  assert.equal(h.kills.filter((kill) => kill.args[1] === String(encoder.pid)).length, 3);
  assert.equal(h.kills.filter((kill) => kill.args[1] === String(mirror.pid)).length, 3);
  assert.equal(h.bridge.dispose(), third, 'successful disposal remains idempotent');
  assert.equal(h.events.filter((event) => event.name === 'status').at(-1).payload.cleanupPending, false);
  await h.clock.advance(60000);
  assert.equal(h.clock.timers.size, 0);
  assert.equal(h.ofTool('ffmpeg').length, 1);
  secretFree(h);
});

test('mirror-only disposal failure signals cleanup and a repeated dispose retries the owned mirror', async (t) => {
  const h = harness(t);
  await h.bridge.mirror();
  const mirror = h.latest('scrcpy');
  h.control.killFails = true;
  h.control.rootKillFails = true;
  await assert.rejects(h.bridge.dispose(), { code: 'PROCESS_STOP_FAILED' });
  assert.equal(h.bridge.status().state, 'disposed');
  assert.equal(h.bridge.status().cleanupPending, true);
  assert.equal(mirror.exited, false);
  h.control.killFails = false;
  const result = await h.bridge.dispose();
  assert.equal(result.cleanupPending, false);
  assert.equal(result.mirrorRunning, false);
  assert.equal(result.error, null);
  assert.equal(mirror.exited, true);
  assert.deepEqual(h.kills.map((kill) => kill.args[1]), [String(mirror.pid), String(mirror.pid)]);
});

test('startup failure retains failed cleanup for Stop retry and emits a cleared signal after successful retry', async (t) => {
  const h = harness(t);
  const failed = assert.rejects(h.bridge.startStream(START), { code: 'NO_FRAMES' });
  await drain();
  h.control.killFails = true;
  h.control.rootKillFails = true;
  const encoder = h.latest();
  await h.clock.advance(15000);
  await failed;
  assert.equal(encoder.exited, false);
  assert.equal(h.bridge.status().state, 'error');
  assert.equal(h.bridge.status().cleanupPending, true);
  await assert.rejects(h.bridge.startStream(START), { code: 'STREAM_BUSY' });
  h.control.killFails = false;
  assert.equal((await h.bridge.stopStream()).cleanupPending, false);
  assert.equal(encoder.exited, true);
  await h.start();
  await h.bridge.stopStream();
  assert.equal(h.bridge.status().cleanupPending, false);
  secretFree(h);
});

test('desktop shell quality aliases balanced/low normalize to balanced720/low480', async (t) => {
  const h = harness(t);
  for (const [quality, bitrate] of [['balanced', '1200k'], ['low', '800k']]) {
    const starting = h.bridge.startStream({ ...START, quality });
    await drain();
    assert.equal(h.bridge.status().state, 'connecting');
    const args = h.latest().args;
    assert.equal(args[args.indexOf('-b:v') + 1], bitrate);
    h.latest().frame();
    assert.equal((await starting).state, 'streaming');
    await h.bridge.stopStream();
  }
});
