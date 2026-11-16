const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('tunnelsight', {
  command: (action, payload = {}) => ipcRenderer.invoke('native:command', action, payload),
  onEvent: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('native:event', listener);
    return () => ipcRenderer.removeListener('native:event', listener);
  }
});
