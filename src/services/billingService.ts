import { getAuthToken, setCurrentUser, type AuthUser } from './authService';

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
      // fall through
    }
  }
  if (envBase) return envBase;
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }
  return 'http://localhost:3001';
}

const API_BASE = resolveApiBase();

async function postAuthed<T>(path: string, body?: unknown): Promise<T> {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String((data as { error?: string }).error || 'Request failed'));
  return data as T;
}

export async function demoUpgradeToPro(): Promise<AuthUser> {
  const result = await postAuthed<{ user: AuthUser }>('/api/billing/demo/upgrade');
  setCurrentUser(result.user);
  return result.user;
}

export async function demoCancelToFree(): Promise<AuthUser> {
  const result = await postAuthed<{ user: AuthUser }>('/api/billing/demo/cancel');
  setCurrentUser(result.user);
  return result.user;
}

