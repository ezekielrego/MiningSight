const api = window.tunnelsight;
const $ = (id) => document.getElementById(id);
let selectedSource = '', previewStream, previewGeneration = 0, busy = false, toastTimer, currentState = 'idle', cleanupPending = false;
async function command(action, payload = {}) {
  const result = await api.command(action, payload);
  if (!result.ok) throw new Error(result.error || 'The action could not finish.');
  return result.data;
}
function notice(message, error = false) { $('notice').textContent = message; $('notice').hidden = !message; $('notice').classList.toggle('error', error); }
function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 7000); }
async function action(button, task) {
  if (button.disabled) return;
  button.disabled = true; button.setAttribute('aria-busy', 'true');
  try { return await task(); } catch (error) { notice(error.message, true); toast(error.message); }
  finally { button.removeAttribute('aria-busy'); button.disabled = false; updateButtons(); }
}
function changePage(page) {
  document.querySelectorAll('.page').forEach((element) => { element.hidden = element.id !== `page-${page}`; });
  document.querySelectorAll('[data-page]').forEach((element) => element.classList.toggle('active', element.dataset.page === page));
}
function updateButtons() {
  const active = ['streaming', 'connecting', 'reconnecting', 'starting'].includes(currentState);
  $('start').disabled = busy || active || cleanupPending || !selectedSource;
  $('stop').disabled = !active && !cleanupPending;
  $('refresh-windows').disabled = busy || active;
  $('email').disabled = active;
  $('orientation').disabled = active;
  $('quality').disabled = active;
  document.querySelectorAll('.source').forEach((source) => { source.disabled = active; });
}
function applyState(state = {}) {
  currentState = state.state || 'idle';
  cleanupPending = Boolean(state.cleanupPending);
  $('stream-badge').textContent = currentState === 'idle' ? 'NOT STREAMING' : currentState.toUpperCase();
  $('stream-badge').classList.toggle('live', ['streaming', 'reconnecting'].includes(currentState));
  $('live-dot').hidden = !['streaming', 'connecting', 'reconnecting'].includes(currentState);
  if (state.error) notice(state.error, true);
  else if (state.message) notice(state.message);
  else if (state.status) notice(state.status);
  updateButtons();
}
const settings = () => ({ email: $('email').value.trim(), orientation: $('orientation').value, quality: $('quality').value });
function applyPreferences(preferences = {}) { $('email').value = preferences.email || ''; $('orientation').value = preferences.orientation || 'landscape'; $('quality').value = preferences.quality || 'balanced'; }
function stopPreview() { ++previewGeneration; if (previewStream) { previewStream.getTracks().forEach(track => track.stop()); previewStream = null; } $('preview').srcObject = null; $('preview-empty').hidden = false; }
async function preview(source) {
  stopPreview();
  const generation = previewGeneration;
  await command('preview', { sourceId: source.id });
  if (generation !== previewGeneration) return;
  selectedSource = source.id;
  $('selected-window').textContent = source.name;
  $('preview-label').textContent = source.name;
  document.querySelectorAll('.source').forEach(element => element.classList.toggle('selected', element.dataset.id === source.id));
  updateButtons();
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 20, max: 25 }, width: { ideal: 1280 } }, audio: false });
    if (generation !== previewGeneration) { stream.getTracks().forEach(track => track.stop()); return; }
    previewStream = stream;
    $('preview').srcObject = stream;
    $('preview-empty').hidden = true;
    previewStream.getVideoTracks()[0].addEventListener('ended', () => { $('preview-empty').hidden = false; $('preview-label').textContent = 'PREVIEW STOPPED'; });
  } catch (error) { if (generation === previewGeneration) notice('Local preview could not start. Restore the selected window and choose it again. You can still try Start stream.', true); }
}
async function refreshWindows() {
  const sources = await command('sources');
  if (selectedSource && !sources.some(source => source.id === selectedSource)) {
    stopPreview(); selectedSource = '';
    $('selected-window').textContent = 'The selected window closed. Choose another window.';
    $('preview-label').textContent = 'NO WINDOW SELECTED';
  }
  $('sources').replaceChildren();
  if (!sources.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'No other windows found. Open the phone mirror or another app, then refresh.'; $('sources').append(empty); updateButtons(); return; }
  for (const source of sources) {
    const button = document.createElement('button'); button.className = `source${source.id === selectedSource ? ' selected' : ''}`; button.dataset.id = source.id; button.title = source.name;
    const image = document.createElement('img'); image.src = source.thumbnail; image.alt = '';
    const label = document.createElement('span'); label.textContent = source.name; button.append(image, label);
    button.addEventListener('click', () => action(button, () => preview(source)));
    $('sources').append(button);
  }
  updateButtons();
}
async function refreshDevices() {
  const result = await command('devices');
  const devices = Array.isArray(result) ? result : result.devices || [];
  $('device').replaceChildren();
  if (!devices.length) { const option = document.createElement('option'); option.value = ''; option.textContent = 'No authorized phone found'; $('device').append(option); notice('Connect USB, unlock the phone, allow USB debugging, then Refresh.'); return; }
  for (const device of devices) { const option = document.createElement('option'); option.value = device.serial; option.textContent = device.name || device.model || device.serial; if (device.state && device.state !== 'device') { option.disabled = true; option.textContent += ` · ${device.state}`; } $('device').append(option); }
  notice('Phone detected. Open phone mirror to connect.');
}
document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => action(button, async () => { await command('page', { page: button.dataset.page }); })));
document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => action(button, () => command(button.dataset.action))));
document.querySelectorAll('[data-external]').forEach(button => button.addEventListener('click', () => action(button, () => command('external', { link: button.dataset.external }))));
$('signin').addEventListener('click', () => action($('signin'), () => command('sign-in')));
$('refresh-devices').addEventListener('click', () => action($('refresh-devices'), refreshDevices));
$('refresh-windows').addEventListener('click', () => action($('refresh-windows'), refreshWindows));
$('mirror').addEventListener('click', () => action($('mirror'), async () => { await command('mirror', { serial: $('device').value }); notice('Phone mirror opened. Accept any authorization prompt on your phone, then Refresh windows and select the mirror.'); setTimeout(() => refreshWindows().catch(error => notice(error.message, true)), 2000); }));
$('stop-mirror').addEventListener('click', () => action($('stop-mirror'), () => command('stop-mirror')));
$('stop-preview').addEventListener('click', stopPreview);
$('start').addEventListener('click', () => action($('start'), async () => {
  if (!$('email').checkValidity() || !$('email').value.trim()) { $('email').focus(); throw new Error('Enter your TunnelSight account email.'); }
  busy = true; updateButtons(); notice('Connecting the selected window to your TunnelSight relay…');
  try { applyState(await command('start-stream', { ...settings(), sourceId: selectedSource })); }
  finally { busy = false; updateButtons(); }
}));
$('stop').addEventListener('click', () => action($('stop'), async () => { applyState(await command('stop-stream')); notice('Stream stopped. Local phone mirroring stays available.'); }));
$('open-live').addEventListener('click', () => action($('open-live'), () => command('open-live')));
$('clear-data').addEventListener('click', () => action($('clear-data'), () => command('clear-data')));
for (const id of ['email', 'orientation', 'quality']) $(id).addEventListener('change', () => command('save-settings', settings()).catch(error => toast(error.message)));
api.onEvent(({ type, data }) => {
  if (type === 'page') { changePage(data); if (data !== 'stream') stopPreview(); }
  else if (type === 'status' || type === 'state') applyState(data);
  else if (type === 'preferences') applyPreferences(data);
  else if (type === 'log') notice(typeof data === 'string' ? data : data.message || '');
  else if (type === 'offline') { $('offline').textContent = data; $('offline').hidden = false; }
  else if (type === 'auth') { $('auth-status').textContent = data.message; $('auth-status').hidden = false; toast(data.message); if (data.email) $('signin').textContent = data.email; }
});
command('info').then(info => { $('version').textContent = `v${info.version}`; applyPreferences(info.preferences); applyState(info.bridge); if (info.platform !== 'win32') notice('Local phone and window publishing tools require Windows. The cloud workspace remains available.'); }).catch(error => toast(error.message));
