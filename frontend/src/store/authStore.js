import { create } from 'zustand';
import { phoneLogin as apiPhoneLogin, getMe } from '../api/auth';

const ROLE_HIERARCHY = [
  'novice',
  'master',
  'senior_master',
  'teacher',
  'manager',
  'owner',
  'superadmin',
];

export function hasMinimumRole(userRole, minimumRole) {
  return ROLE_HIERARCHY.indexOf(userRole) >= ROLE_HIERARCHY.indexOf(minimumRole);
}

function safeGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode, quota) */
  }
}

function safeRemoveItem(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function parseStoredUser() {
  const raw = safeGetItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const useAuthStore = create((set, get) => ({
  user: parseStoredUser(),
  token: safeGetItem('token'),
  isLoading: false,
  error: null,

  login: async (phone, password) => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiPhoneLogin(phone, password);
      safeSetItem('token', data.access_token);
      safeSetItem('user', JSON.stringify(data.user));
      set({ token: data.access_token, user: data.user, isLoading: false });
      return data.user;
    } catch (err) {
      const message =
        (err && err.response && err.response.data && err.response.data.detail) ||
        'Ошибка входа. Проверьте данные.';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  logout: () => {
    safeRemoveItem('token');
    safeRemoveItem('user');
    set({ user: null, token: null, error: null });
  },

  loadUser: async () => {
    const token = get().token;
    if (!token) return null;

    set({ isLoading: true });
    try {
      const user = await getMe();
      safeSetItem('user', JSON.stringify(user));
      set({ user, isLoading: false });
      return user;
    } catch {
      safeRemoveItem('token');
      safeRemoveItem('user');
      set({ user: null, token: null, isLoading: false });
      return null;
    }
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
