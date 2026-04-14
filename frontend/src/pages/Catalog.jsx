import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore, { hasMinimumRole } from '../store/authStore';
import { getCourses, getProgressSummary } from '../api/courses';
import { getRoleLabel } from '../utils/roles';

function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map((p) => p[0]).join('').toUpperCase().slice(0, 2);
}

export default function Catalog() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isManager = user && hasMinimumRole(user.role, 'manager');
  const [courses, setCourses] = useState([]);
  const [progress, setProgress] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await getCourses();
        setCourses(data);
        const progs = {};
        await Promise.all(
          data.map(async (c) => {
            try {
              progs[c.id] = await getProgressSummary(c.id);
            } catch { progs[c.id] = { total: 0, completed: 0, percent: 0 }; }
          })
        );
        setProgress(progs);
      } catch { /* interceptor */ }
      setLoading(false);
    })();
  }, []);

  const inProgress = courses.filter((c) => progress[c.id]?.percent > 0 && progress[c.id]?.percent < 100);
  const currentCourse = inProgress[0];

  return (
    <div className="bg-white min-h-screen">
      <header className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold text-gray-900">Каталог</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {user ? `Привет, ${user.full_name.split(' ')[0]}!` : 'Добро пожаловать!'}
            </p>
          </div>
          <button
            onClick={() => navigate(isManager ? '/admin' : '/profile')}
            className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center active:scale-95 transition-transform"
          >
            <span className="text-accent font-bold text-sm">{getInitials(user?.full_name)}</span>
          </button>
        </div>
      </header>

      {currentCourse && (
        <section className="px-4 mt-4">
          <button
            onClick={() => navigate(`/course/${currentCourse.id}`)}
            className="w-full bg-gradient-to-r from-accent to-orange-500 rounded-2xl p-4 text-white relative overflow-hidden text-left active:scale-[0.99] transition-transform"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-8 translate-x-8" />
            <p className="text-xs font-medium text-white/80 uppercase tracking-wide">Продолжить обучение</p>
            <h3 className="font-bold text-base mt-1 leading-tight pr-8">{currentCourse.title}</h3>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-white rounded-full" style={{ width: `${progress[currentCourse.id]?.percent || 0}%` }} />
              </div>
              <span className="text-xs font-semibold text-white/90">{progress[currentCourse.id]?.percent || 0}%</span>
            </div>
          </button>
        </section>
      )}

      <section className="mt-6 pb-6">
        <div className="flex items-center justify-between px-4 mb-3">
          <h2 className="text-lg font-bold text-gray-900">Мои курсы</h2>
        </div>
        <div className="px-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : courses.length === 0 ? (
            <p className="text-center text-gray-400 py-12 text-sm">Нет доступных курсов</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {courses.map((course) => {
                const p = progress[course.id];
                return (
                  <button
                    key={course.id}
                    onClick={() => navigate(`/course/${course.id}`)}
                    className="bg-white rounded-2xl shadow-sm border border-gray-50 overflow-hidden text-left active:scale-[0.98] transition-transform"
                  >
                    <div
                      className="h-[120px] relative"
                      style={{ background: course.cover_url ? undefined : 'linear-gradient(135deg, #e8571a 0%, #f7a24b 100%)' }}
                    >
                      {course.cover_url ? (
                        <img src={course.cover_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-3xl opacity-40">📚</span>
                        </div>
                      )}
                      {p && p.percent > 0 && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/10">
                          <div className="h-full bg-white rounded-r-full" style={{ width: `${p.percent}%` }} />
                        </div>
                      )}
                    </div>
                    <div className="p-2.5">
                      <h3 className="font-semibold text-xs text-gray-900 line-clamp-2 leading-tight">{course.title}</h3>
                      {p && p.total > 0 && (
                        <p className="text-[10px] text-gray-400 mt-1">
                          {p.completed}/{p.total} уроков · {p.percent}%
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
