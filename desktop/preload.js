const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("monExam", {
  isDesktop: true,
  setLockdown: (on, opts) => ipcRenderer.invoke("set-lockdown", on, opts),
  runningTools: () => ipcRenderer.invoke("tools-running"),
  launchTool: (id) => ipcRenderer.invoke("launch-tool", id),
});
