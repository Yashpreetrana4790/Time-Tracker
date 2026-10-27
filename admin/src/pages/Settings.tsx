import { useEffect, useState } from 'react';
import { api } from '../api';

interface Settings {
  idleThresholdSec: number;
  autoClockOutSec: number;
  screenshotIntervalSec: number;
}

const FIELDS: { key: keyof Settings; label: string; help: string }[] = [
  { key: 'idleThresholdSec', label: 'Idle threshold', help: 'No keyboard/mouse input for this long → Idle.' },
  { key: 'autoClockOutSec', label: 'Auto clock-out after idle', help: 'Idle this long → clocked out at idle start.' },
  { key: 'screenshotIntervalSec', label: 'Screenshot interval', help: 'One screenshot at a random moment per window.' },
];

export function SettingsPage() {
  const [values, setValues] = useState<Record<keyof Settings, string> | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api<Settings>('GET', '/admin/settings').then((s) =>
      setValues({
        idleThresholdSec: String(s.idleThresholdSec / 60),
        autoClockOutSec: String(s.autoClockOutSec / 60),
        screenshotIntervalSec: String(s.screenshotIntervalSec / 60),
      }),
    );
  }, []);

  if (!values) return null;

  return (
    <section className="max-w-xl space-y-4">
      <h2 className="text-xl font-semibold">Tracking settings</h2>
      <p className="text-sm text-slate-500">
        Values are in minutes (decimals allowed). Desktop apps pick up changes within ~30 seconds.
      </p>
      <form
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setMessage('');
          try {
            await api('PUT', '/admin/settings', {
              idleThresholdSec: Math.round(Number(values.idleThresholdSec) * 60),
              autoClockOutSec: Math.round(Number(values.autoClockOutSec) * 60),
              screenshotIntervalSec: Math.round(Number(values.screenshotIntervalSec) * 60),
            });
            setMessage('Saved');
          } catch (err) {
            setMessage((err as Error).message);
          }
        }}
      >
        {FIELDS.map((f) => (
          <label key={f.key} className="block text-sm">
            <div className="font-medium">{f.label}</div>
            <div className="mb-1 text-xs text-slate-500">{f.help}</div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.5"
                min="0.5"
                className="w-32 rounded-md border border-slate-300 px-3 py-2"
                value={values[f.key]}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              />
              <span className="text-slate-500">min</span>
            </div>
          </label>
        ))}
        <div className="flex items-center gap-3">
          <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">Save</button>
          {message && <span className="text-sm text-slate-600">{message}</span>}
        </div>
      </form>
    </section>
  );
}
