const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("monExam", {
  isDesktop: true,
  setLockdown: (on, opts) => ipcRenderer.invoke("set-lockdown", on, opts),
  runningTools: () => ipcRenderer.invoke("tools-running"),
  installedTools: () => ipcRenderer.invoke("tools-installed"),
  launchTool: (id) => ipcRenderer.invoke("launch-tool", id),
  focusTool: (id) => ipcRenderer.invoke("focus-tool", id),
  forbiddenApps: () => ipcRenderer.invoke("forbidden-apps"),
  closeForbidden: () => ipcRenderer.invoke("close-forbidden"),
  antidotePort: () => ipcRenderer.invoke("antidote-port"),
  quitApp: () => ipcRenderer.invoke("quit-app"),
  setToolPaths: (paths) => ipcRenderer.invoke("set-tool-paths", paths),
  machineInfo: () => ipcRenderer.invoke("machine-info"),
  checkLocalExit: (code) => ipcRenderer.invoke("check-local-exit", code),
  onEmergency: (cb) => {
    const h = () => cb();
    ipcRenderer.on("emergency-request", h);
    return () => ipcRenderer.removeListener("emergency-request", h);
  },
});
