const BASE = '/api';
const TOKEN_KEY = 'itsm.token';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const tokenStore = {
  get: (): string | null => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string) => {
    try {
      localStorage.setItem(TOKEN_KEY, t);
    } catch {
      /* storage unavailable */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable */
    }
  },
};

/** Thin typed wrapper around fetch that attaches the JWT and turns API errors into ApiError. */
export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_FAILURE', 'Cannot reach the I-ITSM server. Check your connection and that the API is running.');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error ?? {};
    if (res.status === 401 && token && !path.startsWith('/auth/')) {
      tokenStore.clear();
      window.location.assign('/login');
    }
    throw new ApiError(res.status, err.code ?? 'ERROR', err.message ?? `Request failed (${res.status})`, err.details);
  }
  return data as T;
}

/** Downloads a file from an authenticated endpoint (e.g. the CSV export). */
export async function download(path: string, filename: string): Promise<void> {
  const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${tokenStore.get() ?? ''}` } });
  if (!res.ok) throw new ApiError(res.status, 'DOWNLOAD_FAILED', 'Download failed');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : '';
};
