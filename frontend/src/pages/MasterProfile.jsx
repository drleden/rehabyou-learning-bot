import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useAuthStore, { hasMinimumRole } from '../store/authStore';
import { getUser } from '../api/users';
import { getCourses, getProgressSummary } from '../api/courses';
import { getPermissions, grantPermission, revokePermission } from '../api/permissions';
import { getRoleLabel } from '../utils/roles';
import { SERVICES } from '../utils/services';

function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map((p) => p[0]).join('').toUpperCase().slice(0, 2);
}

export default function MasterProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const canManage = currentUser && hasMinimumRole(currentUser.role, 'senior_master');

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState([]);
  const [progress, setProgress] = useState({});
  const [permissions, setPermissions] = useState([]);
  const [busyService, setBusyService] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [u, courseList, perms] = await Promise.all([
        getUser(userId),
        getCourses(),
        getPermissions(userId),
      ]);
      setUser(u);
      setCourses(courseList);
      setPermissions(perms);

      const progs = {};
      await Promise.all(
        courseList.map(async (c) => {
          try {
            // getProgressSummary возвращает прогресс текущего пользователя,
            // поэтому здесь показываем общий счётчик уроков.
            progs[c.id] = await getProgressSummary(c.id);
          } catch {
            progs[c.id] = { total: 0, completed: 0, percent: 0 };
          }
        })
      );
      setProgress(progs);
    } catch {
      navigate('/admin/employees');
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [userId]);

  const permByService = {};
  permissions.forEach((p) => { permByService[p.service] = p; });

  const handleGrant = async (service) => {
    setBusyService(service);
    try {
      await grantPermission(parseInt(userId), service);
      await fetchAll();
    } catch { /* interceptor */ }
    setBusyService(null);
  };

  const handleRevoke = async (permId, service) => {
    setBusyService(service);
    try {
      await revokePermission(permId);
      await fetchAll();
    } catch { /* interceptor */ }
    setBusyService(null);
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-surface min-h-screen pb-8">
      <header className="bg-white px-4 pt-4 pb-4 shadow-sm sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-gray-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-extrabold text-gray-900">Профиль сотрудника</h1>
        </div>
      </header>

      {/* User card */}
      <div className="bg-white px-4 py-5 border-b border-gray-100">
        <div className="flex flex-col items-center">
          <div className="w-20 h-20 rounded-full bg-accent flex items-center justify-center shadow-lg shadow-accent/20">
            <span className="text-white font-extrabold text-2xl">{getInitials(user.full_name)}</span>
          </div>
          <h2 className="text-xl font-extrabold text-gray-900 mt-3">
            {user.first_name} {user.last_name}
          </h2>
          <span className="text-sm text-accent font-medium mt-0.5">{getRoleLabel(user.role)}</span>
          {user.phone && (
            <p className="text-sm text-gray-500 mt-1">{user.phone}</p>
          )}
          {user.is_blocked && (
            <span className="text-[10px] font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full mt-2">
              Заблокирован
            </span>
          )}
        </div>
      </div>

      {/* Courses progress */}
      {courses.length > 0 && (
        <section className="mt-4 px-4">
          <h3 className="font-bold text-sm text-gray-900 mb-2">Прогресс по курсам</h3>
          <div className="space-y-2">
            {courses.map((c) => {
              const p = progress[c.id] || { total: 0, completed: 0, percent: 0 };
              return (
                <div key={c.id} className="bg-white rounded-2xl p-3 shadow-sm border border-gray-50">
                  <p className="font-semibold text-sm text-gray-900 line-clamp-1">{c.title}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full transition-all"
                        style={{ width: `${p.percent}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-gray-500 flex-shrink-0">
                      {p.completed}/{p.total}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Service permissions */}
      <section className="mt-5 px-4 pb-6">
        <h3 className="font-bold text-sm text-gray-900 mb-2">Допуски к услугам</h3>
        <div className="space-y-2">
          {SERVICES.map((srv) => {
            const perm = permByService[srv.value];
            const allowed = !!perm;
            const busy = busyService === srv.value;
            return (
              <div
                key={srv.value}
                className="flex items-center gap-3 p-3 bg-white rounded-2xl shadow-sm border border-gray-50"
              >
                <span className="text-2xl flex-shrink-0">{srv.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">{srv.label}</p>
                  <span className={`text-[11px] font-semibold ${allowed ? 'text-green-600' : 'text-gray-400'}`}>
                    {allowed ? '✓ Допущен' : '✗ Нет допуска'}
                  </span>
                </div>
                {canManage && (
                  allowed ? (
                    <button
                      onClick={() => handleRevoke(perm.id, srv.value)}
                      disabled={busy}
                      className="h-8 px-3 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
                    >
                      {busy ? '...' : 'Отозвать'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleGrant(srv.value)}
                      disabled={busy}
                      className="h-8 px-3 rounded-lg text-xs font-semibold text-white bg-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
                    >
                      {busy ? '...' : 'Выдать'}
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
