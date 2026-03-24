import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSession,
  getAuthToken,
  getCurrentUser,
  isAuthenticated,
  logoutUser,
  saveSession,
} from './authService';

describe('authService', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('stores and reads session correctly', () => {
    saveSession({
      token: 'abc-token',
      user: { id: 'u1', name: 'Tester', email: 'tester@example.com', role: 'user' },
    });

    expect(getAuthToken()).toBe('abc-token');
    expect(isAuthenticated()).toBe(true);
    expect(getCurrentUser()?.email).toBe('tester@example.com');
  });

  it('clears session values', () => {
    saveSession({
      token: 'abc-token',
      user: { id: 'u1', name: 'Tester', email: 'tester@example.com' },
    });
    clearSession();
    expect(getAuthToken()).toBe('');
    expect(isAuthenticated()).toBe(false);
    expect(getCurrentUser()).toBeNull();
  });

  it('calls backend logout and then clears local session', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);

    saveSession({
      token: 'logout-token',
      user: { id: 'u1', name: 'Tester', email: 'tester@example.com' },
    });

    await logoutUser();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(isAuthenticated()).toBe(false);
  });
});

