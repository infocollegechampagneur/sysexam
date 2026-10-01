const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const packaged = require("./config.json");

const EXTERNAL_CONFIG = path.join(process.env.ProgramData || "C:\\ProgramData", "MonExamEnLigne", "config.json");
let external = {};
try { external = JSON.parse(fs.readFileSync(EXTERNAL_CONFIG, "utf8")); } catch (e) { external = {}; }
const config = { ...packaged, ...external, tools: { ...packaged.tools, ...(external.tools || {}) } };

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

ipcMain.handle("set-lockdown", (_e, on, opts = {}) => {
  locked = !!on;
  const onTop = locked && !(opts.desktopTools || []).length;
  win.setKiosk(locked);
  win.setAlwaysOnTop(onTop, "screen-saver");
  win.setContentProtection(locked);
  BrowserWindow.getAllWindows().filter((w) => w !== win).forEach((w) => { w.setAlwaysOnTop(locked, "screen-saver"); w.setContentProtection(locked); });
  if (locked) win.focus();
  return locked;
});

ipcMain.handle("tools-running", () => new Promise((resolve) => {
  if (process.platform !== "win32") return resolve([]);
  execFile("tasklist", ["/fo", "csv", "/nh"], { windowsHide: true }, (err, out) => {
    if (err) return resolve([]);
    const list = out.toLowerCase();
    resolve(Object.entries(config.tools || {}).filter(([, t]) => list.includes(`"${t.process.toLowerCase()}`)).map(([id]) => id));
  });
}));

ipcMain.handle("launch-tool", async (_e, id) => {
  const tool = (config.tools || {})[id];
  if (!tool) return { ok: false, reason: "Outil inconnu" };
  const exe = (tool.paths || []).find((p) => fs.existsSync(p));
  if (!exe) return { ok: false, reason: `${tool.label || id} n'est pas installé sur ce poste` };
  const err = await shell.openPath(exe);
  return err ? { ok: false, reason: err } : { ok: true };
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(createWindow);
  app.on("window-all-closed", () => app.quit());
}
