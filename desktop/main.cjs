const { app, BrowserWindow, WebContentsView, Menu, ipcMain, desktopCapturer, shell, dialog, session, powerSaveBlocker } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { createBridge } = require('./bridge.cjs');
app.setName('TunnelSight');

const SITE = 'https://tunnelsight.applications.co.zw';
const SHELL_FILE = path.join(__dirname, 'ui/index.html');
let win, workspace, bridge, authTimer, authRequest, quitting = false, closing = false, activePage = 'workspace', selectedSource = '', wakeLock;
let sourceIds = new Set();
const resources = app.isPackaged ? process.resourcesPath : path.join(__dirname, 'resources');
const prefsPath = path.join(app.getPath('userData'), 'desktop-settings.json');
let preferences = {};
try { preferences = JSON.parse(fs.readFileSync(prefsPath, 'utf8')); } catch {}
const savePreferences = (next) => {
  preferences = { email: String(next.email || '').slice(0, 254), orientation: next.orientation === 'original' ? 'original' : 'landscape', quality: next.quality === 'low' ? 'low' : 'balanced' };
  fs.mkdirSync(path.dirname(prefsPath), { recursive: true });
  fs.writeFileSync(prefsPath, JSON.stringify(preferences), { mode: 0o600 });
};
const notify = (type, data) => { if (win && !win.isDestroyed()) win.webContents.send('native:event', { type, data }); };
const isSite = (url) => { try { return new URL(url).origin === SITE; } catch { return false; } };
const trustedSender = (event) => event.sender === win?.webContents && event.senderFrame === win.webContents.mainFrame && event.senderFrame.url.startsWith('file:') && event.senderFrame.url.split('?')[0] === require('node:url').pathToFileURL(SHELL_FILE).href;

