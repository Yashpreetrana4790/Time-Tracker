import { useEffect, useState } from 'react';
import type { User } from '../../shared/types';
import { Login } from './Login';
import { TrackerScreen } from './TrackerScreen';

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    window.api.getAuth().then(setUser, () => setUser(null));
    return window.api.onLoggedOut(() => setUser(null));
  }, []);

  if (user === undefined) {
    return <div className="flex h-full items-center justify-center text-slate-400">Loading…</div>;
  }
  if (!user) return <Login onLogin={setUser} />;
  return (
    <TrackerScreen
      user={user}
      onLogout={async () => {
        await window.api.logout();
        setUser(null);
      }}
    />
  );
}
