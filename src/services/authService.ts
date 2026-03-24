export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role?: string;
  adminLevel?: number;
  plan?: 'free' | 'pro' | string;
  planStatus?: 'inactive' | 'active' | 'past_due' | 'canceled' | string;
  planExpiresAt?: string;
}

interface AuthResponse {
  token: string;
  user: AuthUser;
}

function resolveApiBase(): string {
  const envBase = String(import.meta.env.VITE_API_BASE_URL || '').trim();
  if (envBase && typeof window !== 'undefined') {
    try {
      const parsed = new URL(envBase);
      const envHost = parsed.hostname;
      const pageHost = window.location.hostname;
      const envIsLocal = envHost === 'localhost' || envHost === '127.0.0.1';
      const pageIsLocal = pageHost === 'localhost' || pageHost === '127.0.0.1';
      if (envIsLocal && !pageIsLocal) {
        return `${parsed.protocol}//${pageHost}:${parsed.port || '3001'}`;
      }
    } catch {
      // fall through to default behavior
    }
  }
  if (envBase) return envBase;
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }
  return 'http://localhost:3001';
}

const API_BASE = resolveApiBase();
const TOKEN_KEY = 'travel_auth_token';
const USER_KEY = 'travel_auth_user';
const AUTH_EVENT = 'travel-auth-changed';

function notifyAuthChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_EVENT));
  }
}

async function postJson<T>(path: string, payload: Record<string, string>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(`Cannot reach API at ${API_BASE}. Start backend: npm run server`);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((data as { error?: string }).error || 'Request failed'));
  }
  return data as T;
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const result = await postJson<AuthResponse>('/api/auth/register', input);
  saveSession(result);
  return result;
}

export async function loginUser(input: { identifier: string; password: string }): Promise<AuthResponse> {
  const result = await postJson<AuthResponse>('/api/auth/login', input);
  saveSession(result);
  return result;
}

export function saveSession(session: AuthResponse): void {
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  notifyAuthChanged();
}

export function setCurrentUser(user: AuthUser | null): void {
  if (!user) {
    localStorage.removeItem(USER_KEY);
  } else {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  notifyAuthChanged();
}

export function getAuthToken(): string {
  return String(localStorage.getItem(TOKEN_KEY) || '').trim();
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  notifyAuthChanged();
}

export async function logoutUser(): Promise<void> {
  const token = getAuthToken();
  try {
    if (token) {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  } finally {
    clearSession();
  }
}

export function isAuthenticated(): boolean {
  return Boolean(localStorage.getItem(TOKEN_KEY));
}

export function getCurrentUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export async function refreshMe(): Promise<AuthUser | null> {
  const token = getAuthToken();
  if (!token) return null;
  const response = await fetch(`${API_BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (!response || !response.ok) return null;
  const data = (await response.json().catch(() => ({}))) as { user?: AuthUser };
  if (!data.user) return null;
  setCurrentUser(data.user);
  return data.user;
}

export function subscribeAuthChange(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(AUTH_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(AUTH_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
