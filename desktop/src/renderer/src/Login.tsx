import { useState, type FormEvent } from 'react';
import type { User } from '../../shared/types';

export function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState('emp1@demo.com');
  const [password, setPassword] = useState('emp123');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onLogin(await window.api.login(email, password));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex h-full flex-col justify-center gap-4 px-8">
      <div className="mb-4 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-2xl text-emerald-400">
          ⏱
        </div>
        <h1 className="text-xl font-semibold">Time Tracker</h1>
        <p className="text-sm text-slate-400">Sign in to start your day</p>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-400">Email</span>
        <input
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 outline-none focus:border-emerald-500"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-400">Password</span>
        <input
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 outline-none focus:border-emerald-500"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && <p className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">{error}</p>}
      <button
        disabled={busy}
        className="mt-2 rounded-lg bg-emerald-500 py-2.5 font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
