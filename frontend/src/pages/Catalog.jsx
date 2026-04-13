import { useNavigate } from 'react-router-dom';
import CourseCard from '../components/CourseCard';
import SectionHeader from '../components/SectionHeader';
import useAuthStore, { hasMinimumRole } from '../store/authStore';

const continueCourse = {
  id: 1,
  title: 'Основы реабилитации после травм плечевого сустава',
  progress: 65,
  currentLesson: 'Урок 8: Мобилизация тканей',
  cover: null,
};

const recommendedCourses = [
  {
    id: 2,
    title: 'Функциональная диагностика опорно-двигательного аппарата',
    lessons: 12,
    duration: '3 ч 40 мин',
    tag: 'Хит',
    cover: null,
  },
  {
    id: 3,
    title: 'Тейпирование: продвинутый курс',
    lessons: 8,
    duration: '2 ч 15 мин',
    tag: 'Новое',
    cover: null,
  },
  {
    id: 4,
    title: 'Нейрореабилитация: базовый модуль',
    lessons: 15,
    duration: '5 ч 20 мин',
    cover: null,
  },
  {
    id: 5,
    title: 'Биомеханика движения для реабилитологов',
    lessons: 10,
    duration: '3 ч 00 мин',
    cover: null,
  },
];

const knowledgeArticles = [
  {
    id: 1,
    title: 'Протоколы восстановления ACL: обновлённые данные 2025',
    category: 'Ортопедия',
    readTime: '7 мин',
  },
  {
    id: 2,
    title: 'Нейропластичность и двигательное обучение',
    category: 'Нейрореабилитация',
    readTime: '5 мин',
  },
  {
    id: 3,
    title: 'Миофасциальные цепи: клиническое применение',
    category: 'Мануальная терапия',
    readTime: '10 мин',
  },
];

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.map((p) => p[0]).join('').toUpperCase().slice(0, 2);
}

export default function Catalog() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isManager = user && hasMinimumRole(user.role, 'manager');

  return (
    <div className="bg-white min-h-screen">
      {/* Header */}
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
            <span className="text-accent font-bold text-sm">
              {getInitials(user?.full_name)}
            </span>
          </button>
        </div>
      </header>

      {/* Continue learning banner */}
      <section className="px-4 mt-4">
        <div className="bg-gradient-to-r from-accent to-orange-500 rounded-2xl p-4 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-8 translate-x-8" />
          <div className="absolute bottom-0 left-0 w-20 h-20 bg-white/5 rounded-full translate-y-6 -translate-x-6" />
          <p className="text-xs font-medium text-white/80 uppercase tracking-wide">
            Продолжить обучение
          </p>
          <h3 className="font-bold text-base mt-1 leading-tight pr-8">
            {continueCourse.title}
          </h3>
          <p className="text-xs text-white/70 mt-2">
            {continueCourse.currentLesson}
          </p>
          {/* Progress bar */}
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all"
                style={{ width: `${continueCourse.progress}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-white/90">
              {continueCourse.progress}%
            </span>
          </div>
        </div>
      </section>

      {/* Recommended */}
      <section className="mt-6">
        <SectionHeader title="Рекомендованное" action="Все курсы" />
        <div className="flex gap-3 overflow-x-auto scrollbar-hide px-4 pb-2">
          {recommendedCourses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      </section>

      {/* Knowledge base */}
      <section className="mt-6 pb-6">
        <SectionHeader title="Новое в базе знаний" action="Все статьи" />
        <div className="px-4 space-y-3">
          {knowledgeArticles.map((article) => (
            <article
              key={article.id}
              className="flex items-start gap-3 p-3 rounded-xl bg-surface hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center mt-0.5">
                <svg
                  className="w-5 h-5 text-accent"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm text-gray-900 leading-tight">
                  {article.title}
                </h3>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs text-accent font-medium">
                    {article.category}
                  </span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs text-gray-400">
                    {article.readTime}
                  </span>
                </div>
              </div>
              <svg
                className="w-5 h-5 text-gray-300 flex-shrink-0 mt-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
