import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStudios, createStudio } from '../../api/studios';
import { getUsers } from '../../api/users';

const ROLES = [
  { value: 'novice', label: 'Новичок', color: 'bg-gray-100 text-gray-600' },
  { value: 'master', label: 'Мастер', color: 'bg-blue-50 text-blue-600' },
  { value: 'senior_master', label: 'Старший мастер', color: 'bg-indigo-50 text-indigo-600' },
  { value: 'teacher', label: 'Преподаватель', color: 'bg-purple-50 text-purple-600' },
  { value: 'manager', label: 'Менеджер', color: 'bg-accent/10 text-accent' },
  { value: 'owner', label: 'Владелец', color: 'bg-amber-50 text-amber-700' },
  { value: 'superadmin', label: 'Суперадмин', color: 'bg-red-50 text-red-600' },
];

function getRoleInfo(role) {
  return ROLES.find((r) => r.value === role) || ROLES[0];
}

function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map((p) => p[0]).join('').toUpperCase().slice(0, 2);
}

export default function Studios() {
  const navigate = useNavigate();
  const [studios, setStudios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState(null);
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const fetchStudios = async () => {
    setLoading(true);
    try {
      const data = await getStudios();
      setStudios(data);
    } catch { /* interceptor handles 401 */ }
    setLoading(false);
  };

  useEffect(() => { fetchStudios(); }, []);

  const openStudio = async (studio) => {
    setSelected(studio);
    setMembersLoading(true);
    try {
      const data = await getUsers({ studio_id: studio.id });
      setMembers(data);
    } catch {
      setMembers([]);
    }
    setMembersLoading(false);
  };

  return (
    <div className="bg-surface min-h-screen pb-8">
      {/* Header */}
      <header className="bg-white px-4 pt-4 pb-4 shadow-sm sticky top-0 z-30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/admin')} className="text-gray-400">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-xl font-extrabold text-gray-900">Студии</h1>
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
      </header>

      {/* List */}
      <div className="px-4 mt-3 space-y-2">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : studios.length === 0 ? (
          <p className="text-center text-gray-400 py-12 text-sm">Студий пока нет</p>
        ) : (
          studios.map((studio) => (
            <button
              key={studio.id}
              onClick={() => openStudio(studio)}
              className="w-full flex items-center gap-4 p-4 bg-white rounded-2xl shadow-sm border border-gray-50 text-left active:scale-[0.99] transition-transform"
            >
              <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm text-gray-900">{studio.name}</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {studio.city || 'Город не указан'}
                  {' · '}
                  <span className="text-accent font-medium">{studio.member_count || 0} сотрудников</span>
                </p>
              </div>
              <svg className="w-5 h-5 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))
        )}
      </div>

      {/* Studio detail bottomsheet */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative w-full max-w-lg bg-white rounded-t-3xl p-5 pb-8 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-900">{selected.name}</h3>
                <p className="text-sm text-gray-500">{selected.city || 'Город не указан'}</p>
              </div>
            </div>

            <h4 className="font-bold text-sm text-gray-900 mb-2">
              Сотрудники ({members.length})
            </h4>

            {membersLoading ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : members.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">Нет сотрудников в этой студии</p>
            ) : (
              <div className="space-y-1">
                {members.map((user) => {
                  const role = getRoleInfo(user.role);
                  return (
                    <div
                      key={user.id}
                      className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface transition-colors"
                    >
                      <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${role.color}`}>
                        {getInitials(user.full_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900 truncate">{user.full_name}</p>
                        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${role.color}`}>
                          {role.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              onClick={() => setSelected(null)}
              className="w-full h-11 mt-4 bg-surface text-gray-700 font-semibold rounded-xl text-sm hover:bg-gray-100 transition-colors"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* Add studio sheet */}
      {showAdd && (
        <AddStudioSheet
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); fetchStudios(); }}
        />
      )}
    </div>
  );
}

function AddStudioSheet({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      await createStudio({ name: name.trim(), city: city.trim() || null });
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
        <h3 className="font-bold text-lg text-gray-900 mb-4">Новая студия</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название студии"
            className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Город (необязательно)"
            className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
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
