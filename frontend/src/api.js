import axios from "axios";

const BASE = import.meta.env.VITE_API_URL ?? "";

const api = axios.create({
  baseURL: BASE,
  timeout: 10_000,
});

// ── Attach JWT on every outgoing request ──────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Token refresh queue ───────────────────────────────────────────────────────
let refreshing = false;
let waitQueue = []; // [{resolve, reject}]

function flushQueue(err, newToken) {
  waitQueue.forEach((p) => (err ? p.reject(err) : p.resolve(newToken)));
  waitQueue = [];
}

function forceLogout() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("user");
  // AuthContext listens for this event and clears its state
  window.dispatchEvent(new Event("auth:logout"));
}

// ── Response interceptor — handle 401 (expired) and 403 (no token) ───────────
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const status = err.response?.status;
    const detail = err.response?.data?.detail ?? "";
    const original = err.config;

    // 403 "Not authenticated" means no token was sent at all → force re-login
    if (status === 403 && detail === "Not authenticated") {
      forceLogout();
      return Promise.reject(err);
    }

    // 401 — token expired; try to refresh once
    if (status === 401 && !original._retry) {
      const refreshToken = localStorage.getItem("refresh_token");

      if (!refreshToken) {
        forceLogout();
        return Promise.reject(err);
      }

      // If a refresh is already in flight, queue this request
      if (refreshing) {
        return new Promise((resolve, reject) => {
          waitQueue.push({ resolve, reject });
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        });
      }

      original._retry = true;
      refreshing = true;

      try {
        const { data } = await axios.post(`${BASE}/api/auth/refresh`, {
          refresh_token: refreshToken,
        });

        const newToken = data.access_token;
        localStorage.setItem("access_token", newToken);
        if (data.refresh_token) {
          localStorage.setItem("refresh_token", data.refresh_token);
        }

        // Update default header so future requests use the new token immediately
        api.defaults.headers.common.Authorization = `Bearer ${newToken}`;

        flushQueue(null, newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original); // retry original request
      } catch (refreshErr) {
        flushQueue(refreshErr, null);
        forceLogout();
        return Promise.reject(refreshErr);
      } finally {
        refreshing = false;
      }
    }

    return Promise.reject(err);
  },
);

export default api;
