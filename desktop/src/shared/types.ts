export type Status = 'OFF' | 'WORK' | 'BREAK' | 'IDLE';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'EMPLOYEE';
}

export interface Project {
  id: string;
  name: string;
}

export interface Settings {
  idleThresholdSec: number;
  autoClockOutSec: number;
  screenshotIntervalSec: number;
}

export interface TimerState {
  serverNow: string;
  status: Status;
  settings: Settings;
  session: { id: string; clockIn: string } | null;
  current: { type: Exclude<Status, 'OFF'>; start: string; projectId: string | null; projectName: string | null } | null;
  today: { work: number; break: number; idle: number };
  notice: { autoClockOutAt: string } | null;
}

/** Things only the desktop knows about (not part of the server state). */
export interface AppMeta {
  online: boolean;
  screenPermission: 'granted' | 'missing' | 'n/a';
  queuedScreenshots: number;
}

export type TimerAction = 'clock-in' | 'break' | 'resume' | 'switch' | 'clock-out' | 'ack-notice';

export interface DesktopApi {
  getAuth(): Promise<User | null>;
  login(email: string, password: string): Promise<User>;
  logout(): Promise<void>;
  projects(): Promise<Project[]>;
  refresh(): Promise<TimerState>;
  action(action: TimerAction, body?: Record<string, unknown>): Promise<TimerState>;
  openScreenPermissionSettings(): Promise<void>;
  onState(cb: (state: TimerState) => void): () => void;
  onMeta(cb: (meta: AppMeta) => void): () => void;
  onLoggedOut(cb: () => void): () => void;
}
