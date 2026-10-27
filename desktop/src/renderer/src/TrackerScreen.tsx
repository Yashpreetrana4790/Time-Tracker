import { useEffect, useState } from 'react';
import type { AppMeta, Project, Status, TimerAction, TimerState, User } from '../../shared/types';
import { ProjectPicker } from './ProjectPicker';
import { clockTime, hm, hms } from './format';

const PILL: Record<Status, { label: string; className: string }> = {
  OFF: { label: 'Clocked out', className: 'bg-slate-700 text-slate-300' },
  WORK: { label: 'Working', className: 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40' },
  BREAK: { label: 'Break', className: 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40' },
  IDLE: { label: 'Idle', className: 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40' },
};

/** Current time in server time, ticking every second. */
function useServerNow(state: TimerState | null) {
  const [offset, setOffset] = useState(0);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (state) setOffset(Date.parse(state.serverNow) - Date.now());
  }, [state]);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return Date.now() + offset;
}

export function TrackerScreen({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [state, setState] = useState<TimerState | null>(null);
  const [meta, setMeta] = useState<AppMeta | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const now = useServerNow(state);

  useEffect(() => {
    const offState = window.api.onState(setState);
    const offMeta = window.api.onMeta(setMeta);
    let loaded = false;
    const load = () => {
      Promise.all([window.api.refresh(), window.api.projects()]).then(
        ([s, list]) => {
          loaded = true;
          setError('');
          setState(s);
          setProjects(list);
          setProjectId((cur) => cur ?? list[0]?.id ?? null);
        },
        (e) => setError(e.message),
      );
    };
    load();
    // Keep retrying while the server is unreachable at startup.
    const retry = setInterval(() => {
      if (!loaded) load();
    }, 5000);
    return () => {
      offState();
      offMeta();
      clearInterval(retry);
    };
  }, []);

  async function run(action: TimerAction, body?: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      setState(await window.api.action(action, body));
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const status = state?.status ?? 'OFF';
  const pill = PILL[status];
  const elapsed = state?.session ? (now - Date.parse(state.session.clockIn)) / 1000 : 0;
  const inStatus = state?.current ? (now - Date.parse(state.current.start)) / 1000 : 0;

  // Server totals are as of serverNow; add the time since then to the running bucket.
  const sinceFetch = state ? Math.max(0, (now - Date.parse(state.serverNow)) / 1000) : 0;
  const today = state?.today ?? { work: 0, break: 0, idle: 0 };
  const live = {
    work: today.work + (status === 'WORK' ? sinceFetch : 0),
    break: today.break + (status === 'BREAK' ? sinceFetch : 0),
    idle: today.idle + (status === 'IDLE' ? sinceFetch : 0),
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
        <div>
          <div className="text-sm font-medium">{user.name}</div>
          <div className="text-xs text-slate-500">{user.email}</div>
        </div>
        <button
          onClick={onLogout}
          disabled={status !== 'OFF'}
          title={status !== 'OFF' ? 'Clock out before signing out' : ''}
          className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-40"
        >
          Sign out
        </button>
      </header>

      <div className="flex flex-col gap-2 px-5 pt-3">
        {state?.notice && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-200">
            <span>You were auto clocked out at {clockTime(state.notice.autoClockOutAt)}</span>
            <button className="text-xs font-semibold underline" onClick={() => run('ack-notice')}>
              OK
            </button>
          </div>
        )}
        {meta && !meta.online && (
          <div className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">
            Can't reach the server. Retrying…
          </div>
        )}
        {meta?.screenPermission === 'missing' && status !== 'OFF' && (
          <div className="rounded-lg bg-sky-500/15 px-3 py-2 text-xs leading-relaxed text-sky-200">
            <b>Screen Recording permission needed.</b> Open System Settings → Privacy &amp; Security → Screen &amp;
            System Audio Recording, enable this app (“Electron” in dev), then restart it.{' '}
            <button className="font-semibold underline" onClick={() => window.api.openScreenPermissionSettings()}>
              Open settings
            </button>
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300" onClick={() => setError('')}>
            {error}
          </div>
        )}
      </div>

      <main className="flex flex-1 flex-col items-center px-5 pt-5">
        <span className={`rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase ${pill.className}`}>
          {pill.label}
        </span>
        <div className="mt-4 font-mono text-5xl font-light tabular-nums tracking-tight">{hms(elapsed)}</div>
        <div className="mt-1 h-5 text-xs text-slate-500">
          {state?.current && `${pill.label} for ${hms(inStatus)} · since ${clockTime(state.session!.clockIn)}`}
        </div>

        <div className="mt-5 w-full">
          {status === 'OFF' || switching ? (
            <div className="flex flex-col gap-3">
              <label className="text-xs text-slate-400">{switching ? 'Switch to project' : 'Project'}</label>
              <ProjectPicker
                projects={projects}
                value={switching ? (state?.current?.projectId ?? null) : projectId}
                autoOpen={switching}
                onChange={async (id) => {
                  if (switching) {
                    if (await run('switch', { projectId: id })) setSwitching(false);
                  } else {
                    setProjectId(id);
                  }
                }}
              />
              {projects.length === 0 && (
                <p className="text-xs text-slate-500">No projects assigned to you yet. Ask an admin.</p>
              )}
              {switching ? (
                <button className="text-sm text-slate-400 hover:text-slate-200" onClick={() => setSwitching(false)}>
                  Cancel
                </button>
              ) : (
                <button
                  disabled={busy || !projectId || !state}
                  onClick={() => run('clock-in', { projectId })}
                  className="rounded-xl bg-emerald-500 py-3 text-lg font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                >
                  Clock In
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="rounded-lg bg-slate-800/70 px-3 py-2 text-center text-sm">
                <span className="text-slate-400">Project: </span>
                <span className="font-medium">{state?.current?.projectName ?? '—'}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {status === 'BREAK' ? (
                  <button
                    disabled={busy}
                    onClick={() => run('resume')}
                    className="rounded-lg bg-emerald-500 py-2.5 font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                  >
                    Resume
                  </button>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() => run('break')}
                    className="rounded-lg bg-amber-500/90 py-2.5 font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                  >
                    Break
                  </button>
                )}
                <button
                  disabled={busy || status !== 'WORK'}
                  onClick={() => setSwitching(true)}
                  className="rounded-lg bg-slate-700 py-2.5 font-semibold hover:bg-slate-600 disabled:opacity-40"
                >
                  Switch Project
                </button>
              </div>
              <button
                disabled={busy}
                onClick={() => run('clock-out')}
                className="rounded-lg border border-rose-500/50 py-2.5 font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
              >
                Clock Out
              </button>
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-slate-800 px-5 py-4">
        <div className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">Today</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Work" value={hm(live.work)} color="text-emerald-300" />
          <Stat label="Break" value={hm(live.break)} color="text-amber-300" />
          <Stat label="Idle" value={hm(live.idle)} color="text-violet-300" />
        </div>
        {!!meta?.queuedScreenshots && (
          <div className="mt-2 text-center text-[11px] text-slate-500">
            {meta.queuedScreenshots} item(s) waiting to sync
          </div>
        )}
      </footer>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg bg-slate-800/70 py-2">
      <div className={`text-sm font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
