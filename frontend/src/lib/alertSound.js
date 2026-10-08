import { api } from "@/lib/api";

let ctx = null;
const beep = () => {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = ctx.currentTime;
    [[880, 0], [1175, 0.18], [880, 0.36]].forEach(([f, dt]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + dt); g.gain.exponentialRampToValueAtTime(0.4, t0 + dt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.17);
      o.connect(g).connect(ctx.destination); o.start(t0 + dt); o.stop(t0 + dt + 0.2);
    });
  } catch (e) { /* audio indisponible */ }
};

let cache = { at: 0, url: null };
export const alertSoundUrl = async (force = false) => {
  if (!force && Date.now() - cache.at < 60000) return cache.url;
  try {
    const r = await api.get("/alert-sound", { responseType: "blob" });
    if (cache.url) URL.revokeObjectURL(cache.url);
    cache = { at: Date.now(), url: r.status === 204 || !r.data?.size ? null : URL.createObjectURL(r.data) };
  } catch (e) { cache = { at: Date.now(), url: null }; }
  return cache.url;
};

export const playAlert = async (force = false) => {
  const url = await alertSoundUrl(force);
  if (!url) return beep();
  try { const a = new Audio(url); a.volume = 0.9; await a.play(); } catch (e) { beep(); }
};

let flashTimer = null, baseTitle = null;
export const flashTitle = (msg, count) => {
  if (!baseTitle) baseTitle = document.title;
  stopFlash();
  let on = false;
  flashTimer = setInterval(() => { on = !on; document.title = on ? `🙋 (${count}) ${msg}` : baseTitle; }, 1000);
  const stopOnFocus = () => { stopFlash(); window.removeEventListener("focus", stopOnFocus); };
  window.addEventListener("focus", stopOnFocus);
};
export const stopFlash = () => { if (flashTimer) { clearInterval(flashTimer); flashTimer = null; } if (baseTitle) document.title = baseTitle; };
