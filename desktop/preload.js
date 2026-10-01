const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("monExam", {
  isDesktop: true,
  setLockdown: (on) => ipcRenderer.invoke("set-lockdown", on),
});
