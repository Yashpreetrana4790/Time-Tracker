import { useEffect, useState } from 'react';
import { api, fileUrl, type Status, type Totals, type UserRow } from '../api';
import { hm, STATUS_STYLE, time, today } from '../format';

interface Segment {
  id: string;
  type: Exclude<Status, 'OFF'>;
  projectName: string | null;
  start: string;
  end: string | null;
}
interface Day {
  user: UserRow;
  serverNow: string;
  totals: Totals;
  byProject: { projectName: string; work: number }[];
  sessions: { id: string; clockIn: string; clockOut: string | null; closeReason: string | null; segments: Segment[] }[];
  screenshots: { id: string; takenAt: string; displayIndex: number; projectName: string | null; url: string }[];
}

export function Activity({ initialUserId }: { initialUserId: string | null }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userId, setUserId] = useState<string | null>(initialUserId);
  const [date, setDate] = useState(today());
  const [day, setDay] = useState<Day | null>(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    api<UserRow[]>('GET', '/admin/users').then((list) => {
      const employees = list.filter((u) => u.role === 'EMPLOYEE');
      setUsers(employees);
      setUserId((cur) => cur ?? employees[0]?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    const load = () =>
      api<Day>('GET', `/admin/users/${userId}/day?date=${date}`).then(
        (d) => {
          setDay(d);
          setError('');
        },
        (e) => setError(e.message),
      );
    load();
    const t = date === today() ? setInterval(load, 10_000) : undefined;
    return () => clearInterval(t);
  }, [userId, date]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <div className="mb-1 text-slate-500">Employee</div>
          <select
            className="rounded-md border border-slate-300 bg-white px-3 py-2"
            value={userId ?? ''}
            onChange={(e) => setUserId(e.target.value)}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <div className="mb-1 text-slate-500">Date</div>
          <input
            type="date"
            className="rounded-md border border-slate-300 bg-white px-3 py-2"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}

      {day && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Card label="Work" value={hm(day.totals.work)} accent="text-emerald-600" />
            <Card label="Break" value={hm(day.totals.break)} accent="text-amber-600" />
            <Card label="Idle (not counted as work)" value={hm(day.totals.idle)} accent="text-violet-600" />
            <Card label="Screenshots" value={String(day.screenshots.length)} accent="text-slate-900" />
          </div>

          {day.byProject.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-2 text-sm font-semibold">Work by project</h3>
              <div className="flex flex-wrap gap-4 text-sm">
                {day.byProject.map((p) => (
                  <div key={p.projectName}>
                    <span className="text-slate-500">{p.projectName}:</span> <b>{hm(p.work)}</b>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold">Sessions</h3>
            {day.sessions.length === 0 && <p className="text-sm text-slate-500">No activity on this day.</p>}
            <div className="space-y-6">
              {day.sessions.map((s) => (
                <SessionView key={s.id} session={s} serverNow={day.serverNow} />
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold">Screenshots</h3>
            {day.screenshots.length === 0 && <p className="text-sm text-slate-500">No screenshots.</p>}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {day.screenshots.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setZoom(fileUrl(s.url))}
                  className="overflow-hidden rounded-lg border border-slate-200 text-left hover:ring-2 hover:ring-sky-400"
                >
                  <img src={fileUrl(s.url)} loading="lazy" className="aspect-video w-full bg-slate-100 object-cover" />
                  <div className="px-2 py-1.5 text-xs">
                    <div className="font-medium">
                      {time(s.takenAt)}
                      {s.displayIndex > 0 && <span className="text-slate-400"> · screen {s.displayIndex + 1}</span>}
                    </div>
                    <div className="truncate text-slate-500">{s.projectName ?? '—'}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6" onClick={() => setZoom(null)}>
          <img src={zoom} className="max-h-full max-w-full rounded-lg shadow-2xl" />
        </div>
      )}
    </section>
  );
}

function Card({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${accent}`}>{value}</div>
    </div>
  );
}

function SessionView({ session, serverNow }: { session: Day['sessions'][number]; serverNow: string }) {
  const start = Date.parse(session.clockIn);
  const end = Date.parse(session.clockOut ?? serverNow);
  const span = Math.max(1, end - start);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <b>
          {time(session.clockIn)} → {session.clockOut ? time(session.clockOut) : 'now'}
        </b>
        {!session.clockOut && <span className="rounded bg-emerald-100 px-1.5 text-xs text-emerald-700">open</span>}
        {session.closeReason === 'IDLE_TIMEOUT' && (
          <span className="rounded bg-violet-100 px-1.5 text-xs text-violet-700">auto clocked out (idle)</span>
        )}
      </div>
      <div className="flex h-6 w-full overflow-hidden rounded-md bg-slate-100">
        {session.segments.map((seg) => {
          const s = Date.parse(seg.start);
          const e = Date.parse(seg.end ?? serverNow);
          return (
            <div
              key={seg.id}
              title={`${STATUS_STYLE[seg.type].label} ${time(seg.start)}–${seg.end ? time(seg.end) : 'now'} ${seg.projectName ?? ''}`}
              className={`${STATUS_STYLE[seg.type].bar} border-r border-white/60`}
              style={{ width: `${((e - s) / span) * 100}%` }}
            />
          );
        })}
      </div>
      <table className="mt-3 w-full text-xs">
        <tbody className="divide-y divide-slate-100">
          {session.segments.map((seg) => (
            <tr key={seg.id}>
              <td className="py-1.5 pr-3">
                <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_STYLE[seg.type].pill}`}>
                  {STATUS_STYLE[seg.type].label}
                </span>
              </td>
              <td className="py-1.5 pr-3 tabular-nums">
                {time(seg.start)} – {seg.end ? time(seg.end) : 'now'}
              </td>
              <td className="py-1.5 pr-3 tabular-nums">{hm((Date.parse(seg.end ?? serverNow) - Date.parse(seg.start)) / 1000)}</td>
              <td className="py-1.5 text-slate-500">{seg.projectName ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
