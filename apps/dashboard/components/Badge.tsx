import type { DeploymentState } from "@velour/db";

const styles: Record<DeploymentState, string> = {
  queued:      "bg-zinc-100 text-zinc-600 border-zinc-200",
  building:    "bg-blue-50 text-blue-700 border-blue-200",
  deploying:   "bg-amber-50 text-amber-700 border-amber-200",
  live:        "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed:      "bg-red-50 text-red-700 border-red-200",
  stopped:     "bg-zinc-100 text-zinc-500 border-zinc-200",
  rolled_back: "bg-orange-50 text-orange-700 border-orange-200",
};

const dots: Record<DeploymentState, string> = {
  queued:      "bg-zinc-400",
  building:    "bg-blue-500 animate-pulse",
  deploying:   "bg-amber-500 animate-pulse",
  live:        "bg-emerald-500",
  failed:      "bg-red-500",
  stopped:     "bg-zinc-400",
  rolled_back: "bg-orange-500",
};

export function Badge({ state }: { state: DeploymentState }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[state]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dots[state]}`} />
      {state.replace("_", " ")}
    </span>
  );
}
