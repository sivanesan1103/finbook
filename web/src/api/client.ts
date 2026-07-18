import axios from 'axios';

const baseURL = (import.meta.env.VITE_API_URL || '') + '/api/v1';

export const api = axios.create({ baseURL });

// ── token storage ──
export const tokens = {
  get access() { return localStorage.getItem('bk_access'); },
  get refresh() { return localStorage.getItem('bk_refresh'); },
  set(access: string, refresh: string) {
    localStorage.setItem('bk_access', access);
    localStorage.setItem('bk_refresh', refresh);
  },
  clear() {
    localStorage.removeItem('bk_access');
    localStorage.removeItem('bk_refresh');
  },
};

api.interceptors.request.use((config) => {
  if (tokens.access) config.headers.Authorization = `Bearer ${tokens.access}`;
  return config;
});

// Auto-refresh on 401 (single retry)
let refreshing: Promise<void> | null = null;
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retried && tokens.refresh) {
      original._retried = true;
      refreshing ||= axios
        .post(`${baseURL}/auth/refresh`, { refreshToken: tokens.refresh })
        .then((res) => tokens.set(res.data.data.accessToken, res.data.data.refreshToken))
        .catch(() => { tokens.clear(); window.location.href = '/login'; })
        .finally(() => { refreshing = null; }) as Promise<void>;
      await refreshing;
      return api(original);
    }
    return Promise.reject(error);
  }
);

export const apiMessage = (e: unknown): string => {
  if (axios.isAxiosError(e)) return e.response?.data?.message || e.message;
  return String(e);
};
