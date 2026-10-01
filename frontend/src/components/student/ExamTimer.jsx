import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";

export const ExamTimer = ({ deadline, offsetMs, onExpire }) => {
  const [left, setLeft] = useState(null);
  const fired = useRef(false);
  useEffect(() => {
    if (!deadline) return;
    const tick = () => {
      const ms = new Date(deadline).getTime() - (Date.now() + offsetMs);
      setLeft(Math.max(0, ms));
      if (ms <= 0 && !fired.current) { fired.current = true; onExpire(); }
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [deadline, offsetMs, onExpire]);
  if (!deadline || left === null) return null;
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  const low = left < 5 * 60000;
  return (
    <span className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-sm font-bold ${low ? "bg-rose-600 text-white animate-pulse" : "bg-slate-800 text-slate-100"}`} data-testid="exam-timer">
      <Clock className="h-4 w-4" />{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
};
