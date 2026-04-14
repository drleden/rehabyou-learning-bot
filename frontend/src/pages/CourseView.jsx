import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getCourse, getLessonProgress } from '../api/courses';

export default function CourseView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openModules, setOpenModules] = useState({});
  const [progressMap, setProgressMap] = useState({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await getCourse(id);
        setCourse(data);
        const open = {};
        (data.modules || []).forEach((m) => { open[m.id] = true; });
        setOpenModules(open);

        const allLessons = (data.modules || []).flatMap((m) => m.lessons || []);
        const progs = {};
        await Promise.all(
          allLessons.map(async (l) => {
            try {
              const p = await getLessonProgress(l.id);
              if (p) progs[l.id] = p.status;
            } catch { /* no progress */ }
          })
        );
        setProgressMap(progs);
      } catch { /* interceptor */ }
      setLoading(false);
    })();
  }, [id]);

  const toggleModule = (mId) => {
    setOpenModules((prev) => ({ ...prev, [mId]: !prev[mId] }));
  };

  if (loading || !course) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const modules = course.modules || [];
  const allLessons = modules.flatMap((m) => m.lessons || []);

  const isLessonAvailable = (lesson, lessonIndex, moduleLessons) => {
    if (lessonIndex === 0) {
      const moduleIndex = modules.findIndex((m) => (m.lessons || []).some((l) => l.id === lesson.id));
      if (moduleIndex === 0) return true;
      const prevModule = modules[moduleIndex - 1];
      const prevLessons = prevModule?.lessons || [];
      if (prevLessons.length === 0) return true;
      const lastPrevLesson = prevLessons[prevLessons.length - 1];
      return progressMap[lastPrevLesson.id] === 'completed';
    }
    const prevLesson = moduleLessons[lessonIndex - 1];
    return progressMap[prevLesson.id] === 'completed';
  };

  return (
    <div className="bg-white min-h-screen pb-8">
      <div className="relative">
        <div
          className="h-[200px] flex items-center justify-center"
          style={{ background: course.cover_url ? undefined : 'linear-gradient(135deg, #e8571a 0%, #f7a24b 100%)' }}
        >
          {course.cover_url ? (
            <img src={course.cover_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-4xl opacity-40">📚</span>
          )}
        </div>
        <button onClick={() => navigate('/')} className="absolute top-4 left-4 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm">
          <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      <div className="px-4 pt-4">
        <h1 className="text-xl font-extrabold text-gray-900 leading-tight">{course.title}</h1>
        {course.description && (
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">{course.description}</p>
        )}
      </div>

      <div className="px-4 mt-5 space-y-2">
        {modules.map((module) => {
          const lessons = module.lessons || [];
          const completedCount = lessons.filter((l) => progressMap[l.id] === 'completed').length;
          return (
            <div key={module.id} className="bg-surface rounded-2xl overflow-hidden">
              <button onClick={() => toggleModule(module.id)} className="w-full flex items-center justify-between p-3 text-left">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${openModules[module.id] ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="font-semibold text-sm text-gray-900 truncate">{module.title}</span>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{completedCount}/{lessons.length}</span>
              </button>

              {openModules[module.id] && (
                <div className="px-3 pb-3 space-y-1">
                  {lessons.map((lesson, idx) => {
                    const status = progressMap[lesson.id];
                    const available = isLessonAvailable(lesson, idx, lessons);
                    const isCompleted = status === 'completed';

                    return (
                      <button
                        key={lesson.id}
                        onClick={() => available && navigate(`/lesson/${lesson.id}`)}
                        disabled={!available}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-colors ${
                          available ? 'bg-white active:bg-gray-50' : 'bg-white/50 opacity-50'
                        }`}
                      >
                        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                          isCompleted
                            ? 'bg-green-500 text-white'
                            : available
                              ? 'bg-accent text-white'
                              : 'bg-gray-200 text-gray-400'
                        }`}>
                          {isCompleted ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : available ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                          )}
                        </div>
                        <span className={`flex-1 text-sm truncate ${isCompleted ? 'text-gray-500' : 'text-gray-900'}`}>
                          {lesson.title}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
