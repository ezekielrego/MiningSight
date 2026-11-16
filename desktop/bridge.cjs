'use strict';

// Main-process only. emit(name, payload): status => status(), log => { level, message }.
// devices() => [{ serial, state, model, authorized }]. All other async methods
// resolve to status(); failures reject with a friendly Error and a stable code.
// status() is synchronous. cleanupPending stays true while a stream session or
// owned encoder needs stopping, or disposal still owns any tool after a failure.
// Window thumbnails/preview belong to Electron/renderer.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');

const LINK_ENDPOINT = 'https://tunnelsight.applications.co.zw/api/bridge/scrcpy/link';
const HOSTS = new Set(['5.189.146.229', 'tunnelsight.applications.co.zw']);
const RETRY_MS = 3000;
const MAX_RETRIES = 10;
const FRAME_TIMEOUT_MS = 15000;
const SERIAL = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,255}$/;

function failure(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function windowInput(sourceId) {
  const match = typeof sourceId === 'string' && /^window:(\d{1,20}):[01]$/.exec(sourceId);
  if (!match) throw failure('INVALID_SOURCE', 'Choose an open window from the window picker.');
  const hwnd = BigInt(match[1]);
  if (!hwnd || hwnd > 0xffffffffffffffffn) {
    throw failure('INVALID_SOURCE', 'Choose a valid open window from the window picker.');
  }
  return `hwnd=0x${hwnd.toString(16)}`;
}

function validateLink(link) {
  // Never include a server response, native error, command line or URL in errors.
  try {
    if (!link || link.success === false || typeof link.publishUrl !== 'string' ||
        link.publishUrl.length > 8192 || /[\s"'\\\x00-\x1f\x7f]/.test(link.publishUrl)) throw new Error();
    const publish = new URL(link.publishUrl);
    if (!['rtmp:', 'rtmps:'].includes(publish.protocol) ||
        !HOSTS.has(publish.hostname.toLowerCase()) || publish.hash || publish.pathname.length < 2) throw new Error();
    if (typeof link.playbackUrl !== 'string' || link.playbackUrl.length > 2048) throw new Error();
    const playback = new URL(link.playbackUrl);
    if (playback.protocol !== 'https:' || !HOSTS.has(playback.hostname.toLowerCase()) ||
        playback.username || playback.password || playback.search || playback.hash ||
        (playback.port && playback.port !== '443') ||
        !/^\/[a-zA-Z0-9_./-]+\.m3u8$/.test(playback.pathname)) throw new Error();
    return { publishUrl: link.publishUrl, playbackUrl: playback.href };
  } catch {
    throw failure('INVALID_LINK', 'TunnelSight returned an invalid stream connection. Please try again.');
  }
}

function encoderArgs(input, orientation, quality, publishUrl) {
  const low = quality === 'low480';
  const size = low ? '854:480' : '1280:720';
  const rotate = orientation === 'landscape' ? 'transpose=dir=clock:passthrough=landscape,' : '';
  const filter = `${rotate}scale=${size}:force_original_aspect_ratio=decrease:force_divisible_by=2,` +
    `pad=${size}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
  return [
    '-hide_banner', '-loglevel', 'warning', '-nostdin', '-progress', 'pipe:1', '-stats_period', '1',
    '-thread_queue_size', '8', '-f', 'gdigrab', '-framerate', '25', '-draw_mouse', '0', '-i', input,
    '-an', '-vf', filter, '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
    '-pix_fmt', 'yuv420p', '-b:v', low ? '800k' : '1200k', '-maxrate', low ? '1000k' : '1500k',
    '-bufsize', '300k', '-bf', '0', '-g', '12', '-keyint_min', '12', '-sc_threshold', '0',
    '-r', '25', '-flush_packets', '1', '-rw_timeout', '10000000', '-f', 'flv',
    '-flvflags', 'no_duration_filesize', publishUrl,
  ];
}

function createBridge({ resourcePath = path.join(__dirname, 'resources'), userDataPath,
  platform = process.platform, emit = () => {}, fetchImpl = globalThis.fetch } = {}) {
  if (typeof userDataPath !== 'string' || !userDataPath) {
    throw failure('INVALID_SETTINGS_PATH', 'A local application settings directory is required.');
  }
  const tools = {
    scrcpy: path.join(resourcePath, 'tools', 'scrcpy', 'scrcpy.exe'),
    adb: path.join(resourcePath, 'tools', 'scrcpy', 'adb.exe'),
    ffmpeg: path.join(resourcePath, 'tools', 'ffmpeg', 'ffmpeg.exe'),
  };
  const settingsFile = path.join(userDataPath, 'bridge-settings.json');
  const deviceFile = path.join(userDataPath, 'scrcpy-device-id.txt');
  const owned = new Set();
  let disposed = false;
  let disposal = null;
  let session = null;
  let mirrorRecord = null;
  let mirrorGeneration = 0;
  let mirrorPending = null;
  let lastLog = null;
  let data = { state: 'idle', streaming: false, email: '', playbackUrl: '',
    mirrorRunning: false, error: null, status: 'Ready.', retryAttempt: 0 };
  try {
    const saved = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    if (validEmail(saved.email)) data.email = saved.email.trim().toLowerCase();
  } catch { /* A missing or damaged settings file can be replaced on Start. */ }

  function validEmail(value) {
    return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) &&
      !/[\x00-\x1f\x7f]/.test(value);
  }

  function toolsReady() {
    return platform === 'win32' && Object.values(tools).every((file) => {
      try { return fs.statSync(file).isFile(); } catch { return false; }
    });
  }

  function ownedEncoders() {
    return [...owned].filter((record) => record.kind === 'encoder' && !record.exited);
  }

  function status() {
    return { ...data, toolsReady: toolsReady(),
      cleanupPending: session !== null || ownedEncoders().length > 0 || (disposed && owned.size > 0) };
  }

  function send(name, payload) {
    try { emit(name, payload); } catch { /* A UI listener must not orphan a process. */ }
  }

  function update(patch) {
    data = { ...data, ...patch };
    send('status', status());
  }

  function log(message, level = 'info') {
    // Only fixed, locally authored diagnostics are emitted. Child output may
    // contain URL credentials (even split across chunks), so it is never logged.
    const now = Date.now();
    if (lastLog !== null && now - lastLog < 30000) return;
    lastLog = now;
    send('log', { level, message });
  }

  function available() {
    if (disposed) throw failure('DISPOSED', 'The desktop bridge is closed.');
    if (platform !== 'win32') throw failure('WINDOWS_ONLY', 'The local phone bridge requires Windows 10 or 11.');
    if (!toolsReady()) throw failure('TOOLS_MISSING', 'Bundled scrcpy, ADB or FFmpeg is missing. Reinstall the desktop app.');
  }

  function spawnOwned(executable, args, handlers = {}, env = process.env) {
    let child;
    try {
      child = cp.spawn(executable, args, { shell: false, windowsHide: true,
        cwd: path.dirname(executable), stdio: ['ignore', 'pipe', 'pipe'], env });
    } catch {
      throw failure('PROCESS_START_FAILED', 'A bundled tool could not start. Reinstall the desktop app.');
    }
    const record = { child, kind: executable === tools.ffmpeg ? 'encoder' : 'tool',
      exited: false, stopping: false, termination: null };
    owned.add(record);
    let notified = false;
    function ended(code, signal, errored = false, closed = false) {
      record.exited = true;
      owned.delete(record);
      if (handlers.waitForClose && !closed && !errored) return;
      if (notified) return;
      notified = true;
      if (handlers.end) handlers.end(record, code, signal, errored);
    }
    child.once('exit', (code, signal) => ended(code, signal));
    child.once('close', (code, signal) => ended(code, signal, false, true));
    child.on('error', () => {
      if (!child.pid) ended(null, null, true);
      else if (!notified) {
        notified = true;
        if (handlers.end) handlers.end(record, null, null, true);
      }
    });
    if (handlers.stdout && child.stdout) child.stdout.on('data', handlers.stdout);
    else if (child.stdout) child.stdout.resume();
    if (handlers.stderr && child.stderr) child.stderr.on('data', handlers.stderr);
    else if (child.stderr) child.stderr.resume();
    if (handlers.spawn) child.once('spawn', () => handlers.spawn(record));
    return record;
  }

  function terminate(record) {
    if (!record || record.exited) return Promise.resolve();
    if (record.termination) return record.termination;
    record.stopping = true;
    record.termination = new Promise((resolve, reject) => {
      if (!Number.isSafeInteger(record.child.pid) || record.child.pid <= 0 || !owned.has(record)) {
        // A spawn failure has no PID and cannot own descendants.
        if (!record.child.pid) { owned.delete(record); resolve(); }
        else reject(failure('PROCESS_STOP_FAILED', 'Could not stop a local tool. Close the desktop app and try again.'));
        return;
      }
      const killer = path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');
      const done = (error) => {
        if (error && !record.exited) {
          // Best effort if Windows refused tree termination; retain ownership so
          // disposal can try again, and never report successful cleanup.
          try { record.child.kill('SIGKILL'); } catch { /* Report the fixed error below. */ }
          reject(failure('PROCESS_STOP_FAILED', 'Windows could not stop a local process tree. Close the desktop app and try again.'));
          return;
        }
        record.exited = true;
        owned.delete(record);
        resolve();
      };
      try {
        cp.execFile(killer, ['/pid', String(record.child.pid), '/t', '/f'],
          { shell: false, windowsHide: true, timeout: 5000, maxBuffer: 65536 }, done);
      } catch { done(new Error()); }
    });
    // Permit disposal to retry a failed tree kill.
    record.termination.catch(() => { record.termination = null; });
    return record.termination;
  }

  async function devices() {
    available();
    return new Promise((resolve, reject) => {
      let output = '';
      let settled = false;
      let timer;
      let record;
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        error ? reject(error) : resolve(result);
      };
      try {
        record = spawnOwned(tools.adb, ['devices', '-l'], {
          waitForClose: true,
          stdout(chunk) {
            output += chunk.toString();
            if (output.length > 1024 * 1024) {
              finish(failure('ADB_FAILED', 'Could not read the phone list. Reconnect USB and try again.'));
              void terminate(record).catch(() => {});
            }
          },
          end(rec, code, signal, errored) {
            if (disposed || rec.stopping) return finish(failure('CANCELLED', 'Phone discovery was cancelled.'));
            if (errored || code !== 0) return finish(failure('ADB_FAILED', 'Could not read the phone list. Reconnect USB and try again.'));
            const result = [];
            for (const line of output.split(/\r?\n/)) {
              const match = /^(\S+)\s+(device|unauthorized|offline|no permissions)\b(.*)$/.exec(line.trim());
              if (!match || !SERIAL.test(match[1])) continue;
              const model = /\bmodel:([a-zA-Z0-9_.-]{1,128})\b/.exec(match[3]);
              result.push({ serial: match[1], state: match[2] === 'no permissions' ? 'no-permissions' : match[2],
                model: model ? model[1].replace(/_/g, ' ') : '', authorized: match[2] === 'device' });
            }
            finish(null, result);
          },
        });
        timer = setTimeout(() => {
          finish(failure('ADB_TIMEOUT', 'Phone discovery timed out. Check USB debugging and try again.'));
          void terminate(record).catch(() => {});
        }, 10000);
      } catch (error) { finish(error); }
    });
  }

  async function mirror(serial) {
    available();
    if (serial !== undefined && (typeof serial !== 'string' || !SERIAL.test(serial))) {
      throw failure('INVALID_DEVICE', 'Choose a phone from the connected device list.');
    }
    if (mirrorPending !== null || mirrorRecord) throw failure('MIRROR_BUSY', 'A phone mirror is already open or starting. Stop it first.');
    const generation = ++mirrorGeneration;
    mirrorPending = generation;
    try {
      const list = await devices();
      if (disposed || generation !== mirrorGeneration) throw failure('CANCELLED', 'Phone mirroring was cancelled.');
      let selected = serial ? list.find((device) => device.serial === serial) : null;
      if (!serial) {
        const authorized = list.filter((device) => device.authorized);
        if (authorized.length > 1) throw failure('CHOOSE_DEVICE', 'More than one phone is connected. Choose a phone to mirror.');
        selected = authorized[0] || list[0];
      }
      if (!selected) throw failure('NO_DEVICE', 'No phone found. Connect USB and enable USB debugging on your phone.');
      if (!selected.authorized) {
        throw failure(selected.state === 'unauthorized' ? 'UNAUTHORIZED' : 'DEVICE_OFFLINE',
          selected.state === 'unauthorized' ? 'Unlock your phone and accept the USB debugging authorization, then retry.' :
            'The phone is offline or unavailable. Reconnect USB, check USB debugging and retry.');
      }
      await new Promise((resolve, reject) => {
        let started = false;
        mirrorRecord = spawnOwned(tools.scrcpy, ['--serial', selected.serial, '--window-title=TunnelSight-Phone',
          '--max-size=1280', '--max-fps=30', '--video-bit-rate=4M', '--no-audio',
          '--window-width=960', '--window-height=540'], {
          spawn(record) {
            if (disposed || generation !== mirrorGeneration || record.stopping) {
              reject(failure('CANCELLED', 'Phone mirroring was cancelled.'));
              return;
            }
            started = true;
            update({ mirrorRunning: true, error: null, status: 'Phone mirror is open. Select its window and press Start to stream.' });
            resolve();
          },
          end(record, code, signal, errored) {
            if (mirrorRecord === record) mirrorRecord = null;
            const cancelled = disposed || record.stopping || generation !== mirrorGeneration;
            const message = 'Phone mirror closed. Check the phone connection and reopen the mirror to retry.';
            if (!cancelled) {
              update({ mirrorRunning: false, ...(code === 0 && !errored ? {} : { error: message }), status: message });
              log(message, 'warning');
            }
            if (!started) reject(failure(cancelled ? 'CANCELLED' : 'MIRROR_FAILED', cancelled ? 'Phone mirroring was cancelled.' :
              'Could not open the phone mirror. Check USB authorization and the bundled scrcpy installation.'));
          },
        }, { ...process.env, ADB: tools.adb,
          SCRCPY_SERVER_PATH: path.join(path.dirname(tools.scrcpy), 'scrcpy-server') });
      });
      return status();
    } catch (error) {
      if (!disposed && generation === mirrorGeneration) update({ error: error.message, status: error.message });
      throw error;
    } finally {
      if (mirrorPending === generation) mirrorPending = null;
    }
  }

  async function stopMirror() {
    ++mirrorGeneration;
    const record = mirrorRecord;
    try { await terminate(record); }
    catch (error) {
      update({ error: error.message, status: error.message });
      throw error;
    }
    if (mirrorRecord === record) mirrorRecord = null;
    update({ mirrorRunning: false, status: disposed ? 'Desktop bridge closed.' : 'Phone mirror stopped.' });
    return status();
  }

  function clearSessionTimers(current) {
    clearTimeout(current.retryTimer);
    clearTimeout(current.startTimer);
    clearTimeout(current.frameTimer);
    clearTimeout(current.linkTimer);
  }

  async function cleanupSession(current) {
    clearSessionTimers(current);
    current.intended = false;
    current.cancel();
    current.abort.abort();
    const results = await Promise.allSettled([...new Set([...current.children, ...ownedEncoders()])].map(terminate));
    current.publishUrl = null;
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) throw failed.reason;
  }

  async function failSession(current, error) {
    if (session !== current || !current.intended) return;
    current.intended = false;
    update({ state: 'error', streaming: false, error: error.message, status: error.message });
    log(error.message, 'error');
    let cleanupError;
    try { await cleanupSession(current); }
    catch (stopError) {
      cleanupError = stopError;
    }
    if (session === current) {
      if (!cleanupError) session = null;
      // Emit again after cleanup so the UI receives the final cleanupPending
      // value. Retain a failed session so Stop can retry and Start stays blocked.
      if (!disposed) update({ error: cleanupError ? cleanupError.message : error.message,
        status: cleanupError ? cleanupError.message : error.message });
    }
    if (current.rejectReady) current.rejectReady(error);
  }

  function alive(current) { return !disposed && session === current && current.intended; }

  async function recover(current, record, error) {
    if (!alive(current) || current.encoder !== record) return;
    current.encoder = null;
    clearTimeout(current.frameTimer);
    if (current.retryAttempt >= MAX_RETRIES) {
      await failSession(current, failure('RETRIES_EXHAUSTED', 'The stream could not reconnect after 10 retries. Check the window and internet, then press Start to retry.'));
      return;
    }
    current.retryAttempt++;
    update({ state: 'reconnecting', streaming: false, retryAttempt: current.retryAttempt,
      error: error.message, status: `Stream interrupted. Reconnecting in 3 seconds (${current.retryAttempt}/10).` });
    log(error.message, 'warning');
    try { await terminate(record); }
    catch (stopError) { await failSession(current, stopError); return; }
    if (!alive(current)) return;
    current.retryTimer = setTimeout(() => { if (alive(current)) launchEncoder(current); }, RETRY_MS);
  }

  function launchEncoder(current) {
    if (!alive(current)) return;
    let progress = '';
    let receivedFrame = false;
    let diagnostic = '';
    let record;
    const interrupted = () => failure('STREAM_INTERRUPTED', /(?:window|hwnd|grab).*?(?:invalid|not found|failed|error)|(?:invalid|failed).*?(?:window|hwnd)/i.test(diagnostic) ?
      'The selected window cannot be captured. Keep it open, visible and unminimized, then retry.' :
      'The stream connection stopped. Check the selected window and internet connection.');
    try {
      record = spawnOwned(tools.ffmpeg, encoderArgs(current.input, current.orientation, current.quality, current.publishUrl), {
        stdout(chunk) {
          if (!alive(current) || current.encoder !== record || record.stopping) return;
          progress += chunk.toString();
          const lines = progress.split(/\r?\n/);
          progress = lines.pop().slice(-4096);
          if (receivedFrame || !lines.some((line) => /^frame=\s*[1-9]\d*\s*$/.test(line))) return;
          receivedFrame = true;
          clearTimeout(current.frameTimer);
          clearTimeout(current.startTimer);
          current.started = true;
          update({ state: 'streaming', streaming: true, error: null,
            status: current.retryAttempt ? 'Stream recovered.' : 'Streaming to TunnelSight.' });
          if (current.resolveReady) current.resolveReady(status());
          log(current.retryAttempt ? 'Stream recovered.' : 'Streaming to TunnelSight.');
        },
        stderr(chunk) {
          // Keep at most a small private diagnostic for classification, never output.
          diagnostic = (diagnostic + chunk.toString()).slice(-4096);
        },
        end(rec) {
          if (rec.stopping) return;
          void recover(current, rec, interrupted());
        },
      });
      current.encoder = record;
      current.children.add(record);
      if (current.started) {
        current.frameTimer = setTimeout(() => {
          void recover(current, record, failure('NO_FRAMES', 'No video frames arrived. Keep the selected window visible and unminimized, then retry.'));
        }, FRAME_TIMEOUT_MS);
      }
    } catch (error) {
      // A synchronous spawn exception has no owned child, but consumes a retry.
      const placeholder = { exited: true };
      current.encoder = placeholder;
      void recover(current, placeholder, error);
    }
  }

  async function linkAccount(current) {
    let deviceId;
    try {
      fs.mkdirSync(userDataPath, { recursive: true, mode: 0o700 });
      try { deviceId = fs.readFileSync(deviceFile, 'utf8').trim(); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        const candidate = crypto.randomUUID().replace(/-/g, '');
        try { fs.writeFileSync(deviceFile, candidate, { flag: 'wx', mode: 0o600 }); }
        catch (writeError) { if (writeError.code !== 'EEXIST') throw writeError; }
        deviceId = fs.readFileSync(deviceFile, 'utf8').trim();
      }
      if (!/^[a-fA-F0-9]{32}$/.test(deviceId)) throw new Error();
      fs.writeFileSync(settingsFile, JSON.stringify({ email: current.email }) + '\n', { mode: 0o600 });
    } catch {
      throw failure('SETTINGS_FAILED', 'Could not save local bridge settings. Check the application data folder permissions.');
    }
    if (typeof fetchImpl !== 'function') throw failure('LINK_FAILED', 'This desktop app needs an updated Node runtime to connect to TunnelSight.');
    const request = (async () => {
      try {
        const response = await fetchImpl(LINK_ENDPOINT, { method: 'POST', redirect: 'error',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: current.email, deviceId }), signal: current.abort.signal });
        if (!response.ok) throw new Error();
        return validateLink(await response.json());
      } catch (error) {
        if (error.code === 'INVALID_LINK') throw error;
        throw failure('LINK_FAILED', 'Could not link to TunnelSight. Check your internet connection and account email, then retry.');
      }
    })();
    try {
      return await Promise.race([request,
        current.cancelled.then(() => { throw failure('CANCELLED', 'Starting the stream was cancelled.'); }),
        new Promise((resolve, reject) => {
          current.linkTimer = setTimeout(() => {
            current.abort.abort();
            reject(failure('LINK_TIMEOUT', 'TunnelSight did not respond in time. Check your internet connection and retry.'));
          }, 15000);
        }),
      ]);
    } finally { clearTimeout(current.linkTimer); }
  }

  async function startStream({ email, sourceId, orientation = 'landscape', quality = 'balanced720' } = {}) {
    available();
    if (session || ownedEncoders().length) throw failure('STREAM_BUSY', 'A stream is already active or stopping. Stop it before starting again.');
    if (!validEmail(email)) throw failure('INVALID_EMAIL', 'Enter your TunnelSight account email.');
    const input = windowInput(sourceId);
    if (!['landscape', 'original'].includes(orientation)) throw failure('INVALID_ORIENTATION', 'Choose landscape or original orientation.');
    if (quality === 'balanced') quality = 'balanced720';
    if (quality === 'low') quality = 'low480';
    if (!['balanced720', 'low480'].includes(quality)) throw failure('INVALID_QUALITY', 'Choose balanced or low quality.');
    const current = { email: email.trim().toLowerCase(), input, orientation, quality, intended: true,
      retryAttempt: 0, started: false, children: new Set(), abort: new AbortController(), encoder: null };
    current.cancelled = new Promise((resolve) => { current.cancel = resolve; });
    session = current;
    update({ state: 'connecting', streaming: false, email: current.email, playbackUrl: '',
      error: null, status: 'Connecting to TunnelSight.', retryAttempt: 0 });
    try {
      const link = await linkAccount(current);
      if (!alive(current)) throw failure('CANCELLED', 'Starting the stream was cancelled.');
      current.publishUrl = link.publishUrl;
      update({ playbackUrl: link.playbackUrl, status: 'Waiting for the first video frame.' });
      const ready = new Promise((resolve, reject) => { current.resolveReady = resolve; current.rejectReady = reject; });
      current.startTimer = setTimeout(() => {
        void failSession(current, failure('NO_FRAMES', 'No video frames arrived within 15 seconds. Keep the selected window open, visible and unminimized, then retry.'));
      }, FRAME_TIMEOUT_MS);
      launchEncoder(current);
      return await ready;
    } catch (error) {
      if (alive(current)) await failSession(current, error);
      throw error;
    }
  }

  async function stopStream() {
    const current = session;
    if (current) {
      current.intended = false;
      if (current.rejectReady) current.rejectReady(failure('CANCELLED', 'Starting the stream was cancelled.'));
      try { await cleanupSession(current); }
      catch (error) {
        update({ state: 'error', streaming: false, error: error.message, status: error.message });
        throw error;
      }
      if (session === current) session = null;
    } else {
      const results = await Promise.allSettled(ownedEncoders().map(terminate));
      const failed = results.find((result) => result.status === 'rejected');
      if (failed) {
        update({ state: 'error', streaming: false, error: failed.reason.message, status: failed.reason.message });
        throw failed.reason;
      }
    }
    update({ state: disposed ? 'disposed' : 'idle', streaming: false, playbackUrl: '',
      error: null, status: disposed ? 'Desktop bridge closed.' : 'Stream stopped.', retryAttempt: 0 });
    return status();
  }

  function dispose() {
    if (disposal) return disposal;
    disposed = true;
    ++mirrorGeneration;
    const attempt = (async () => {
      const results = await Promise.allSettled([stopStream(), stopMirror(), ...[...owned].map(terminate)]);
      const failed = results.find((result) => result.status === 'rejected');
      update({ state: 'disposed', streaming: false,
        mirrorRunning: Boolean(mirrorRecord && !mirrorRecord.exited), playbackUrl: '',
        error: failed ? failed.reason.message : null, status: failed ? failed.reason.message : 'Desktop bridge closed.' });
      if (failed) throw failed.reason;
      return status();
    })();
    disposal = attempt;
    attempt.catch(() => { if (disposal === attempt) disposal = null; });
    return attempt;
  }

  return { devices, mirror, stopMirror, startStream, stopStream, status, dispose };
}

module.exports = { createBridge };
