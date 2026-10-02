import { EVENT_LABELS } from "@/lib/tools";

const WEB_TOOL_RE = /outil autorisé : (.+)$/;

export const fmtDur = (s) => {
  s = Math.round(s || 0);
  if (s >= 3600) return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
  if (s >= 60) return `${Math.floor(s / 60)} min ${s % 60} s`;
  return `${s} s`;
};

// Résume l'utilisation des logiciels/outils d'aide à partir des événements d'une session
export function toolUsage(session) {
  const ev = [...(session.events || [])].sort((a, b) => new Date(a.at) - new Date(b.at));
  const end = new Date(session.submitted_at || ev[ev.length - 1]?.at || Date.now());
  const tools = {};
  const get = (name) => (tools[name] ||= { name, opens: 0, seconds: 0, actions: 0, details: [] });

  const openSince = {};
  for (const e of ev) {
    const t = new Date(e.at);
    if (e.type === "tool_opened") {
      const names = e.detail.replace(/^Déjà ouvert\(s\) au début : /, "").replace(/ est ouvert sur le poste$/, "").split(/,\s*/);
      names.forEach((n) => { const k = n.trim(); if (!k) return; get(k).opens += 1; openSince[k] ||= t; });
    } else if (e.type === "tool_closed") {
      const k = e.detail.replace(/ a été fermé$/, "").trim();
      if (openSince[k]) { get(k).seconds += (t - openSince[k]) / 1000; delete openSince[k]; }
    } else if (e.type === "tool_launch") {
      const m = e.detail.match(/(Antidote|WordQ|Lexibar)/);
      if (m) get(m[1]).actions += 1;
    } else if (e.type === "tool_focus") {
      const m = e.detail.match(WEB_TOOL_RE);
      if (m) { const u = get(m[1]); u.opens += 1; u._pending = t; }
      else { const last = Object.values(tools).find((u) => u._pending); if (!last) { const anyWeb = Object.values(tools).filter((u) => u.web).pop(); if (anyWeb) anyWeb._pending = t; } }
      Object.values(tools).forEach((u) => { if (u._pending === t) u.web = true; });
    } else if (e.type === "returned" && e.seconds) {
      const u = Object.values(tools).find((x) => x._pending);
      if (u) { u.seconds += e.seconds; u._pending = null; }
    } else if (e.type === "antidote_correct") {
      const u = get("Antidote"); u.actions += 1; u.details.push("correcteur");
    } else if (e.type === "antidote_dict" || e.type === "antidote_guide") {
      const u = get("Antidote"); u.actions += 1; u.details.push(e.type === "antidote_dict" ? "dictionnaires" : "guides");
    } else if (e.type === "clipboard_tool" && e.text) {
      get("Copier/coller (zone de réponse)").actions += 1;
    }
  }
  Object.entries(openSince).forEach(([k, since]) => { get(k).seconds += Math.max(0, (end - since) / 1000); get(k).stillOpen = true; });
  return Object.values(tools).map((u) => {
    const counts = u.details.reduce((a, d) => ((a[d] = (a[d] || 0) + 1), a), {});
    return { ...u, detailText: Object.entries(counts).map(([d, n]) => `${d} ×${n}`).join(", ") };
  });
}

export const usageLabel = (u) => {
  const parts = [];
  if (u.seconds > 0) parts.push(u.stillOpen ? `ouvert ${fmtDur(u.seconds)} (jusqu'à la fin)` : `ouvert ${fmtDur(u.seconds)}`);
  if (u.opens > 1 && !u.web) parts.push(`${u.opens} ouvertures`);
  if (u.web && u.opens) parts.push(`${u.opens} consultation(s)`);
  if (u.actions) parts.push(`${u.actions} utilisation(s)${u.detailText ? ` (${u.detailText})` : ""}`);
  return parts.join(" · ") || EVENT_LABELS.tool_opened;
};
