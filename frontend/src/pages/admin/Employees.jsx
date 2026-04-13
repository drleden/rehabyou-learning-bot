import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUsers, createUser, updateUser, deleteUser } from '../../api/users';

const ROLES = [
  { value: 'novice', label: 'Новичок', color: 'bg-gray-100 text-gray-600' },
  { value: 'master', label: 'Мастер', color: 'bg-blue-50 text-blue-600' },
  { value: 'senior_master', label: 'Старший мастер', color: 'bg-indigo-50 text-indigo-600' },
  { value: 'teacher', label: 'Преподаватель', color: 'bg-purple-50 text-purple-600' },
  { value: 'manager', label: 'Менеджер', color: 'bg-accent/10 text-accent' },
  { value: 'owner', label: 'Владелец', color: 'bg-amber-50 text-amber-700' },
  { value: 'superadmin', label: 'Суперадмин', color: 'bg-red-50 text-red-600' },
];

const ROLE_FILTERS = [
  { value: null, label: 'Все' },
  { value: 'novice', label: 'Новички' },
  { value: 'master', label: 'Мастера' },
  { value: 'senior_master', label: 'Старшие' },
  { value: 'teacher', label: 'Преподаватели' },
  { value: 'manager', label: 'Менеджеры' },
];

function getRoleInfo(role) {
  return ROLES.find((r) => r.value === role) || ROLES[0];
}

function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map((p) => p[0]).join('').toUpperCase().slice(0, 2);
}

export default function Employees() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showRolePicker, setShowRolePicker] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (roleFilter) params.role = roleFilter;
      if (search) params.search = search;
      const data = await getUsers(params);
      setUsers(data);
    } catch { /* handled by interceptor */ }
    setLoading(false);
  }, [roleFilter, search]);

  useEffect(() => {
    const timer = setTimeout(fetchUsers, 300);
    return () => clearTimeout(timer);
  }, [fetchUsers]);

  const handleBlock = async (user) => {
    await updateUser(user.id, { is_blocked: !user.is_blocked });
    setSelected(null);
    fetchUsers();
  };

  const handleChangeRole = async (newRole) => {
    if (!selected) return;
    await updateUser(selected.id, { role: newRole });
    setShowRolePicker(false);
    setSelected(null);
    fetchUsers();
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!window.confirm(`Удалить ${selected.full_name}? Это действие необратимо.`)) return;
    try {
      await deleteUser(selected.id);
      setSelected(null);
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка удаления');
    }
  };

  return (
    <div className="bg-surface min-h-screen pb-8">
      {/* Header */}
      <header className="bg-white px-4 pt-4 pb-3 shadow-sm sticky top-0 z-30">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/admin')} className="text-gray-400">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-xl font-extrabold text-gray-900">Сотрудники</h1>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="w-10 h-10 bg-accent text-white rounded-xl flex items-center justify-center shadow-sm shadow-accent/20 active:scale-95"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по имени или телефону..."
          className="w-full h-10 px-4 rounded-xl border border-gray-200 bg-surface text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
        />
        {/* Role filters */}
        <div className="flex gap-2 mt-3 overflow-x-auto scrollbar-hide pb-1">
          {ROLE_FILTERS.map((f) => (
            <button
              key={f.value || 'all'}
              onClick={() => setRoleFilter(f.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                roleFilter === f.value
                  ? 'bg-accent text-white'
                  : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      {/* List */}
      <div className="px-4 mt-3 space-y-2">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-center text-gray-400 py-12 text-sm">Сотрудников не найдено</p>
        ) : (
          users.map((user) => {
            const role = getRoleInfo(user.role);
            return (
              <button
                key={user.id}
                onClick={() => setSelected(user)}
                className="w-full flex items-center gap-3 p-3 bg-white rounded-2xl shadow-sm border border-gray-50 text-left active:scale-[0.99] transition-transform"
              >
                <div className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm ${role.color}`}>
                  {getInitials(user.full_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900 truncate">{user.full_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${role.color}`}>
                      {role.label}
                    </span>
                    {user.phone && (
                      <span className="text-xs text-gray-400">{user.phone}</span>
                    )}
                  </div>
                </div>
                {user.is_blocked && (
                  <span className="text-[10px] font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                    Заблокирован
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* BottomSheet — User detail */}
      {selected && !showRolePicker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative w-full max-w-lg bg-white rounded-t-3xl p-5 pb-8 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg ${getRoleInfo(selected.role).color}`}>
                {getInitials(selected.full_name)}
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-900">{selected.full_name}</h3>
                <p className="text-sm text-gray-500">{selected.phone || 'Нет телефона'}</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500">Роль</span>
                <span className={`font-medium px-2 py-0.5 rounded-full text-xs ${getRoleInfo(selected.role).color}`}>
                  {getRoleInfo(selected.role).label}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500">Статус</span>
                <span className={`font-medium ${selected.is_blocked ? 'text-red-500' : 'text-green-600'}`}>
                  {selected.is_blocked ? 'Заблокирован' : 'Активен'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500">Регистрация</span>
                <span className="text-gray-900">{new Date(selected.created_at).toLocaleDateString('ru-RU')}</span>
              </div>
            </div>
            <div className="mt-5 space-y-2">
              <button
                onClick={() => setShowRolePicker(true)}
                className="w-full h-11 bg-surface text-gray-900 font-semibold rounded-xl text-sm hover:bg-gray-100 transition-colors"
              >
                Сменить роль
              </button>
              <button
                onClick={() => handleBlock(selected)}
                className={`w-full h-11 font-semibold rounded-xl text-sm transition-colors ${
                  selected.is_blocked
                    ? 'bg-green-50 text-green-700 hover:bg-green-100'
                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                }`}
              >
                {selected.is_blocked ? 'Разблокировать' : 'Заблокировать'}
              </button>
              <button
                onClick={handleDelete}
                className="w-full h-11 bg-red-50 text-red-600 font-semibold rounded-xl text-sm hover:bg-red-100 transition-colors"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role picker */}
      {showRolePicker && selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowRolePicker(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative w-full max-w-lg bg-white rounded-t-3xl p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
            <h3 className="font-bold text-lg text-gray-900 mb-3">Выберите роль</h3>
            <div className="space-y-1">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => handleChangeRole(r.value)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-colors ${
                    selected.role === r.value ? 'bg-accent/10' : 'hover:bg-surface'
                  }`}
                >
                  <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${r.color}`}>
                    {r.label}
                  </span>
                  {selected.role === r.value && (
                    <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add employee form */}
      {showAdd && (
        <AddEmployeeSheet
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); fetchUsers(); }}
        />
      )}
    </div>
  );
}

function AddEmployeeSheet({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('novice');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !password) return;
    setLoading(true);
    setError('');
    try {
      await createUser({
        full_name: name.trim(),
        phone: phone.startsWith('+') ? phone : '+7' + phone.replace(/\D/g, ''),
        password,
        role,
      });
      onCreated();
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка создания');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-lg bg-white rounded-t-3xl p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <h3 className="font-bold text-lg text-gray-900 mb-4">Новый сотрудник</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Имя Фамилия"
            className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+7 900 000-00-00"
            className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Пароль"
            className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-accent hover:bg-accent-hover disabled:opacity-60 text-white font-semibold rounded-xl transition-colors text-sm"
          >
            {loading ? 'Создание...' : 'Создать'}
          </button>
        </form>
      </div>
    </div>
  );
}
