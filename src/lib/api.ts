import { auth } from '../firebase';

export interface AuthFetchOptions extends RequestInit {
  timeoutMs?: number;
}

/**
 * Robust Authenticated Fetch Client
 * Automatically acquires and attaches Firebase Auth ID tokens and tenant headers
 * to all client-side API calls with absolute URL normalization and connection resilience.
 */
export async function authFetch(url: string, options: AuthFetchOptions = {}): Promise<Response> {
  const headers = new Headers(options.headers || {});

  // If user is not yet loaded, try waiting for authStateReady
  if (!auth.currentUser && typeof (auth as any).authStateReady === 'function') {
    try {
      await Promise.race([
        (auth as any).authStateReady(),
        new Promise(r => setTimeout(r, 1200))
      ]);
    } catch (e) {}
  }

  // Attach live Firebase ID Token if user is authenticated
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

  // Attach fallback session owner if token missing
  if (!headers.has('Authorization')) {
    const fallbackUid = auth.currentUser?.uid || (typeof localStorage !== 'undefined' ? localStorage.getItem('panchayat_owner_id') || localStorage.getItem('last_active_owner_id') : null);
    if (fallbackUid) {
      headers.set('Authorization', `Bearer ${fallbackUid}`);
      headers.set('x-owner-id', fallbackUid);
    }
  }

  // Set default JSON Content-Type if string body provided and header omitted
  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const timeoutMs = options.timeoutMs || 60000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const signal = options.signal || controller.signal;

  // Standard relative URL for browser requests prevents CORS preflight issues with iframe proxies
  const targetUrl = url;

  const fetchOptions: RequestInit = {
    ...options,
    credentials: options.credentials || 'same-origin',
    headers,
    signal,
  };

  const maxRetries = options.method === 'GET' ? 2 : 1; // Retry once for POST if network drop occurs
  let attempt = 0;

  try {
    while (true) {
      try {
        const response = await fetch(targetUrl, fetchOptions);
        clearTimeout(timeoutId);
        return response;
      } catch (netErr: any) {
        console.warn(`[authFetch] Network issue for ${targetUrl}:`, netErr?.message || netErr);
        const isNetworkError = 
          netErr.name === 'TypeError' && 
          (netErr.message?.includes('Failed to fetch') || netErr.message?.includes('NetworkError'));
        
        if (isNetworkError && attempt < maxRetries) {
          attempt++;
          const delay = 1000 * Math.pow(2, attempt - 1);
          console.warn(`[authFetch] Network retry ${attempt}/${maxRetries} for ${targetUrl} after ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        console.warn(`[authFetch] Network connection failure on ${targetUrl}:`, netErr);
        if (netErr.name === 'AbortError') {
          throw new Error(`Request timed out after ${timeoutMs / 1000}s while contacting ${url}`);
        }
        const msg = netErr.message || String(netErr);
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
          throw new Error(`Network connection error while contacting server (${url}). This usually happens if the server is restarting or the network is unstable.`);
        }
        throw netErr;
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Helper to fetch and parse JSON with automatic error unwrapping
 */
export async function authFetchJson<T = any>(url: string, options: AuthFetchOptions = {}): Promise<T> {
  const res = await authFetch(url, options);
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (!res.ok) {
    let errorDetail = `Request failed: HTTP ${res.status} ${res.statusText}`;
    if (isJson) {
      try {
        const errorJson = await res.json();
        errorDetail = errorJson.error || errorJson.message || errorDetail;
      } catch {
        // response was not JSON
      }
    } else {
      try {
        const text = await res.text();
        if (text && text.length < 200 && !text.includes('<!doctype') && !text.includes('<html')) {
          errorDetail = text;
        }
      } catch {}
    }
    throw new Error(errorDetail);
  }

  if (!isJson) {
    throw new Error(`Server returned non-JSON response from ${url} (HTTP ${res.status}).`);
  }

  try {
    return await res.json() as T;
  } catch (jsonErr: any) {
    console.warn(`[authFetchJson] JSON parse failure on ${url}:`, jsonErr);
    throw new Error(`Server returned invalid JSON response from ${url} (HTTP ${res.status}).`);
  }
}
