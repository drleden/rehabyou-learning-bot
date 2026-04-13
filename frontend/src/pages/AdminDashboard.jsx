import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSnapshot } from '../api/admin';

const STAT_ICONS = {
  employees: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  courses: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  activity: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
};

const managementSections = [
  {
    title: 'Сотрудники',
    description: 'Управление доступом и отслеживание прогресса',
    path: '/admin/employees',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    title: 'Студии',
    description: 'Управление студиями и привязка сотрудников',
    path: '/admin/studios',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    title: 'Управление курсами',
    description: 'Создание, редактирование и публикация курсов',
    path: '/admin/courses',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  {
    title: 'База знаний',
    description: 'Статьи, протоколы и справочные материалы',
    path: null,
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    title: 'Аналитика',
    description: 'Отчёты об обучении и вовлечённости',
    path: null,
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    title: 'Настройки',
    description: 'Конфигурация платформы и уведомления',
    path: null,
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    getSnapshot().then(setSnapshot).catch(() => {});
  }, []);

  const totalUsers = snapshot
    ? Object.values(snapshot.users_by_role).reduce((a, b) => a + b, 0)
    : '—';
  const totalCourses = snapshot
    ? snapshot.course_progress.length
    : '—';
  const activePercent = snapshot
    ? Math.round(((totalUsers - (snapshot.inactive_users?.length || 0)) / (totalUsers || 1)) * 100) + '%'
    : '—';

  const stats = [
    { label: 'Сотрудники', value: totalUsers, icon: STAT_ICONS.employees, color: 'bg-blue-50 text-blue-600' },
    { label: 'Курсы', value: totalCourses, icon: STAT_ICONS.courses, color: 'bg-accent/10 text-accent' },
    { label: 'Активность', value: activePercent, icon: STAT_ICONS.activity, color: 'bg-green-50 text-green-600' },
  ];

  return (
    <div className="bg-surface min-h-screen pb-8">
      {/* Header */}
      <header className="bg-white px-4 pt-4 pb-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
              Панель управления
            </p>
            <h1 className="text-xl font-extrabold text-gray-900 mt-0.5">
              Администрирование
            </h1>
          </div>
          <button
            onClick={() => navigate('/')}
            className="text-sm text-accent font-semibold hover:text-accent-hover transition-colors"
          >
            К каталогу →
          </button>
        </div>
      </header>

      {/* Stats cards */}
      <div className="px-4 mt-4 grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-2xl p-3 shadow-sm border border-gray-50"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stat.color}`}>
              {stat.icon}
            </div>
            <p className="text-xl font-extrabold text-gray-900 mt-2">
              {stat.value}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Management sections */}
      <div className="px-4 mt-6">
        <h2 className="text-lg font-bold text-gray-900 mb-3">Управление</h2>
        <div className="space-y-2">
          {managementSections.map((section) => (
            <button
              key={section.title}
              onClick={() => section.path && navigate(section.path)}
              className={`w-full flex items-center gap-4 p-4 bg-white rounded-2xl shadow-sm border border-gray-50 transition-colors text-left active:scale-[0.99] ${
                section.path ? 'hover:bg-gray-50' : 'opacity-60 cursor-default'
              }`}
            >
              <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
                {section.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm text-gray-900">
                  {section.title}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {section.description}
                </p>
              </div>
              <svg
                className="w-5 h-5 text-gray-300 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
