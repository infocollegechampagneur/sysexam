import { Wrench } from "lucide-react";
import { toolUsage, usageLabel } from "@/lib/toolUsage";

export const ToolUsageCard = ({ session }) => {
  const usage = toolUsage(session);
  if (!usage.length) return null;
  return (
    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4" data-testid="tool-usage">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-900"><Wrench className="h-4 w-4" />Logiciels et outils d'aide utilisés</p>
      <ul className="space-y-1 text-sm text-emerald-950">
        {usage.map((u, i) => <li key={u.name} className="flex flex-wrap gap-x-2" data-testid={`tool-usage-${i}`}><span className="font-medium">{u.name}</span><span className="text-emerald-800">{usageLabel(u)}</span></li>)}
      </ul>
    </div>
  );
};
