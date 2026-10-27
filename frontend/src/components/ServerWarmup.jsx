import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import axios from "axios";
import { API } from "@/lib/api";

export const ServerWarmup = () => {
  const [state, setState] = useState("idle");
  useEffect(() => {
    let slow = setTimeout(() => setState("waking"), 2500);
    const t0 = Date.now();
    axios.get(`${API}/`, { timeout: 90000 })
      .then(() => { clearTimeout(slow); if (Date.now() - t0 > 2500) { setState("ready"); setTimeout(() => setState("idle"), 2500); } else setState("idle"); })
      .catch(() => { clearTimeout(slow); setState("down"); });
    return () => clearTimeout(slow);
  }, []);
  if (state === "idle") return null;
  const cls = state === "down" ? "bg-rose-700" : state === "ready" ? "bg-emerald-700" : "bg-amber-600";
  return (
    <div className={`fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white shadow-md ${cls}`} role="status" data-testid="server-warmup-banner">
      {state === "waking" && <><Loader2 className="h-4 w-4 animate-spin" />Le serveur démarre… cela peut prendre jusqu'à une minute la première fois. Merci de patienter.</>}
      {state === "ready" && "Serveur prêt."}
      {state === "down" && "Le serveur ne répond pas. Réessayez dans une minute ou prévenez le service informatique."}
    </div>
  );
};
