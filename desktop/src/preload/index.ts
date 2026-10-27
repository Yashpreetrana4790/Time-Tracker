import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { DesktopApi } from '../shared/types';

function subscribe<T>(channel: string, cb: (payload: T) => void) {
  const handler = (_e: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

// Errors thrown in the main process arrive as "Error invoking remote method 'x': Error: msg".
async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  try {
    return await ipcRenderer.invoke(channel, ...args);
  } catch (e) {
    const message = String((e as Error).message).replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '');
    throw new Error(message);
  }
}

const api: DesktopApi = {
  getAuth: () => invoke('auth:get'),
  login: (email, password) => invoke('auth:login', email, password),
  logout: () => invoke('auth:logout'),
  projects: () => invoke('projects:mine'),
  refresh: () => invoke('timer:refresh'),
  action: (action, body) => invoke('timer:action', action, body),
  openScreenPermissionSettings: () => invoke('app:screen-permission'),
  onState: (cb) => subscribe('state', cb),
  onMeta: (cb) => subscribe('meta', cb),
  onLoggedOut: (cb) => subscribe('logged-out', () => cb()),
};

contextBridge.exposeInMainWorld('api', api);
