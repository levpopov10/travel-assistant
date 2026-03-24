import { getAuthToken } from './authService';

export interface SearchHistoryEntry {
  id: string;
  origin: string;
  destination: string;
  createdAt: string;
}

interface SearchHistoryResponse {
  history: SearchHistoryEntry[];
}

function resolveCandidates(): string[] {
  const envBase = String(import.meta.env.VITE_API_BASE_URL || '').trim();
  const result: string[] = [];
  if (envBase && typeof window !== 'undefined') {
    try {
      const parsed = new URL(envBase);
      const envHost = parsed.hostname;
      const pageHost = window.location.hostname;
      const envIsLocal = envHost === 'localhost' || envHost === '127.0.0.1';
      const pageIsLocal = pageHost === 'localhost' || pageHost === '127.0.0.1';
      if (envIsLocal && !pageIsLocal) {
        result.push(`${parsed.protocol}//${pageHost}:${parsed.port || '3001'}`);
      }
    } catch {
      // ignore and keep raw env fallback below
    }
  }
  if (envBase) result.push(envBase);
  if (typeof window !== 'undefined') {
    const hostBase = `${window.location.protocol}//${window.location.hostname}`;
    result.push(`${hostBase}:3002`);
    result.push(`${hostBase}:3001`);
  } else {
    result.push('http://localhost:3002');
    result.push('http://localhost:3001');
  }
  return Array.from(new Set(result));
}

let cachedApiBase = '';
let resolvePromise: Promise<string> | null = null;

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(init?.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(input, {
    ...init,
    headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((data as { error?: string }).error || `Request failed (${response.status})`));
  }
  return data as T;
}

async function isReachable(base: string): Promise<boolean> {
  try {
    const response = await fetch(`${base}/api/search?site=airbnb&destination=__probe__`);
    return response.status > 0;
  } catch {
    return false;
  }
}

async function resolveApiBase(): Promise<string> {
  if (cachedApiBase) return cachedApiBase;
  if (resolvePromise) return resolvePromise;

  resolvePromise = (async () => {
    const candidates = resolveCandidates();
    for (const base of candidates) {
      const ok = await isReachable(base);
      if (ok) {
        cachedApiBase = base;
        return base;
      }
    }
    throw new Error('History API not available. Start backend with latest code.');
  })();

  try {
    return await resolvePromise;
  } finally {
    resolvePromise = null;
  }
}

function normalizeHistory(input: unknown): SearchHistoryEntry[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      const entry = item as Partial<SearchHistoryEntry>;
      return {
        id: String(entry.id || '').trim(),
        origin: String(entry.origin || '').trim(),
        destination: String(entry.destination || '').trim(),
        createdAt: String(entry.createdAt || '').trim(),
      };
    })
    .filter((entry) => entry.destination);
}

export async function getSearchHistory(userId: string): Promise<SearchHistoryEntry[]> {
  const base = await resolveApiBase();
  const data = await fetchJson<SearchHistoryResponse>(
    `${base}/api/users/${encodeURIComponent(userId)}/search-history`
  );
  return normalizeHistory(data.history);
}

export async function addSearchHistory(
  userId: string,
  payload: { origin?: string; destination: string }
): Promise<SearchHistoryEntry[]> {
  const base = await resolveApiBase();
  const data = await fetchJson<SearchHistoryResponse>(
    `${base}/api/users/${encodeURIComponent(userId)}/search-history`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
  return normalizeHistory(data.history);
}

export async function clearSearchHistory(userId: string): Promise<SearchHistoryEntry[]> {
  const base = await resolveApiBase();
  const data = await fetchJson<SearchHistoryResponse>(
    `${base}/api/users/${encodeURIComponent(userId)}/search-history`,
    { method: 'DELETE' }
  );
  return normalizeHistory(data.history);
}

export async function removeSearchHistoryItem(
  userId: string,
  entry: SearchHistoryEntry
): Promise<SearchHistoryEntry[]> {
  const base = await resolveApiBase();
  const entryId = String(entry?.id || '').trim();
  const data = await fetchJson<SearchHistoryResponse>(
    `${base}/api/users/${encodeURIComponent(userId)}/search-history/${encodeURIComponent(entryId)}`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: entry.origin,
        destination: entry.destination,
        createdAt: entry.createdAt,
      }),
    }
  );
  return normalizeHistory(data.history);
}
