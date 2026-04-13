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

const useAuthStore = create((set, get) => ({
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  token: localStorage.getItem('token') || null,
  isLoading: false,
  error: null,

  login: async (phone, password) => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiPhoneLogin(phone, password);
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      set({ token: data.access_token, user: data.user, isLoading: false });
      return data.user;
    } catch (err) {
      const message =
        err.response?.data?.detail || 'Ошибка входа. Проверьте данные.';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ user: null, token: null, error: null });
  },

  loadUser: async () => {
    const token = get().token;
    if (!token) return null;

    set({ isLoading: true });
    try {
      const user = await getMe();
      localStorage.setItem('user', JSON.stringify(user));
      set({ user, isLoading: false });
      return user;
    } catch {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      set({ user: null, token: null, isLoading: false });
      return null;
    }
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
