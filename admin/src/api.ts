export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const TOKEN_KEY = 'tt_admin_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    setToken(null);
    window.dispatchEvent(new Event('tt:logout'));
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

/** Screenshot files need the token as a query param because <img> can't send headers. */
export const fileUrl = (path: string) => `${API_URL}${path}?token=${encodeURIComponent(getToken() ?? '')}`;

export type Status = 'OFF' | 'WORK' | 'BREAK' | 'IDLE';
export interface Totals {
  work: number;
  break: number;
  idle: number;
}
export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'EMPLOYEE';
}
