import { useEffect, useState, type FormEvent } from 'react';
import { api, getToken, setToken } from './api';
import { Overview } from './pages/Overview';
import { Activity } from './pages/Activity';
import { Projects } from './pages/Projects';
import { SettingsPage } from './pages/Settings';

type Tab = 'overview' | 'activity' | 'projects' | 'settings';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Live overview' },
  { id: 'activity', label: 'Timeline & screenshots' },
  { id: 'projects', label: 'Projects' },
  { id: 'settings', label: 'Settings' },
];

export function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [tab, setTab] = useState<Tab>('overview');
  const [focusUser, setFocusUser] = useState<string | null>(null);

  useEffect(() => {
    const onLogout = () => setAuthed(false);
    window.addEventListener('tt:logout', onLogout);
    return () => window.removeEventListener('tt:logout', onLogout);
  }, []);

  if (!authed) return <Login onDone={() => setAuthed(true)} />;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="font-semibold">⏱ Time Tracker Admin</div>
          <nav className="flex flex-wrap gap-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  tab === t.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <button
            className="ml-auto text-sm text-slate-500 hover:text-slate-900"
            onClick={() => {
              setToken(null);
              setAuthed(false);
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {tab === 'overview' && (
          <Overview
            onOpen={(id) => {
              setFocusUser(id);
              setTab('activity');
            }}
          />
        )}
        {tab === 'activity' && <Activity initialUserId={focusUser} />}
        {tab === 'projects' && <Projects />}
        {tab === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('admin@demo.com');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const res = await api<{ token: string; user: { role: string } }>('POST', '/auth/login', { email, password });
      if (res.user.role !== 'ADMIN') throw new Error('This panel is for admins only');
      setToken(res.token);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold">Admin sign in</h1>
        <input
          className="w-full rounded-md border border-slate-300 px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
        />
        <input
          className="w-full rounded-md border border-slate-300 px-3 py-2"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
        />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button className="w-full rounded-md bg-slate-900 py-2 font-medium text-white hover:bg-slate-700">Sign in</button>
      </form>
    </div>
  );
}
