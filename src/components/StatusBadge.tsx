const COLORS: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-600",
  PROCESSING: "bg-amber-100 text-amber-700",
  DONE: "bg-green-100 text-green-700",
  ERROR: "bg-red-100 text-red-700",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COLORS[status] ?? ""}`}>{label}</span>;
}
