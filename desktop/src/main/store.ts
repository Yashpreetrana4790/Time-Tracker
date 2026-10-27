import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { User } from '../shared/types';

interface Saved {
  token: string;
  user: User;
}

const file = () => path.join(app.getPath('userData'), 'auth.json');

export function loadAuth(): Saved | null {
  try {
    return JSON.parse(fs.readFileSync(file(), 'utf8')) as Saved;
  } catch {
    return null;
  }
}

export function saveAuth(auth: Saved | null) {
  if (auth) fs.writeFileSync(file(), JSON.stringify(auth), { mode: 0o600 });
  else fs.rmSync(file(), { force: true });
}
