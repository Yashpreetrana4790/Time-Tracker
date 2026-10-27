import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import type { TimerAction, TimerState, User } from '../shared/types';
import { api, isNetworkError, setUnauthorizedHandler } from './api';
import { loadAuth, saveAuth } from './store';
import { Tracker } from './tracker';
import { AppTray } from './tray';
import { openScreenPermissionSettings } from './screenshots';

let win: BrowserWindow | null = null;
let tray: AppTray | null = null;
let quitting = false;

const send = (channel: string, payload?: unknown) => win?.webContents.send(channel, payload);

const tracker = new Tracker({
  state: (state) => {
    send('state', state);
    tray?.update(state);
  },
  meta: (meta) => send('meta', meta),
});

function logout() {
  tracker.reset();
  saveAuth(null);
  tray?.update(null);
  send('logged-out');
}
setUnauthorizedHandler(logout);

function createWindow() {
  win = new BrowserWindow({
    width: 380,
    height: 600,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: 'Time Tracker',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
    },
  });
  win.once('ready-to-show', () => win?.show());
  // Closing the window keeps tracking in the tray; quit from the tray menu.
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win?.hide();
    }
  });
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(path.join(__dirname, '../renderer/index.html'));
}

function showWindow() {
  if (!win) createWindow();
  win?.show();
  win?.focus();
}

// ---- IPC -------------------------------------------------------------------------------------

ipcMain.handle('auth:get', async (): Promise<User | null> => {
  const saved = loadAuth();
  if (!saved) return null;
  try {
    const user = await api<User>('GET', '/me');
    saveAuth({ token: saved.token, user });
    tracker.start();
    return user;
  } catch (e) {
    // Offline: keep the stored session and retry in the background.
    if (isNetworkError(e)) {
      tracker.start();
      return saved.user;
    }
    return null;
  }
});

ipcMain.handle('auth:login', async (_e, email: string, password: string) => {
  const res = await api<{ token: string; user: User }>('POST', '/auth/login', { email, password });
  saveAuth(res);
  tracker.start();
  return res.user;
});

ipcMain.handle('auth:logout', async () => {
  logout();
});

ipcMain.handle('projects:mine', () => api('GET', '/projects/mine'));

ipcMain.handle('timer:refresh', () => tracker.refresh());

ipcMain.handle('timer:action', (_e, action: TimerAction, body?: Record<string, unknown>): Promise<TimerState> => {
  const allowed: TimerAction[] = ['clock-in', 'break', 'resume', 'switch', 'clock-out', 'ack-notice'];
  if (!allowed.includes(action)) throw new Error(`Unknown action ${action}`);
  return tracker.action(action, body ?? {});
});

ipcMain.handle('app:screen-permission', () => openScreenPermissionSettings());

// ---- Lifecycle -------------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.whenReady().then(() => {
    app.setName('Time Tracker');
    tray = new AppTray(showWindow);
    createWindow();
  });
  app.on('activate', showWindow);
  app.on('before-quit', () => {
    quitting = true;
    tracker.stop();
  });
  // Keep running in the tray when all windows are closed.
  app.on('window-all-closed', () => {});
}
