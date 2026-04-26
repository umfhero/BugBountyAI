const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld('pty', {
  start: (cols, rows, cwd) => ipcRenderer.send('pty:start', { cols, rows, cwd }),
  write: (data) => ipcRenderer.send('pty:write', data),
  onData: (cb) => ipcRenderer.on('pty:data', (_, data) => cb(data)),
  onContextReady: (cb) => ipcRenderer.on('context:ready', (_, ctx) => cb(ctx)),
  onAiQuery: (cb) => ipcRenderer.on('ai:query', (_, payload) => cb(payload)),
  getContext: () => ipcRenderer.invoke('context:get'),
  resize: (cols, rows) => ipcRenderer.send('pty:resize', { cols, rows })
});

contextBridge.exposeInMainWorld('ai', {
  explain: (ctx) => ipcRenderer.invoke('ai:explain', ctx),
  query: (input, ctx) => ipcRenderer.invoke('ai:query', { input, context: ctx }),
  script: (input, ctx) => ipcRenderer.invoke('ai:script', { input, context: ctx }),
  nextReconStep: (ctx, project) => ipcRenderer.invoke('ai:nextReconStep', { context: ctx, project })
});

contextBridge.exposeInMainWorld('script', {
  save: (script, filename, cwd) => ipcRenderer.invoke('script:save', { script, filename, cwd })
});

contextBridge.exposeInMainWorld('bugbounty', {
  getProjects: () => ipcRenderer.invoke('bb:getProjects'),
  createProject: (name, scopeStr) => ipcRenderer.invoke('bb:createProject', { name, scopeStr }),
  updateProjectStatus: (id, status) => ipcRenderer.invoke('bb:updateProjectStatus', { id, status }),
  getProjectDir: (name) => ipcRenderer.invoke('bb:getProjectDir', { name }),
  generateReport: (name) => ipcRenderer.invoke('bb:generateReport', { name }),
  getProjectDetails: (name) => ipcRenderer.invoke('bb:getProjectDetails', { name }),
  saveProjectDetails: (name, details) => ipcRenderer.invoke('bb:saveProjectDetails', { name, details })
});
