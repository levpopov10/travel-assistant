import { getAuthToken } from './authService';

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  adminLevel?: number;
  plan: string;
  planStatus: string;
  planExpiresAt: string;
  createdAt: string;
}

export interface AuditLogRow {
  at?: string;
  event?: string;
  ip?: string;
  userId?: string;
  email?: string;
  status?: string;
  reason?: string;
  raw?: string;
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

async function authedFetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');
  const headers = new Headers(init?.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${input}`, { ...init, headers });
  const data = await response.json().catch(() => null);
  const serverErr = data && (typeof data === 'object' ? (data as any).error || (data as any).message : '') || '';
  if (!response.ok) throw new Error(`${response.status} ${serverErr || 'Request failed'}`);
  return data as T;
}

export async function getAdminUsers(): Promise<AdminUserRow[]> {
  const result = await authedFetchJson<{ items: AdminUserRow[] }>('/api/admin/users');
  return Array.isArray(result.items) ? result.items : [];
}

export async function setUserSubscription(input: {
  userId: string;
  plan: 'free' | 'pro';
  planStatus?: 'inactive' | 'active' | 'past_due' | 'canceled';
  planExpiresAt?: string;
}): Promise<void> {
  await authedFetchJson(`/api/admin/users/${encodeURIComponent(input.userId)}/subscription`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan: input.plan,
      planStatus: input.planStatus,
      planExpiresAt: input.planExpiresAt,
    }),
  });
}

export async function setUserRole(userId: string, role: string, adminLevel?: number): Promise<void> {
  const body: any = { role };
  if (typeof adminLevel === 'number') body.adminLevel = adminLevel;
  await authedFetchJson(`/api/admin/users/${encodeURIComponent(userId)}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function updateUser(userId: string, fields: { name?: string; email?: string }): Promise<any> {
  const data = await authedFetchJson(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  return data;
}

export async function exportUsersCsv(): Promise<string> {
  const r = await fetch(`${API_BASE}/api/admin/export/users`, { headers: { Authorization: `Bearer ${getAuthToken()}` } });
  if (!r.ok) throw new Error(`${r.status} failed to export users`);
  return r.text();
}

export async function exportAuditCsv(): Promise<string> {
  const r = await fetch(`${API_BASE}/api/admin/export/audit`, { headers: { Authorization: `Bearer ${getAuthToken()}` } });
  if (!r.ok) throw new Error(`${r.status} failed to export audit`);
  return r.text();
}

export async function importUsersCsv(csvText: string): Promise<any> {
  const res = await authedFetchJson(`/api/admin/import/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv: csvText }),
  });
  return res;
}

export async function listApiKeys(): Promise<any[]> {
  const r = await authedFetchJson(`/api/admin/api-keys`);
  return Array.isArray((r as any).items) ? (r as any).items : [];
}

export async function createApiKey(): Promise<any> {
  const r = await authedFetchJson(`/api/admin/api-keys`, { method: 'POST' });
  return (r as any).key;
}

export async function deleteApiKey(keyId: string): Promise<any> {
  const r = await authedFetchJson(`/api/admin/api-keys/${encodeURIComponent(keyId)}`, { method: 'DELETE' });
  return r;
}

export async function listWebhooks(): Promise<any[]> {
  const r = await authedFetchJson(`/api/admin/webhooks`);
  return Array.isArray((r as any).items) ? (r as any).items : [];
}

export async function createWebhook(url: string, event = 'all'): Promise<any> {
  const r = await authedFetchJson(`/api/admin/webhooks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, event }),
  });
  return (r as any).webhook;
}

export async function deleteWebhook(id: string): Promise<any> {
  const r = await authedFetchJson(`/api/admin/webhooks/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return r;
}

export async function deleteUser(userId: string): Promise<void> {
  await authedFetchJson(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
}

export async function getAuditLog(limit = 200): Promise<AuditLogRow[]> {
  const result = await authedFetchJson<{ items: AuditLogRow[] }>(
    `/api/admin/audit-log?limit=${encodeURIComponent(String(limit))}`
  );
  return Array.isArray(result.items) ? result.items : [];
}

