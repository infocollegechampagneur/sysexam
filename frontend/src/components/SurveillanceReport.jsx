import { EVENT_LABELS, SESSION_LABELS, fmtTime } from "@/lib/tools";
import { CATS } from "@/components/ActivitySummary";
import { toolUsage, usageLabel } from "@/lib/toolUsage";

const th = { border: "1px solid #cbd5e1", padding: "4px 6px", background: "#f1f5f9", textAlign: "left", fontSize: 11 };
const td = { border: "1px solid #cbd5e1", padding: "4px 6px", fontSize: 11, verticalAlign: "top" };
const awayOf = (events) => Math.round(events.filter((e) => e.type === "returned" && e.seconds).reduce((a, e) => a + e.seconds, 0));
const fmtAway = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`);
const toolsSummary = (s) => toolUsage(s).map((u) => `${u.name} : ${usageLabel(u)}`);

const StudentPage = ({ exam, s }) => {
  const ev = s.events || [];
  const tools = toolsSummary(s);
  return (
    <div style={{ breakInside: "avoid-page" }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px" }}>{s.student_name} {s.student_number && `(${s.student_number})`}</h3>
      <p style={{ fontSize: 11, margin: "0 0 8px", color: "#334155" }}>
        Statut : {SESSION_LABELS[s.status]} · Début : {fmtTime(s.started_at)} · Remise : {fmtTime(s.submitted_at)} · Signalements : <strong>{s.violations}</strong> / {exam.settings.max_violations + (s.allowance || 0)} · Temps hors de l'examen : {fmtAway(awayOf(ev))}
      </p>
      <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 8 }}>
        <tbody><tr>{CATS.map((c) => <td key={c.key} style={td}>{c.label} : <strong>{ev.filter((e) => c.types.includes(e.type)).length}</strong></td>)}</tr></tbody>
      </table>
      <div style={{ border: "1px solid #a7f3d0", background: "#ecfdf5", padding: "4px 6px", marginBottom: 8, fontSize: 11 }} data-testid="report-tools">
        <strong>Logiciels et outils d'aide utilisés :</strong> {tools.length ? tools.join(" · ") : "aucun"}
      </div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead><tr><th style={{ ...th, width: 90 }}>Heure</th><th style={{ ...th, width: 150 }}>Événement</th><th style={th}>Détail</th></tr></thead>
        <tbody>
          {ev.map((e, i) => (
            <tr key={i} style={{ background: e.counted ? "#fff1f2" : "white" }}>
              <td style={{ ...td, whiteSpace: "nowrap" }}>{new Date(e.at).toLocaleTimeString("fr-CA")}</td>
              <td style={{ ...td, color: e.counted ? "#be123c" : "#0f172a", fontWeight: e.counted ? 600 : 400 }}>{EVENT_LABELS[e.type] || e.type}{e.counted ? " ⚑" : ""}</td>
              <td style={td}>{e.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const SurveillanceReport = ({ exam, sessions }) => (
  <div style={{ fontFamily: "Public Sans, sans-serif", color: "#0f172a" }}>
    <div style={{ borderBottom: "2px solid #1e3a8a", paddingBottom: 8, marginBottom: 12 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Rapport de surveillance — {exam.title}</h2>
      <p style={{ fontSize: 11, margin: "4px 0 0" }}>Code {exam.code}{exam.subject ? ` · ${exam.subject}` : ""} · Généré le {fmtTime(new Date().toISOString())} · Seuil : {exam.settings.max_violations} signalement(s) · ⚑ = signalement compté</p>
    </div>
    <table style={{ borderCollapse: "collapse", width: "100%" }}>
      <thead><tr><th style={th}>Élève</th><th style={th}>Statut</th><th style={th}>Signalements</th>{CATS.slice(0, 5).map((c) => <th key={c.key} style={th}>{c.label}</th>)}<th style={th}>Temps hors examen</th><th style={th}>Outils d'aide</th></tr></thead>
      <tbody>
        {sessions.map((s) => {
          const ev = s.events || [];
          return (
            <tr key={s.id} style={{ background: s.violations ? "#fff1f2" : "white" }}>
              <td style={td}>{s.student_name}</td><td style={td}>{SESSION_LABELS[s.status]}</td><td style={td}><strong>{s.violations}</strong></td>
              {CATS.slice(0, 5).map((c) => <td key={c.key} style={td}>{ev.filter((e) => c.types.includes(e.type)).length}</td>)}
              <td style={td}>{fmtAway(awayOf(ev))}</td>
              <td style={td}>{toolsSummary(s).join(" · ") || "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
    {sessions.map((s) => (
      <div key={s.id}>
        <p className="html2pdf__page-break" style={{ margin: 0 }} />
        <StudentPage exam={exam} s={s} />
      </div>
    ))}
  </div>
);
