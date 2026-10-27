export function hm(totalSec: number) {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export const time = (iso: string | Date) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const STATUS_STYLE = {
  OFF: { label: 'Clocked out', pill: 'bg-slate-100 text-slate-600', bar: 'bg-slate-300' },
  WORK: { label: 'Working', pill: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500' },
  BREAK: { label: 'Break', pill: 'bg-amber-100 text-amber-700', bar: 'bg-amber-400' },
  IDLE: { label: 'Idle', pill: 'bg-violet-100 text-violet-700', bar: 'bg-violet-400' },
} as const;
