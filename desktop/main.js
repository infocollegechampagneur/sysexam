const { app, BrowserWindow, ipcMain, dialog, shell, session } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const packaged = require("./config.json");

const EXTERNAL_CONFIG = path.join(process.env.ProgramData || "C:\\ProgramData", "MonExamEnLigne", "config.json");
let external = {};
try { external = JSON.parse(fs.readFileSync(EXTERNAL_CONFIG, "utf8")); } catch (e) { external = {}; }
const config = { ...packaged, ...external, tools: { ...packaged.tools, ...(external.tools || {}) } };

const APP_URL = process.env.MONEXAM_URL || config.appUrl;
const LOG_FILE = path.join(app.getPath("userData"), "monexam.log");
function log(msg) { try { fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${msg}\n`); } catch (e) { /* ignore */ } }
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
  win.webContents.setUserAgent(win.webContents.getUserAgent().replace(/ MonExamEnLigne\/\S+/i, "").replace(/ monexamenligne-desktop\/\S+/i, "").replace(/ Electron\/\S+/, ""));
  session.defaultSession.clearCache().finally(() => win.loadURL(APP_URL));

  win.webContents.on("did-fail-load", (e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    log(`did-fail-load ${code} ${desc} ${url}`);
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<html><body style="font-family:Segoe UI,Arial;display:grid;place-items:center;height:100vh;margin:0;background:#f8fafc;color:#0f172a"><div style="text-align:center;max-width:460px"><h2>Site inaccessible</h2><p>${desc} (${code})<br><small>${url}</small></p><p>Vérifiez la connexion Internet ou le DNS du poste, puis appuyez sur <b>F5</b> ou <b>Ctrl+R</b> pour réessayer.</p></div></body></html>`)}`);
  });
  win.webContents.on("console-message", (e, level, message) => { if (level >= 2) log(`console: ${message}`); });
  win.webContents.on("did-navigate", (e, url) => log(`navigate ${url}`));

  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(APP_ORIGIN)) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (TOOL_HOSTS.includes(hostOf(url))) {
      return { action: "allow", overrideBrowserWindowOptions: { parent: win, width: 780, height: 900, autoHideMenuBar: true, webPreferences: { devTools: false } } };
    }
    return { action: "deny" };
  });
  win.webContents.on("did-create-window", lockTool);

  win.webContents.on("before-input-event", (e, input) => {
    if (input.type === "keyDown" && input.control && input.alt && input.shift && (input.key || "").toLowerCase() === "u") {
      e.preventDefault();
      win.webContents.send("emergency-request");
      return;
    }
    if (!locked) {
      if (input.type === "keyDown" && (input.key === "F5" || (input.control && (input.key || "").toLowerCase() === "r"))) {
        e.preventDefault();
        session.defaultSession.clearCache().finally(() => win.loadURL(APP_URL));
      }
      return;
    }
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

const HIDDEN_TITLES = /^(N\/A|S\/O|OleMainThreadWndName|Default IME|MSCTFIME UI|DDE Server Window|GDI\+ Window.*|\.NET-BroadcastEventWindow.*|Hidden Window|CicMarshalWnd|SystemResourceNotifyWindow|Chrome_WidgetWin_\d|MediaContextNotificationWindow|Battery Meter|Program Manager)$/i;
function scanForbidden() {
  return new Promise((resolve) => {
    if (process.platform !== "win32") return resolve([]);
    execFile("tasklist", ["/v", "/fo", "csv", "/nh"], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
      if (err) return resolve([]);
      const rows = out.split(/\r?\n/).map((l) => l.split('","').map((c) => c.replace(/^"|"$/g, "")));
      const found = {};
      for (const r of rows) {
        const image = (r[0] || "").toLowerCase();
        const title = (r[r.length - 1] || "").trim();
        const app = (config.forbidden || []).find((f) => f.process.toLowerCase() === image);
        if (app && title && !HIDDEN_TITLES.test(title)) found[app.label] = { title, process: app.process };
      }
      resolve(Object.entries(found).map(([label, v]) => ({ label, title: v.title, process: v.process })));
    });
  });
}
ipcMain.handle("forbidden-apps", () => scanForbidden());

ipcMain.handle("close-forbidden", async () => {
  const apps = await scanForbidden();
  const closed = [];
  for (const a of apps) {
    await new Promise((resolve) => execFile("taskkill", ["/IM", a.process, "/F", "/T"], { windowsHide: true }, (err) => { if (!err) closed.push(a.label); log(`taskkill ${a.process}: ${err ? "échec" : "ok"}`); resolve(); }));
  }
  return { closed, remaining: await scanForbidden() };
});

ipcMain.handle("check-local-exit", (_e, code) => !!config.emergencyCode && String(code).trim() === String(config.emergencyCode));

function expandEnv(p) { return p.replace(/%([^%]+)%/g, (_, k) => process.env[k] || ""); }
function globOne(pattern) {
  const parts = expandEnv(pattern).split(/[\\/]+/);
  let candidates = [parts[0] + "\\"];
  for (const part of parts.slice(1)) {
    const next = [];
    const re = new RegExp("^" + part.replace(/[.+^${}()|[\]]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
    for (const base of candidates) {
      let entries = [];
      try { entries = fs.readdirSync(base); } catch (e) { continue; }
      for (const name of entries) if (re.test(name)) next.push(path.join(base, name));
    }
    candidates = next;
    if (!candidates.length) break;
  }
  return candidates.filter((c) => { try { return fs.statSync(c).isFile(); } catch (e) { return false; } }).sort((a, b) => path.basename(a).length - path.basename(b).length || b.localeCompare(a));
}
function findExe(tool) {
  const patterns = [...(tool.search || []), ...(tool.paths || [])];
  for (const p of patterns) { const hits = globOne(p); if (hits.length) return hits[0]; }
  return null;
}
function toolProcesses(tool) { return (tool.processes || [tool.process]).filter(Boolean).map((p) => p.toLowerCase()); }

ipcMain.handle("tools-running", () => new Promise((resolve) => {
  if (process.platform !== "win32") return resolve([]);
  execFile("tasklist", ["/fo", "csv", "/nh"], { windowsHide: true }, (err, out) => {
    if (err) return resolve([]);
    const list = out.toLowerCase();
    resolve(Object.entries(config.tools || {}).filter(([, t]) => toolProcesses(t).some((p) => list.includes(`"${p}`))).map(([id]) => id));
  });
}));

ipcMain.handle("tools-installed", () => {
  const out = {};
  for (const [id, t] of Object.entries(config.tools || {})) out[id] = { installed: !!findExe(t), autoLaunch: config.autoLaunchTools !== false && t.autoLaunch !== false };
  return out;
});

ipcMain.handle("launch-tool", async (_e, id) => {
  const tool = (config.tools || {})[id];
  if (!tool) return { ok: false, reason: "Outil inconnu" };
  const exe = findExe(tool);
  if (!exe) { log(`launch-tool ${id}: introuvable`); return { ok: false, reason: `${tool.label || id} n'a pas été trouvé sur ce poste` }; }
  log(`launch-tool ${id}: ${exe}`);
  const err = await shell.openPath(exe);
  return err ? { ok: false, reason: err } : { ok: true, path: exe };
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(createWindow);
  app.on("window-all-closed", () => app.quit());
}
