import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { getRoleLabel } from '../utils/roles';
import { SERVICES } from '../utils/services';
import { getPermissions } from '../api/permissions';
import client from '../api/client';

function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map((p) => p[0]).join('').toUpperCase().slice(0, 2);
}

export default function Profile() {
  const navigate = useNavigate();
  const { user, logout, loadUser } = useAuthStore();
  const [showEdit, setShowEdit] = useState(false);
  const [permissions, setPermissions] = useState([]);

  useEffect(() => {
    if (!user) return;
    getPermissions(user.id).then(setPermissions).catch(() => {});
  }, [user]);

  const permByService = {};
  permissions.forEach((p) => { permByService[p.service] = p; });

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  if (!user) return null;

  return (
    <div className="bg-white min-h-screen pb-24">
      <div className="flex flex-col items-center pt-10 pb-6">
        <div className="w-20 h-20 rounded-full bg-accent flex items-center justify-center shadow-lg shadow-accent/20">
          <span className="text-white font-extrabold text-2xl">{getInitials(user.full_name)}</span>
        </div>
        <h1 className="text-xl font-extrabold text-gray-900 mt-4">
          {user.first_name} {user.last_name}
        </h1>
        <span className="text-sm text-accent font-medium mt-1">{getRoleLabel(user.role)}</span>
      </div>

      <div className="px-4 space-y-2">
        {user.phone && (
          <div className="flex items-center gap-3 p-4 bg-surface rounded-2xl">
            <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <span className="text-sm text-gray-900">{user.phone}</span>
          </div>
        )}

        <button
          onClick={() => setShowEdit(true)}
          className="w-full flex items-center gap-3 p-4 bg-surface rounded-2xl text-left hover:bg-gray-100 transition-colors"
        >
          <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <span className="text-sm text-gray-700">Редактировать профиль</span>
          <svg className="w-4 h-4 text-gray-300 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <TelegramSection user={user} onUpdate={loadUser} />
      </div>

      <div className="px-4 mt-6">
        <h2 className="font-bold text-sm text-gray-900 mb-2">Мои допуски</h2>
        <div className="space-y-2">
          {SERVICES.map((srv) => {
            const allowed = !!permByService[srv.value];
            return (
              <div
                key={srv.value}
                className="flex items-center gap-3 p-3 bg-surface rounded-2xl"
              >
                <span className="text-2xl flex-shrink-0">{srv.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">{srv.label}</p>
                  <span className={`text-[11px] font-semibold ${allowed ? 'text-green-600' : 'text-gray-400'}`}>
                    {allowed ? '✓ Допущен' : '✗ Нет допуска'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-4 mt-8">
        <button
          onClick={handleLogout}
          className="w-full h-12 bg-red-50 text-red-600 font-semibold rounded-xl text-sm hover:bg-red-100 transition-colors active:scale-[0.98]"
        >
          Выйти
        </button>
      </div>

      {showEdit && (
        <EditProfileSheet
          user={user}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); loadUser(); }}
        />
      )}
    </div>
  );
}

function EditProfileSheet({ user, onClose, onSaved }) {
  const [firstName, setFirstName] = useState(user.first_name || '');
  const [lastName, setLastName] = useState(user.last_name || '');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword && newPassword !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }
    if (newPassword && !oldPassword) {
      setError('Введите текущий пароль');
      return;
    }

    setLoading(true);
    try {
      const body = {};
      if (firstName !== user.first_name) body.first_name = firstName.trim();
      if (lastName !== user.last_name) body.last_name = lastName.trim();
      if (newPassword) {
        body.old_password = oldPassword;
        body.new_password = newPassword;
      }

      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }

      await client.patch('/users/me', body);
      setSuccess('Сохранено');
      setTimeout(onSaved, 500);
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (detail === 'Wrong old password') {
        setError('Неверный текущий пароль');
      } else {
        setError(detail || 'Ошибка сохранения');
      }
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-lg bg-white rounded-t-3xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 pt-3 pb-2">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
        </div>
        <div className="flex-shrink-0 px-5 pb-3 border-b border-gray-100">
          <h3 className="font-bold text-lg text-gray-900">Редактировать профиль</h3>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Имя</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoCapitalize="words"
              className="w-full h-11 px-4 mt-1 rounded-xl border border-gray-200 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Фамилия</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoCapitalize="words"
              className="w-full h-11 px-4 mt-1 rounded-xl border border-gray-200 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>

          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-600 mb-2">Смена пароля</p>
            <div className="space-y-2">
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="Текущий пароль"
                autoComplete="current-password"
                className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Новый пароль"
                autoComplete="new-password"
                className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Повторите новый пароль"
                autoComplete="new-password"
                className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}
        </div>

        {/* Sticky footer with Save button */}
        <div className="flex-shrink-0 px-5 pt-3 pb-24 border-t border-gray-100 bg-white">
          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-accent hover:bg-accent-hover disabled:opacity-60 text-white font-semibold rounded-xl transition-colors text-sm"
          >
            {loading ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  );
}

function TelegramSection({ user, onUpdate }) {
  const botUsername = import.meta.env.VITE_BOT_USERNAME || 'rehabyoulearn_bot';
  const [unlinking, setUnlinking] = useState(false);

  const handleConnect = () => {
    const url = `https://t.me/${botUsername}?start=user_${user.id}`;
    window.open(url, '_blank');
  };

  const handleUnlink = async () => {
    if (!window.confirm('Отключить Telegram?')) return;
    setUnlinking(true);
    try {
      await client.delete('/auth/telegram/link');
      onUpdate();
    } catch { /* interceptor */ }
    setUnlinking(false);
  };

  if (user.telegram_id) {
    return (
      <div className="flex items-center gap-3 p-4 bg-green-50 rounded-2xl">
        <svg className="w-5 h-5 text-[#2AABEE] flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-green-800 font-semibold">
            {user.telegram_username ? `@${user.telegram_username}` : 'Telegram подключён'} ✓
          </p>
          <p className="text-xs text-green-600">Напоминания включены</p>
        </div>
        <button
          onClick={handleUnlink}
          disabled={unlinking}
          className="text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-50"
        >
          {unlinking ? '...' : 'Отключить'}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      className="w-full flex items-center gap-3 p-4 bg-surface rounded-2xl text-left hover:bg-gray-100 transition-colors"
    >
      <svg className="w-5 h-5 text-[#2AABEE] flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
      <span className="text-sm text-gray-700">Подключить Telegram</span>
      <svg className="w-4 h-4 text-gray-300 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}
