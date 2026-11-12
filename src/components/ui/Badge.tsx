import { clsx } from "clsx";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  danger: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  info: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={clsx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", toneClasses[tone])}>{children}</span>;
}

const STATUS_TONE: Record<string, Tone> = {
  PENDING: "warning",
  PENDING_LEVEL_2: "warning",
  ESCALATED: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
  PRESENT: "success",
  LATE: "warning",
  EARLY_EXIT: "warning",
  ABSENT: "danger",
  ON_LEAVE: "info",
  HOLIDAY: "neutral",
  WEEKLY_OFF: "neutral",
  WFH: "info",
  ON_DUTY: "info",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{status.replaceAll("_", " ")}</Badge>;
}
