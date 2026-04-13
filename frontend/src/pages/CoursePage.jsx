import { useParams, useNavigate } from 'react-router-dom';

const courseData = {
  id: 2,
  title: 'Функциональная диагностика опорно-двигательного аппарата',
  description:
    'Комплексный курс по функциональной диагностике, включающий современные методы оценки подвижности, силы и паттернов движения. Вы научитесь проводить полноценное обследование пациента и составлять план реабилитации.',
  cover: null,
  author: 'Д-р Алексей Иванов',
  duration: '3 ч 40 мин',
  lessonsCount: 12,
  modules: [
    {
      id: 1,
      title: 'Модуль 1: Введение в диагностику',
      lessons: [
        { id: 1, title: 'Принципы функциональной диагностики', duration: '15 мин', completed: true },
        { id: 2, title: 'Анатомические ориентиры', duration: '22 мин', completed: true },
        { id: 3, title: 'Инструменты обследования', duration: '18 мин', completed: false },
      ],
    },
    {
      id: 2,
      title: 'Модуль 2: Оценка подвижности',
      lessons: [
        { id: 4, title: 'Гониометрия: основы', duration: '20 мин', completed: false },
        { id: 5, title: 'Тесты подвижности плеча', duration: '25 мин', completed: false },
        { id: 6, title: 'Тесты подвижности тазобедренного сустава', duration: '20 мин', completed: false },
      ],
    },
    {
      id: 3,
      title: 'Модуль 3: Мышечное тестирование',
      lessons: [
        { id: 7, title: 'Мануальное мышечное тестирование', duration: '22 мин', completed: false },
        { id: 8, title: 'Оценка баланса и координации', duration: '18 мин', completed: false },
        { id: 9, title: 'Функциональные тесты', duration: '25 мин', completed: false },
      ],
    },
    {
      id: 4,
      title: 'Модуль 4: Практикум',
      lessons: [
        { id: 10, title: 'Кейс 1: Плечевой сустав', duration: '15 мин', completed: false },
        { id: 11, title: 'Кейс 2: Коленный сустав', duration: '15 мин', completed: false },
        { id: 12, title: 'Итоговое тестирование', duration: '10 мин', completed: false },
      ],
    },
  ],
};

export default function CoursePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const course = courseData; // In real app, fetch by id

  const totalLessons = course.modules.reduce((sum, m) => sum + m.lessons.length, 0);
  const completedLessons = course.modules.reduce(
    (sum, m) => sum + m.lessons.filter((l) => l.completed).length,
    0
  );

  return (
    <div className="bg-white min-h-screen pb-24">
      {/* Cover */}
      <div className="relative">
        <div className="aspect-video bg-gradient-to-br from-accent/20 to-orange-100 flex items-center justify-center">
          {course.cover ? (
            <img src={course.cover} alt={course.title} className="w-full h-full object-cover" />
          ) : (
            <svg className="w-16 h-16 text-accent/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z" />
            </svg>
          )}
        </div>

        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm"
        >
          <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Course info */}
      <div className="px-4 pt-4">
        <h1 className="text-xl font-extrabold text-gray-900 leading-tight">
          {course.title}
        </h1>

        <div className="flex items-center gap-3 mt-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {course.duration}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            {course.lessonsCount} уроков
          </div>
          <span className="text-xs text-gray-500">·</span>
          <span className="text-xs text-gray-500">{course.author}</span>
        </div>

        {/* Progress */}
        {completedLessons > 0 && (
          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all"
                style={{ width: `${Math.round((completedLessons / totalLessons) * 100)}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-gray-500">
              {completedLessons}/{totalLessons}
            </span>
          </div>
        )}

        <p className="text-sm text-gray-600 leading-relaxed mt-4">
          {course.description}
        </p>

        {/* Start button */}
        <button className="w-full h-12 mt-5 bg-accent hover:bg-accent-hover text-white font-semibold rounded-xl transition-colors shadow-sm shadow-accent/20 active:scale-[0.98]">
          {completedLessons > 0 ? 'Продолжить обучение' : 'Начать курс'}
        </button>
      </div>

      {/* Modules */}
      <div className="mt-6 px-4 space-y-4">
        {course.modules.map((module) => (
          <div key={module.id}>
            <h3 className="font-bold text-sm text-gray-900 mb-2">{module.title}</h3>
            <div className="space-y-1">
              {module.lessons.map((lesson) => (
                <div
                  key={lesson.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-surface hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  {/* Status icon */}
                  <div
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      lesson.completed
                        ? 'bg-green-500 text-white'
                        : 'bg-white border-2 border-gray-200 text-gray-400'
                    }`}
                  >
                    {lesson.completed ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      </svg>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm leading-tight ${
                        lesson.completed ? 'text-gray-500' : 'text-gray-900 font-medium'
                      }`}
                    >
                      {lesson.title}
                    </p>
                  </div>

                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {lesson.duration}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
