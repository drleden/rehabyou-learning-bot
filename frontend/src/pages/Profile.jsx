import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { getRoleLabel } from '../utils/roles';
import client from '../api/client';

function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map((p) => p[0]).join('').toUpperCase().slice(0, 2);
}

export default function Profile() {
  const navigate = useNavigate();
  const { user, logout, loadUser } = useAuthStore();
  const [showEdit, setShowEdit] = useState(false);

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
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl p-5 pb-8 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <h3 className="font-bold text-lg text-gray-900 mb-4">Редактировать профиль</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
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

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-accent hover:bg-accent-hover disabled:opacity-60 text-white font-semibold rounded-xl transition-colors text-sm"
          >
            {loading ? 'Сохранение...' : 'Сохранить'}
          </button>
        </form>
      </div>
    </div>
  );
}
