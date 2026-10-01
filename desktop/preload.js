const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("monExam", {
  isDesktop: true,
  setLockdown: (on, opts) => ipcRenderer.invoke("set-lockdown", on, opts),
  runningTools: () => ipcRenderer.invoke("tools-running"),
  launchTool: (id) => ipcRenderer.invoke("launch-tool", id),
  forbiddenApps: () => ipcRenderer.invoke("forbidden-apps"),
  checkLocalExit: (code) => ipcRenderer.invoke("check-local-exit", code),
  onEmergency: (cb) => {
    const h = () => cb();
    ipcRenderer.on("emergency-request", h);
    return () => ipcRenderer.removeListener("emergency-request", h);
  },
});
