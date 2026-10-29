/* Aroma Café — browser client for auth-service and orders-api.
 *
 * Token handling:
 *  - The access token (JWT, 15 min) lives ONLY in this closure (memory). It is never written
 *    to localStorage/sessionStorage, so a page reload drops it.
 *  - The refresh token is an HttpOnly cookie set by auth-service; JavaScript can't read it.
 *    On page load we call /auth/refresh to silently restore the session.
 *  - apiFetch() adds "Authorization: Bearer <token>" and, on a 401, refreshes once and retries.
 */
(function () {
  "use strict";

  const AUTH_URL = window.AROMA_AUTH_URL || "http://localhost:4000";
  const API_URL = window.AROMA_API_URL || "http://localhost:5000";

  let accessToken = null;
  let user = null;
  let refreshTimer = null;
  let refreshing = null;
  const listeners = new Set();

  class AuthError extends Error {
    constructor(status, code, message) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  const UNAVAILABLE = "Sign-in is temporarily unavailable. Please try again in a moment.";

  function setSession(data) {
    clearTimeout(refreshTimer);
    accessToken = data ? data.accessToken : null;
    user = data ? data.user : null;
    if (data && data.expiresIn) {
      // Renew one minute before the access token expires.
      const ms = Math.max(10, data.expiresIn - 60) * 1000;
      refreshTimer = setTimeout(() => { refresh(); }, ms);
    }
    listeners.forEach((fn) => { try { fn(user); } catch (_) { /* ignore listener errors */ } });
  }

  async function call(url, options) {
    let res;
    try {
      // Give up after 8 s so a hung service never leaves the UI spinning forever.
      res = await fetch(url, { signal: AbortSignal.timeout(8000), ...options });
    } catch (_) {
      throw new AuthError(0, "network", UNAVAILABLE);
    }
    if (res.status === 204) return null;
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = res.status >= 500 ? UNAVAILABLE : body.message || "Something went wrong.";
      throw new AuthError(res.status, body.error || "error", message);
    }
    return body;
  }

  const authPost = (path, body) =>
    call(AUTH_URL + path, {
      method: "POST",
      credentials: "include", // send/receive the HttpOnly refresh cookie
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    });

  async function login(email, password) {
    setSession(await authPost("/auth/login", { email, password }));
    return user;
  }

  async function register(name, email, password) {
    setSession(await authPost("/auth/register", { name, email, password }));
    return user;
  }

  /** Exchanges the refresh cookie for a new access token. Resolves true/false, never throws. */
  function refresh() {
    if (!refreshing) {
      refreshing = authPost("/auth/refresh")
        .then((data) => { setSession(data); return true; })
        .catch((err) => {
          // 401 = no/invalid session. Network/5xx = auth-service down: keep whatever we have.
          if (err.status === 401) setSession(null);
          return false;
        })
        .finally(() => { refreshing = null; });
    }
    return refreshing;
  }

  async function logout() {
    try { await authPost("/auth/logout"); } catch (_) { /* revoke best effort; clear locally anyway */ }
    setSession(null);
  }

  /** Calls orders-api with the access token; refreshes once on 401. */
  async function apiFetch(path, options = {}) {
    if (!accessToken) await ready;
    const send = () => call(API_URL + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      }
    });
    try {
      return await send();
    } catch (err) {
      if (err.status === 401 && (await refresh())) return send();
      throw err;
    }
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  /* Show the signed-in name in the global nav on every page. */
  onChange((u) => {
    document.querySelectorAll('#primary-links a[href="login.html"]').forEach((a) => {
      a.textContent = u ? `Hi, ${u.name.split(/\s+/)[0]}` : "Sign in";
    });
  });

  const ready = refresh(); // silent session restore on page load

  window.AromaAuth = {
    login, register, logout, refresh, apiFetch, onChange, ready, AuthError,
    get user() { return user; },
    get isSignedIn() { return Boolean(accessToken); }
  };
})();
