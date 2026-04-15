import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSnapshot } from '../../api/admin';
import { getRoleLabel } from '../../utils/roles';

export default function Analytics() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setData(await getSnapshot());
      } catch { /* interceptor */ }
      setLoading(false);
    })();
  }, []);

  const handleExport = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setToast('Скопировано! Отправьте Claude для анализа');
      setTimeout(() => setToast(''), 3000);
    } catch {
      setToast('Не удалось скопировать');
      setTimeout(() => setToast(''), 3000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6 gap-4">
        <p className="text-sm text-gray-500">Не удалось загрузить данные</p>
        <button onClick={() => navigate('/admin')} className="text-sm text-accent font-semibold">← Назад</button>
      </div>
    );
  }

  const t = data.totals;

  return (
    <div className="bg-surface min-h-screen pb-8">
      <header className="bg-white px-4 pt-4 pb-4 shadow-sm sticky top-0 z-30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/admin')} className="text-gray-400">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-xl font-extrabold text-gray-900">Аналитика</h1>
          </div>
          <button
            onClick={handleExport}
            className="h-9 px-3 bg-accent text-white rounded-xl text-xs font-semibold flex items-center gap-1 active:scale-95"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Экспорт
          </button>
        </div>
      </header>

      {/* Top stats */}
      <div className="px-4 mt-4 grid grid-cols-2 gap-3">
        <StatCard label="Всего сотрудников" value={t.users} color="bg-blue-50 text-blue-600" />
        <StatCard label="Активны сегодня" value={t.active_today} color="bg-green-50 text-green-600" />
        <StatCard label="Средний прогресс" value={`${t.avg_course_progress}%`} color="bg-accent/10 text-accent" />
        <StatCard label="Допусков выдано" value={t.permissions_active} color="bg-amber-50 text-amber-700" />
      </div>

      {/* Course progress */}
      <Section title="Прогресс по курсам">
        {data.course_progress.length === 0 ? (
          <EmptyText>Курсов пока нет</EmptyText>
        ) : (
          <div className="space-y-2">
            {data.course_progress.map((c) => (
              <div key={c.course_id} className="bg-white rounded-2xl p-3 shadow-sm border border-gray-50">
                <div className="flex justify-between items-start gap-2">
                  <p className="font-semibold text-sm text-gray-900 line-clamp-1 flex-1">{c.course_title}</p>
                  <span className="text-xs font-bold text-accent flex-shrink-0">{c.avg_percent}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2">
                  <div className="h-full bg-accent rounded-full" style={{ width: `${c.avg_percent}%` }} />
                </div>
                <div className="flex gap-3 text-[11px] text-gray-500 mt-2">
                  <span>✓ {c.completed} завершили</span>
                  <span>⏳ {c.in_progress} в процессе</span>
                  <span>· {c.total_enrolled} начали</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Test stats */}
      <Section title="Проблемные тесты">
        {data.test_stats.length === 0 ? (
          <EmptyText>Тестов пока нет</EmptyText>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-50 overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2 bg-surface text-[10px] font-semibold text-gray-500 uppercase">
              <span>Урок</span>
              <span>Попыток</span>
              <span>% сдачи</span>
            </div>
            {data.test_stats.map((t) => (
              <div key={t.test_id} className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2.5 border-t border-gray-50 text-xs">
                <span className="text-gray-900 truncate">{t.lesson_title}</span>
                <span className="text-gray-500">{t.attempts_total}</span>
                <span className={`font-semibold ${t.pass_rate_percent >= 80 ? 'text-green-600' : t.pass_rate_percent >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                  {t.pass_rate_percent}%
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Problem lessons */}
      {data.problem_lessons.length > 0 && (
        <Section title="Уроки с зависшими студентами">
          <div className="space-y-2">
            {data.problem_lessons.map((l) => (
              <div key={l.lesson_id} className="bg-white rounded-2xl p-3 shadow-sm border border-gray-50 flex items-center justify-between">
                <p className="text-sm text-gray-900 truncate flex-1">{l.lesson_title}</p>
                <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full ml-2">
                  {l.unfinished_count} зависло
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Inactive users */}
      <Section title="Неактивные сотрудники (>7 дней)">
        {data.inactive_users.length === 0 ? (
          <EmptyText>Все активны 👍</EmptyText>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-50 overflow-hidden">
            {data.inactive_users.slice(0, 20).map((u, i) => (
              <div
                key={u.user_id}
                className={`flex items-center justify-between px-3 py-2.5 text-xs ${i > 0 ? 'border-t border-gray-50' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 font-medium truncate">{u.full_name || 'Без имени'}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{getRoleLabel(u.role)}</p>
                </div>
                <span className="text-red-500 font-semibold ml-2 flex-shrink-0">
                  {u.days_inactive !== null ? `${u.days_inactive} дн.` : 'никогда'}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Permissions summary */}
      <Section title="Допуски к услугам">
        <div className="grid grid-cols-2 gap-2">
          {data.permissions_summary.map((p) => (
            <div key={p.service} className="bg-white rounded-2xl p-3 shadow-sm border border-gray-50">
              <p className="text-xs text-gray-500 line-clamp-1">{p.service_name}</p>
              <p className="text-xl font-extrabold text-gray-900 mt-1">{p.count_active}</p>
              <p className="text-[10px] text-gray-400">мастеров допущено</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Top students */}
      {data.top_students.length > 0 && (
        <Section title="Топ сотрудников">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-50 overflow-hidden">
            {data.top_students.map((u, i) => (
              <div
                key={u.user_id}
                className={`flex items-center gap-3 px-3 py-3 ${i > 0 ? 'border-t border-gray-50' : ''}`}
              >
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 font-medium truncate">{u.full_name || 'Без имени'}</p>
                  <p className="text-[10px] text-gray-400">{getRoleLabel(u.role)} · {u.completed_lessons} уроков</p>
                </div>
                <span className="text-xs font-bold text-accent flex-shrink-0">{u.progress_percent}%</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Studios */}
      {data.users_by_studio.length > 0 && (
        <Section title="По студиям">
          <div className="space-y-2">
            {data.users_by_studio.map((s) => (
              <div key={s.studio_name} className="bg-white rounded-2xl p-3 shadow-sm border border-gray-50">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-gray-900 truncate">{s.studio_name}</p>
                    {s.city && <p className="text-[10px] text-gray-400">{s.city}</p>}
                  </div>
                  <span className="text-lg font-extrabold text-gray-900 flex-shrink-0">{s.total}</span>
                </div>
                <div className="flex gap-3 text-[11px] text-gray-500 mt-1">
                  <span className="text-green-600">✓ {s.active} активных</span>
                  {s.blocked > 0 && <span className="text-red-500">⚠ {s.blocked} заблокировано</span>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-3 rounded-2xl shadow-lg max-w-xs text-center">
          {toast}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-50">
      <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center`}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      </div>
      <p className="text-xl font-extrabold text-gray-900 mt-2">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="mt-5 px-4">
      <h2 className="font-bold text-sm text-gray-900 mb-2">{title}</h2>
      {children}
    </section>
  );
}

function EmptyText({ children }) {
  return <p className="text-sm text-gray-400 text-center py-6">{children}</p>;
}
