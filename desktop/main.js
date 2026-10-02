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

const HIDDEN_TITLES = /^(N\/A|S\/O|OLE\w*|Default IME|MSCTFIME UI|DDE Server Window|GDI\+ Window.*|\.NET-BroadcastEventWindow.*|Hidden Window|CicMarshalWnd|SystemResourceNotifyWindow|Chrome_WidgetWin_\d|MediaContextNotificationWindow|Battery Meter|Program Manager|Windows Push Notifications Platform|.*Broker.*)$/i;
const PS_EXE = fs.existsSync("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe") ? "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" : "powershell";

function scanForbiddenTasklist() {
  return new Promise((resolve) => {
    execFile("tasklist", ["/v", "/fo", "csv", "/nh"], { windowsHide: true, timeout: 20000, maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
      if (err) { log(`scanForbidden(tasklist): échec (${(err.message || "").split("\n")[0]})`); return resolve([]); }
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

function scanForbidden() {
  return new Promise((resolve) => {
    if (process.platform !== "win32") return resolve([]);
    const names = (config.forbidden || []).map((f) => f.process.replace(/\.exe$/i, "").replace(/'/g, "''"));
    if (!names.length) return resolve([]);
    const ps = `$ErrorActionPreference='SilentlyContinue'; $r = @(Get-Process -Name ${names.map((n) => `'${n}'`).join(",")} | Where-Object { $_.MainWindowTitle -and $_.MainWindowTitle.Trim() -ne '' } | Select-Object ProcessName,MainWindowTitle); Write-Output (ConvertTo-Json -InputObject $r -Compress)`;
    const t0 = Date.now();
    execFile(PS_EXE, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps], { windowsHide: true, timeout: 10000, maxBuffer: 4 * 1024 * 1024 }, async (err, out, stderr) => {
      let rows = null;
      if (!err) { try { const j = JSON.parse(String(out || "").trim() || "[]"); rows = Array.isArray(j) ? j : [j]; } catch (e) { rows = null; } }
      if (rows === null) {
        log(`scanForbidden(ps): échec (${err ? (err.message || "").split("\n")[0] : "sortie illisible"}) ${String(stderr || "").slice(0, 200)} → repli tasklist`);
        const viaTasklist = await scanForbiddenTasklist();
        log(`scanForbidden(tasklist): ${viaTasklist.length} trouvée(s) en ${Date.now() - t0} ms`);
        return resolve(viaTasklist);
      }
      const found = {};
      for (const r of rows) {
        const title = String(r.MainWindowTitle || "").trim();
        const app = (config.forbidden || []).find((f) => f.process.replace(/\.exe$/i, "").toLowerCase() === String(r.ProcessName || "").toLowerCase());
        if (app && title && !HIDDEN_TITLES.test(title)) found[app.label] = { title, process: app.process };
      }
      log(`scanForbidden(ps): ${Object.keys(found).length} trouvée(s) sur ${rows.length} fenêtre(s) en ${Date.now() - t0} ms`);
      resolve(Object.entries(found).map(([label, v]) => ({ label, title: v.title, process: v.process })));
    });
  });
}
ipcMain.handle("forbidden-apps", () => scanForbidden());

ipcMain.handle("close-forbidden", async () => {
  const apps = await scanForbidden();
  const kill = (a) => new Promise((resolve) => {
    const t0 = Date.now();
    execFile("taskkill", ["/IM", a.process, "/F"], { windowsHide: true, timeout: 6000 }, (err, out) => {
      log(`taskkill ${a.process}: ${err ? `échec (${(err.message || "").split("\n")[0]})` : "ok"} en ${Date.now() - t0} ms`);
      if (!err) return resolve(a.label);
      const name = a.process.replace(/\.exe$/i, "");
      execFile(PS_EXE, ["-NoProfile", "-NonInteractive", "-Command", `Get-Process -Name '${name}' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue`], { windowsHide: true, timeout: 8000 }, (err2) => {
        log(`Stop-Process ${name}: ${err2 ? "échec" : "ok"}`);
        resolve(err2 ? null : a.label);
      });
    });
  });
  const results = await Promise.all(apps.map(kill));
  await new Promise((r) => setTimeout(r, 1200));
  return { closed: results.filter(Boolean), remaining: await scanForbidden() };
});

function bringToFront(exePath) {
  const name = path.basename(exePath, path.extname(exePath));
  const ps = `$deadline=(Get-Date).AddSeconds(8); do { $p=Get-Process -Name '${name}' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1; if ($p) { break }; Start-Sleep -Milliseconds 400 } while ((Get-Date) -lt $deadline); if ($p) { Add-Type @'
using System; using System.Runtime.InteropServices;
public class W { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c); }
'@; [W]::ShowWindow($p.MainWindowHandle, 9) | Out-Null; [W]::SetForegroundWindow($p.MainWindowHandle) | Out-Null; 'ok' } else { 'nowindow' }`;
  return new Promise((resolve) => execFile(PS_EXE, ["-NoProfile", "-NonInteractive", "-Command", ps], { windowsHide: true, timeout: 12000 }, (err, out) => { log(`bringToFront ${name}: ${err ? "échec" : String(out).trim()}`); resolve(!err); }));
}

ipcMain.handle("check-local-exit", (_e, code) => !!config.emergencyCode && String(code).trim() === String(config.emergencyCode));

let antidotePortCache = { port: 0, at: 0 };
function connectixConsole() {
  return new Promise((resolve) => {
    execFile("reg", ["query", "HKLM\\SOFTWARE\\Druide informatique inc.\\Connectix", "/v", "DossierConnectix"], { windowsHide: true }, (err, out) => {
      const m = !err && out.match(/DossierConnectix\s+REG_\w+\s+(.+)/);
      const fromReg = m ? path.join(m[1].trim(), "AgentConnectixConsole.exe") : null;
      if (fromReg && fs.existsSync(fromReg)) return resolve(fromReg);
      for (const p of ["C:\\Program Files\\Druide\\Connectix*\\Application\\Bin64\\AgentConnectixConsole.exe", "C:\\Program Files\\Druide\\Connectix*\\Application\\Bin\\AgentConnectixConsole.exe", "C:\\Program Files (x86)\\Druide\\Connectix*\\Application\\Bin\\AgentConnectixConsole.exe", "C:\\Program Files\\Druide\\Antidote*\\Application\\Bin64\\AgentConnectixConsole.exe"]) {
        const hits = globOne(p);
        if (hits.length) return resolve(hits[0]);
      }
      resolve(null);
    });
  });
}
ipcMain.handle("antidote-port", async () => {
  if (process.platform !== "win32") return 0;
  if (antidotePortCache.port && Date.now() - antidotePortCache.at < 60000) return antidotePortCache.port;
  const exe = await connectixConsole();
  if (!exe) { log("antidote-port: AgentConnectixConsole introuvable"); return 0; }
  return new Promise((resolve) => {
    execFile(exe, ["--api"], { windowsHide: true, timeout: 8000 }, (err, out) => {
      let port = 0;
      try { port = Number(JSON.parse(String(out || "").trim()).port) || 0; } catch (e) { const m = String(out || "").match(/"port"\s*:\s*(\d+)/); port = m ? Number(m[1]) : 0; }
      log(`antidote-port: ${exe} → ${port}${err ? ` (${err.message})` : ""}`);
      antidotePortCache = { port, at: Date.now() };
      resolve(port);
    });
  });
});

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
  if (err) return { ok: false, reason: err };
  const wasOnTop = win.isAlwaysOnTop();
  if (wasOnTop) win.setAlwaysOnTop(false);
  bringToFront(exe).then(() => { if (wasOnTop && locked) setTimeout(() => win.setAlwaysOnTop(false), 0); });
  return { ok: true, path: exe };
});

ipcMain.handle("focus-tool", async (_e, id) => {
  const tool = (config.tools || {})[id];
  const exe = tool && findExe(tool);
  if (!exe) return false;
  if (win.isAlwaysOnTop()) win.setAlwaysOnTop(false);
  return bringToFront(exe);
});

ipcMain.handle("quit-app", () => { log("quit-app demandé après remise"); locked = false; setTimeout(() => app.quit(), 200); return true; });

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(createWindow);
  app.on("window-all-closed", () => app.quit());
}
