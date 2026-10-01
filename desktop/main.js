const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const config = require("./config.json");

const APP_URL = process.env.MONEXAM_URL || config.appUrl;
const APP_ORIGIN = new URL(APP_URL).origin;
const TOOL_HOSTS = ["usito.usherbrooke.ca", "www.wordreference.com", "wordreference.com"];
const BLOCKED_KEYS = ["F5", "F11", "F12"];

let win = null;
let locked = false;

const hostOf = (url) => { try { return new URL(url).hostname; } catch (e) { return ""; } };

function lockTool(child) {
  child.removeMenu();
  child.setAlwaysOnTop(locked, "screen-saver");
  child.setContentProtection(locked);
  child.webContents.on("will-navigate", (e, url) => { if (!TOOL_HOSTS.includes(hostOf(url))) e.preventDefault(); });
  child.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1366,
    height: 900,
    title: "MonExamEnLigne",
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, devTools: !app.isPackaged },
  });
  win.removeMenu();
  win.loadURL(APP_URL);

  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(APP_ORIGIN)) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (TOOL_HOSTS.includes(hostOf(url))) {
      return { action: "allow", overrideBrowserWindowOptions: { parent: win, width: 780, height: 900, autoHideMenuBar: true, webPreferences: { devTools: false } } };
    }
    return { action: "deny" };
  });
  win.webContents.on("did-create-window", lockTool);

  win.webContents.on("before-input-event", (e, input) => {
    if (!locked) return;
    const k = (input.key || "").toLowerCase();
    if (BLOCKED_KEYS.includes(input.key) || (input.alt && input.key === "F4") ||
        (input.control && input.shift && ["i", "j", "c"].includes(k)) ||
        (input.control && ["r", "w", "n", "t", "p", "s", "u"].includes(k))) e.preventDefault();
  });

  win.on("close", (e) => {
    if (!locked) return;
    e.preventDefault();
    dialog.showMessageBox(win, { type: "warning", title: "Examen en cours", message: "Vous devez remettre votre examen avant de fermer l'application." });
  });

  win.webContents.on("did-fail-load", () => {
    dialog.showErrorBox("Connexion impossible", `Impossible de joindre ${APP_URL}. Vérifiez votre connexion Internet.`);
  });
}

ipcMain.handle("set-lockdown", (_e, on) => {
  locked = !!on;
  win.setKiosk(locked);
  win.setAlwaysOnTop(locked, "screen-saver");
  win.setContentProtection(locked);
  BrowserWindow.getAllWindows().filter((w) => w !== win).forEach((w) => { w.setAlwaysOnTop(locked, "screen-saver"); w.setContentProtection(locked); });
  if (locked) win.focus();
  return locked;
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(createWindow);
  app.on("window-all-closed", () => app.quit());
}
