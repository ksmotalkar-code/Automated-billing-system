import { auth } from '../firebase';

export interface AuthFetchOptions extends RequestInit {
  timeoutMs?: number;
}

/**
 * Robust Authenticated Fetch Client
 * Automatically acquires and attaches Firebase Auth ID tokens and tenant headers
 * to all client-side API calls.
 */
export async function authFetch(url: string, options: AuthFetchOptions = {}): Promise<Response> {
  const headers = new Headers(options.headers || {});

  // If user is authenticated, attach live Firebase ID Token
  if (auth.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
        headers.set('x-owner-id', auth.currentUser.uid);
      }
    } catch (tokenErr) {
      console.warn('[authFetch] Could not retrieve Firebase ID token:', tokenErr);
    }
  }

  // Set default JSON Content-Type if string body provided and header omitted
  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const timeoutMs = options.timeoutMs || 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const signal = options.signal || controller.signal;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Helper to fetch and parse JSON with automatic error unwrapping
 */
export async function authFetchJson<T = any>(url: string, options: AuthFetchOptions = {}): Promise<T> {
  const res = await authFetch(url, options);
  if (!res.ok) {
    let errorDetail = `Request failed: ${res.status} ${res.statusText}`;
    try {
      const errorJson = await res.json();
      errorDetail = errorJson.error || errorJson.message || errorDetail;
    } catch {
      // response was not JSON
    }
    throw new Error(errorDetail);
  }
  return res.json() as Promise<T>;
}
