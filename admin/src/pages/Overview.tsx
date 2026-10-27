import { useEffect, useState } from 'react';
import { api, type Status, type Totals } from '../api';
import { hm, STATUS_STYLE, time } from '../format';

interface Row {
  id: string;
  name: string;
  email: string;
  status: Status;
  projectName: string | null;
  clockIn: string | null;
  statusSince: string | null;
  today: Totals;
  lastScreenshotAt: string | null;
}

export function Overview({ onOpen }: { onOpen: (userId: string) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = () =>
      api<{ employees: Row[] }>('GET', '/admin/overview').then(
        (r) => {
          setRows(r.employees);
          setError('');
        },
        (e) => setError(e.message),
      );
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">Employees right now</h2>
        <span className="text-xs text-slate-500">Auto-refreshes every 5s</span>
      </div>
      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3 text-right">Work today</th>
              <th className="px-4 py-3 text-right">Break</th>
              <th className="px-4 py-3 text-right">Idle</th>
              <th className="px-4 py-3">Last screenshot</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-slate-500">{r.email}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[r.status].pill}`}>
                    {STATUS_STYLE[r.status].label}
                  </span>
                  {r.statusSince && <div className="mt-1 text-xs text-slate-500">since {time(r.statusSince)}</div>}
                </td>
                <td className="px-4 py-3">{r.projectName ?? '—'}</td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">{hm(r.today.work)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{hm(r.today.break)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{hm(r.today.idle)}</td>
                <td className="px-4 py-3 text-slate-600">{r.lastScreenshotAt ? time(r.lastScreenshotAt) : '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button className="text-sm font-medium text-sky-700 hover:underline" onClick={() => onOpen(r.id)}>
                    View day →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
