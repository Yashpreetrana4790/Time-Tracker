import { loadAuth } from './store';

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
export const API_URL = process.env.API_URL || env.MAIN_VITE_API_URL || 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** status 0 = server unreachable */
export function isNetworkError(e: unknown) {
  return e instanceof ApiError && e.status === 0;
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T>(method: string, path: string, body?: unknown | FormData): Promise<T> {
  const token = loadAuth()?.token;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, `Cannot reach server at ${API_URL}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
  }
  return data as T;
}
