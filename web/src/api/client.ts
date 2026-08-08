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

/** True when the request failed because the logged-in staff member lacks the permission for this section. */
export const isForbidden = (e: unknown): boolean =>
  axios.isAxiosError(e) && e.response?.status === 403;

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  email: 'Email',
  password: 'Password',
  phone: 'Phone',
  address: 'Address',
  amount: 'Amount',
  taxRate: 'GST %',
  qty: 'Quantity',
  price: 'Rate',
  salePrice: 'Sale price',
  purchasePrice: 'Purchase price',
  stockQty: 'Stock quantity',
  lowStockAlert: 'Low stock alert',
  discount: 'Discount',
  paymentMode: 'Payment mode',
  entryDate: 'Date',
  category: 'Category',
  gstin: 'GSTIN',
  pincode: 'Pincode',
};

/**
 * Zod reports nested paths like `items.0.taxRate`. Show the user the field
 * they can actually see ("GST %") plus which row it is, rather than the raw
 * dotted path — "Items.0.taxRate number must be less than or equal to 100"
 * means nothing to a shop owner.
 */
const labelFor = (path: string): string => {
  if (!path) return 'Value';
  const parts = path.split('.');
  const leaf = parts[parts.length - 1];
  const label = FIELD_LABELS[leaf] || leaf.charAt(0).toUpperCase() + leaf.slice(1);
  // A numeric segment means the error is on one row of a list (e.g. invoice line 2).
  const rowIdx = parts.find((p) => /^\d+$/.test(p));
  return rowIdx === undefined ? label : `${label} (row ${Number(rowIdx) + 1})`;
};

/** Turns a raw Zod issue (field path + machine-generated message) into a readable sentence. */
const friendlyIssue = (path: string, message: string): string => {
  const label = labelFor(path);
  const min = message.match(/^String must contain at least (\d+) character\(s\)$/);
  if (min) return `${label} must be at least ${min[1]} characters`;
  const max = message.match(/^String must contain at most (\d+) character\(s\)$/);
  if (max) return `${label} must be at most ${max[1]} characters`;
  const numMax = message.match(/^Number must be less than or equal to (\d+)$/);
  if (numMax) return `${label} must be ${Number(numMax[1]).toLocaleString('en-IN')} or less`;
  const numMin = message.match(/^Number must be greater than or equal to (\d+)$/);
  if (numMin) return `${label} must be ${Number(numMin[1]).toLocaleString('en-IN')} or more`;
  if (message === 'Required') return `${label} is required`;
  if (message === 'Invalid email') return `${label} must be a valid email address`;
  return `${label} ${message.charAt(0).toLowerCase()}${message.slice(1)}`;
};

export const apiMessage = (e: unknown): string => {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data;
    const details = data?.details as { path: string; message: string }[] | undefined;
    if (details?.length) {
      return details.map((d) => friendlyIssue(d.path, d.message)).join('. ');
    }
    return data?.message || e.message;
  }
  return String(e);
};
