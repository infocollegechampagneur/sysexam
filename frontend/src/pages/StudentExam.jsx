import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { studentApi, formatErr } from "@/lib/api";
import { useAntiCheat } from "@/hooks/useAntiCheat";
import { ExamIntro } from "@/components/student/ExamIntro";
import { ExamTopBar } from "@/components/student/ExamTopBar";
import { ExamBody } from "@/components/student/ExamBody";
import { LockedOverlay, FullscreenOverlay, SubmittedScreen } from "@/components/student/Overlays";

export default function StudentExam() {
  const token = sessionStorage.getItem("exam_token");
  const sapi = useMemo(() => studentApi(), [token]); // eslint-disable-line react-hooks/exhaustive-deps
  const [data, setData] = useState(null);
  const [phase, setPhase] = useState("intro");
  const [status, setStatus] = useState("in_progress");
  const [violations, setViolations] = useState(0);
  const [answers, setAnswers] = useState({});
  const [essay, setEssay] = useState("");
  const [annotations, setAnnotationsS] = useState([]);
  const [deadline, setDeadline] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const latest = useRef({ answers: {}, essay_html: "", annotations: [] });
  const dirty = useRef(false);

  useEffect(() => {
    if (!token) return;
    sapi.get("/student/session").then(({ data: d }) => {
      const ex = d.exam;
      const docInline = ex.exam_type === "document" && ex.doc_answer_mode === "inline" && ex.file?.kind === "docx";
      const essay0 = d.session.essay_html || (docInline ? ex.file.html || "" : "");
      setData({ ...d, offsetMs: new Date(d.server_now).getTime() - Date.now() });
      setDeadline(d.deadline);
      setStatus(d.session.status);
      setViolations(d.session.violations);
      setAnswers(d.session.answers || {});
      setEssay(essay0);
      setAnnotationsS(d.session.annotations || []);
      setSavedAt(d.session.last_saved_at);
      latest.current = { answers: d.session.answers || {}, essay_html: essay0, annotations: d.session.annotations || [] };
      if (d.session.status === "submitted") setPhase("submitted");
    }).catch((e) => { toast.error(formatErr(e)); sessionStorage.removeItem("exam_token"); setData(false); });
  }, [token, sapi]);

  const settings = data?.exam?.settings;

  const onEvent = useCallback(async (type, detail) => {
    try {
      const { data: r } = await sapi.post("/student/event", { type, detail });
      setViolations(r.violations);
      setStatus(r.status);
      if (r.counted) toast.warning(`Infraction ${r.violations}/${settings?.max_violations} : ${detail}`, { duration: 6000 });
    } catch (e) { /* network issue: ignore */ }
  }, [sapi, settings]);

  const { isFullscreen, enterFullscreen, openTool, closeTool, toolOpen } = useAntiCheat({ active: phase === "exam" && status === "in_progress", settings, onEvent });

  const setAnswer = (qid, v) => { setAnswers((a) => { const n = { ...a, [qid]: v }; latest.current.answers = n; return n; }); dirty.current = true; };
  const setEssayV = (v) => { setEssay(v); latest.current.essay_html = v; dirty.current = true; };
  const setAnnotations = (v) => { setAnnotationsS(v); latest.current.annotations = v; dirty.current = true; };

  useEffect(() => {
    if (phase !== "exam" || status !== "in_progress") return;
    const iv = setInterval(async () => {
      if (!dirty.current) return;
      dirty.current = false;
      try { const { data: r } = await sapi.put("/student/answers", latest.current); setSavedAt(r.last_saved_at); setDeadline(r.deadline); } catch (e) { dirty.current = true; }
    }, 8000);
    return () => clearInterval(iv);
  }, [phase, status, sapi]);

  useEffect(() => {
    if (phase !== "exam" || status !== "in_progress" || !deadline) return;
    const iv = setInterval(() => sapi.get("/student/session").then(({ data: d }) => setDeadline(d.deadline)).catch(() => {}), 30000);
    return () => clearInterval(iv);
  }, [phase, status, sapi, deadline]);

  useEffect(() => {
    if (status !== "locked") return;
    const iv = setInterval(async () => {
      const { data: d } = await sapi.get("/student/session").catch(() => ({ data: null }));
      if (d && d.session.status !== "locked") { setStatus(d.session.status); setViolations(d.session.violations); toast.success("Votre copie a été déverrouillée"); }
    }, 5000);
    return () => clearInterval(iv);
  }, [status, sapi]);

  const submit = useCallback(async () => {
    setSubmitting(true);
    try {
      await sapi.post("/student/submit", latest.current);
      setPhase("submitted");
      sessionStorage.removeItem("exam_token");
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch (e) { toast.error(formatErr(e)); } finally { setSubmitting(false); }
  }, [sapi]);

  const onExpire = useCallback(() => { toast.info("Temps écoulé : remise automatique"); submit(); }, [submit]);
  const fetchBlob = useCallback(() => sapi.get("/student/file", { responseType: "blob" }).then((r) => r.data), [sapi]);

  if (!token && phase !== "submitted") return <Navigate to="/" replace />;
  if (data === false) return <Navigate to="/" replace />;
  if (!data) return <div className="grid min-h-screen place-items-center bg-slate-950"><Loader2 className="h-6 w-6 animate-spin text-blue-400" /></div>;
  if (phase === "submitted") return <SubmittedScreen name={data.session.student_name} />;

  const { exam, session } = data;
  if (phase === "intro")
    return <div className="min-h-screen bg-slate-950 grid-paper"><ExamIntro exam={exam} session={session} onStart={() => { if (settings.require_fullscreen) enterFullscreen(); setPhase("exam"); }} /></div>;

  const needFs = settings.require_fullscreen && !isFullscreen && status === "in_progress";
  return (
    <div className="lockdown min-h-screen bg-slate-900" data-testid="exam-shell">
      <ExamTopBar exam={exam} session={session} deadline={deadline} offsetMs={data.offsetMs} savedAt={savedAt} violations={violations}
        onTool={openTool} onSubmit={submit} submitting={submitting} onExpire={onExpire} />
      {!needFs && status !== "locked" && (
        <ExamBody exam={exam} answers={answers} setAnswer={setAnswer} essay={essay} setEssay={setEssayV} fetchBlob={fetchBlob} annotations={annotations} setAnnotations={setAnnotations} />
      )}
      {status === "locked" && <LockedOverlay violations={violations} />}
      {needFs && status !== "locked" && <FullscreenOverlay toolOpen={toolOpen} onResume={enterFullscreen} onCloseTool={closeTool} />}
    </div>
  );
}