function fitWorkspace() {
  if (!win || !workspace) return;
  const [width, height] = win.getContentSize();
  workspace.setBounds(activePage === 'workspace' ? { x: 0, y: 64, width, height: Math.max(0, height - 64) } : { x: width + 1, y: 64, width: 1, height: 1 });
}
function showPage(page) {
  activePage = ['workspace', 'stream', 'help'].includes(page) ? page : 'workspace';
  fitWorkspace();
  notify('page', activePage);
}
const httpsExternal = async (url) => {
  if (typeof url !== 'string' || url.length > 2048) throw new Error('Invalid link.');
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('Only HTTPS links can open externally.');
  await shell.openExternal(url);
};
async function cloudPost(route, body) {
  const response = await fetch(`${SITE}/api/desktop/auth/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000) });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || 'Could not connect to TunnelSight.');
  return result;
}
function cancelLogin() { clearTimeout(authTimer); authTimer = null; authRequest = null; }
async function beginLogin() {
  cancelLogin();
  const result = await cloudPost('start', {});
  const approval = new URL(result.approvalUrl);
  if (approval.origin !== SITE || approval.pathname !== '/desktop/connect.html') throw new Error('Invalid sign-in destination.');
  authRequest = result;
  await shell.openExternal(approval.href);
  notify('auth', { state: 'waiting', message: 'Finish Google sign-in and approve in your browser. This window will connect automatically.' });
  const poll = async () => {
    if (authRequest !== result || quitting) return;
    if (Date.now() >= new Date(result.expiresAt).getTime()) { cancelLogin(); notify('auth', { state: 'error', message: 'Sign-in expired. Click Sign in to try again.' }); return; }
    try {
      const next = await cloudPost('poll', { requestId: result.requestId, pollSecret: result.pollSecret });
      if (authRequest !== result) return;
      if (next.status === 'approved' || next.state === 'approved') {
        if (typeof next.token !== 'string' || next.token.length > 1024 || !next.user?.email) throw new Error('Incomplete sign-in response.');
        cancelLogin();
        await workspace.webContents.loadURL(SITE);
        await workspace.webContents.executeJavaScript(`localStorage.setItem('miningsight_auth_token', ${JSON.stringify(next.token)});`);
        workspace.webContents.reload();
        savePreferences({ ...preferences, email: next.user.email });
        notify('auth', { state: 'signed-in', email: next.user.email, message: 'Desktop signed in. Your existing cloud projects are available in Workspace.' });
        notify('preferences', preferences);
        showPage('workspace');
        return;
      }
      if (next.status === 'denied' || next.status === 'expired') throw new Error('The browser sign-in was cancelled or expired.');
    } catch (error) {
      if (authRequest !== result) return;
      notify('auth', { state: 'waiting', message: 'Waiting for browser approval. Check your connection if this continues.' });
    }
    if (authRequest === result) authTimer = setTimeout(poll, 2200);
  };
  authTimer = setTimeout(poll, 1800);
  return { waiting: true };
}
async function listSources() {
  const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: true });
  const ownId = win.getMediaSourceId();
  const items = sources.filter((source) => source.id !== ownId && source.name.trim()).map((source) => ({ id: source.id, name: source.name, thumbnail: source.thumbnail.toDataURL(), icon: source.appIcon?.toDataURL() || '' }));
  sourceIds = new Set(items.map((source) => source.id));
  return items;
}
async function handleCommand(command, payload = {}) {
  switch (command) {
    case 'info': return { version: app.getVersion(), platform: process.platform, preferences, bridge: bridge.status() };
    case 'page': showPage(payload.page); return {};
    case 'reload': await workspace.webContents.loadURL(SITE); showPage('workspace'); return {};
    case 'sources': return listSources();
    case 'preview': if (!sourceIds.has(payload.sourceId)) throw new Error('Refresh the window list and choose an open window.'); selectedSource = payload.sourceId; return {};
    case 'devices': return bridge.devices();
    case 'mirror': return bridge.mirror(payload.serial);
    case 'stop-mirror': return bridge.stopMirror();
    case 'start-stream': {
      if (!sourceIds.has(payload.sourceId)) throw new Error('Refresh and choose the window to stream.');
      savePreferences(payload);
      const result = await bridge.startStream(payload);
      if (!wakeLock) wakeLock = powerSaveBlocker.start('prevent-app-suspension');
      return result;
    }
    case 'stop-stream':
      if (wakeLock) { powerSaveBlocker.stop(wakeLock); wakeLock = null; }
      return bridge.status().state === 'disposed' ? bridge.dispose() : bridge.stopStream();
    case 'save-settings': savePreferences(payload); return preferences;
    case 'sign-in': return beginLogin();
    case 'cancel-sign-in': cancelLogin(); notify('auth', { state: 'idle', message: 'Sign-in cancelled.' }); return {};
    case 'open-live':
      showPage('workspace');
      await workspace.webContents.executeJavaScript(`if (![...document.querySelectorAll('[data-media-stage] header')].some(element => element.textContent.includes('TunnelSight live stream'))) document.querySelector('button[title="Open DJI live camera in the viewer"], button[title="Live camera stream available"]')?.click();`);
      return {};
    case 'external': {
      const links = { website: SITE, downloads: `${SITE}/desktop/`, scrcpy: 'https://github.com/Genymobile/scrcpy', ffmpeg: 'https://www.gyan.dev/ffmpeg/builds/', source: 'https://github.com/ezekielrego/MiningSight' };
      if (!links[payload.link]) throw new Error('Unknown link.');
      await httpsExternal(links[payload.link]); return {};
    }
    case 'clear-data': {
      const result = await dialog.showMessageBox(win, { type: 'question', buttons: ['Cancel', 'Clear local data'], defaultId: 0, cancelId: 0, title: 'Clear this installation?', message: 'Stop streaming and remove local desktop sign-in, settings and history?', detail: 'Cloud projects and files will remain on TunnelSight. This does not remove your phone’s USB authorization.' });
      if (result.response !== 1) return { cancelled: true };
      cancelLogin(); await bridge.dispose();
      await workspace.webContents.session.clearStorageData();
      await workspace.webContents.session.clearCache();
      for (const file of [prefsPath, path.join(app.getPath('userData'), 'bridge-settings.json'), path.join(app.getPath('userData'), 'scrcpy-device-id.txt')]) { try { fs.unlinkSync(file); } catch {} }
      preferences = {};
      app.relaunch(); app.quit(); return {};
    }
    default: throw new Error('Unknown desktop action.');
  }
}

async function createWindow() {
  win = new BrowserWindow({ width: 1460, height: 940, minWidth: 900, minHeight: 620, backgroundColor: '#171b20', title: 'TunnelSight', icon: path.join(resources, app.isPackaged ? 'icon.png' : 'artwork/icon.png'), autoHideMenuBar: true, show: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
  bridge = createBridge({ resourcePath: resources, userDataPath: app.getPath('userData'), platform: process.platform, emit: (type, data) => {
    if (type === 'status' && wakeLock && !['streaming', 'connecting', 'reconnecting'].includes(data.state)) { powerSaveBlocker.stop(wakeLock); wakeLock = null; }
    notify(type, data);
  } });
  workspace = new WebContentsView({ webPreferences: { partition: 'persist:tunnelsight-workspace', nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
  win.contentView.addChildView(workspace);
  fitWorkspace();
  win.on('resize', fitWorkspace);
  const remote = workspace.webContents;
  remote.on('will-navigate', (event, url) => { if (!isSite(url)) { event.preventDefault(); void httpsExternal(url).catch(() => {}); } });
  remote.setWindowOpenHandler(({ url }) => { if (url.startsWith('https://')) void httpsExternal(url).catch(() => {}); return { action: 'deny' }; });
  remote.session.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'fullscreen' || permission === 'clipboard-sanitized-write'));
  remote.session.setPermissionCheckHandler((_contents, permission) => permission === 'fullscreen' || permission === 'clipboard-sanitized-write');
  remote.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => { if (isMainFrame && code !== -3) { showPage('help'); notify('offline', 'The cloud workspace could not load. Local mirroring and preview are still available. Check internet and retry Workspace.'); } });
  remote.on('render-process-gone', () => { showPage('help'); notify('offline', 'The workspace stopped responding. Click Reload workspace to reopen it.'); });
  remote.session.on('will-download', (_event, item) => { item.setSaveDialogOptions({ title: 'Save TunnelSight file' }); });
  const canPreview = (contents) => contents === win.webContents && sourceIds.has(selectedSource) && contents.getURL() === require('node:url').pathToFileURL(SHELL_FILE).href;
  // Electron 45 requires an explicit display-capture grant before its source handler.
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => callback(permission === 'display-capture' && canPreview(contents)));
  session.defaultSession.setPermissionCheckHandler((contents, permission) => permission === 'display-capture' && canPreview(contents));
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (request.frame !== win.webContents.mainFrame || !selectedSource || !sourceIds.has(selectedSource)) { callback({}); return; }
    try {
      const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } });
      const source = sources.find((item) => item.id === selectedSource);
      callback(source ? { video: source } : {});
    } catch { callback({}); }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  ipcMain.handle('native:command', async (event, command, payload) => {
    if (!trustedSender(event)) throw new Error('Untrusted desktop request.');
    try { return { ok: true, data: await handleCommand(command, payload) }; }
    catch (error) { return { ok: false, error: String(error.message || 'Desktop action failed.').slice(0, 500) }; }
  });
  const menu = Menu.buildFromTemplate([
    { label: 'TunnelSight', submenu: [{ label: 'Workspace', click: () => showPage('workspace') }, { label: 'Local streaming', click: () => showPage('stream') }, { label: 'Help & setup', click: () => showPage('help') }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ label: 'Reload workspace', accelerator: 'CmdOrCtrl+R', click: () => remote.reload() }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] }
  ]);
  Menu.setApplicationMenu(menu);
  await win.loadFile(SHELL_FILE);
  win.show();
  void remote.loadURL(SITE).catch(() => {});
  win.on('close', async (event) => {
    if (quitting) return;
    event.preventDefault();
    if (closing) return;
    closing = true;
    const status = bridge.status();
    if (['streaming', 'connecting', 'reconnecting'].includes(status.state)) {
      const decision = await dialog.showMessageBox(win, { type: 'question', buttons: ['Keep streaming', 'Stop and close'], defaultId: 0, cancelId: 0, message: 'Stop your local stream and close TunnelSight?' });
      if (decision.response !== 1) { closing = false; return; }
    }
    cancelLogin();
    try { await bridge.dispose(); }
    catch (error) {
      closing = false;
      notify('status', bridge.status());
      await dialog.showMessageBox(win, { type: 'error', buttons: ['Return to app'], message: 'A local process has not stopped yet.', detail: `${error.message} Close TunnelSight again to retry cleanup. Local streaming also provides Stop and Close mirror controls.` });
      return;
    }
    quitting = true;
    if (wakeLock) powerSaveBlocker.stop(wakeLock);
    remote.close(); win.destroy(); app.quit();
  });
}
app.setAppUserModelId('zw.co.techinn.tunnelsight.desktop');
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(createWindow).catch((error) => { dialog.showErrorBox('TunnelSight could not start', error.message); app.exit(1); });
  app.on('before-quit', (event) => { if (!quitting && win && !win.isDestroyed()) { event.preventDefault(); win.close(); } });
  app.on('window-all-closed', () => app.quit());
}
