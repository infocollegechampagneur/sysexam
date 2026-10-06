import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/lib/api";

export const useTeachers = () => {
  const [teachers, setTeachers] = useState([]);
  useEffect(() => { api.get("/teachers").then((r) => setTeachers(r.data)).catch(() => {}); }, []);
  return teachers;
};

export const RecipientsPicker = ({ value = [], onChange, excludeId, teachers: given, testId = "recipients" }) => {
  const fetched = useTeachers();
  const teachers = (given || fetched).filter((t) => t.id !== excludeId);
  const toggle = (id, on) => onChange(on ? [...value, id] : value.filter((x) => x !== id));
  if (!teachers.length) return <p className="text-xs text-slate-500">Aucun autre enseignant.</p>;
  return (
    <div className="grid gap-1.5 sm:grid-cols-2" data-testid={`${testId}-picker`}>
      {teachers.map((t) => (
        <label key={t.id} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${value.includes(t.id) ? "border-blue-900 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-300"}`}>
          <Checkbox checked={value.includes(t.id)} onCheckedChange={(c) => toggle(t.id, !!c)} data-testid={`${testId}-${t.id}`} />
          <span className="min-w-0 flex-1 truncate">{t.name}</span>
          {t.teams_configured && <MessageSquare className="h-3.5 w-3.5 shrink-0 text-indigo-600" title="Reçoit aussi sur Teams" />}
        </label>
      ))}
    </div>
  );
};
