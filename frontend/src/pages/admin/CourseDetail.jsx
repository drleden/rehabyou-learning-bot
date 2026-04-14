import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getRoleLabel } from '../../utils/roles';
import { getTestByLesson, createTestFull } from '../../api/tests';
import {
  getCourse,
  publishCourse,
  unpublishCourse,
  createModule,
  deleteModule,
  createLesson,
  deleteLesson,
} from '../../api/courses';
import { getPresignedUrl, uploadToS3 } from '../../api/upload';

export default function CourseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openModules, setOpenModules] = useState({});
  const [showAddModule, setShowAddModule] = useState(false);
  const [addLessonModuleId, setAddLessonModuleId] = useState(null);
  const [testLessonId, setTestLessonId] = useState(null);
  const [testsMap, setTestsMap] = useState({});

  const fetchCourse = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCourse(id);
      setCourse(data);
      const open = {};
      (data.modules || []).forEach((m) => { open[m.id] = true; });
      setOpenModules(open);
      // Load test info for each lesson
      const tMap = {};
      const allLessons = (data.modules || []).flatMap((m) => m.lessons || []);
      await Promise.all(allLessons.map(async (l) => {
        try {
          const t = await getTestByLesson(l.id);
          if (t) tMap[l.id] = t;
        } catch { /* no test */ }
      }));
      setTestsMap(tMap);
    } catch (err) {
      setError(err.response?.data?.detail || 'Не удалось загрузить курс');
    }
    setLoading(false);
  };

  useEffect(() => { fetchCourse(); }, [id]);

  const handlePublish = async () => {
    try {
      if (course.is_published) {
        await unpublishCourse(course.id);
      } else {
        await publishCourse(course.id);
      }
      fetchCourse();
    } catch { /* interceptor */ }
  };

  const handleDeleteModule = async (moduleId) => {
    if (!window.confirm('Удалить модуль и все его уроки?')) return;
    await deleteModule(moduleId);
    fetchCourse();
  };

  const handleDeleteLesson = async (lessonId) => {
    if (!window.confirm('Удалить урок?')) return;
    await deleteLesson(lessonId);
    fetchCourse();
  };

  const toggleModule = (moduleId) => {
    setOpenModules((prev) => ({ ...prev, [moduleId]: !prev[moduleId] }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6 gap-4">
        <p className="text-sm text-red-500">{error || 'Курс не найден'}</p>
        <button onClick={() => navigate('/admin/courses')} className="text-sm text-accent font-semibold">
          ← Назад к курсам
        </button>
      </div>
    );
  }

  const modules = course.modules || [];

  return (
    <div className="bg-white min-h-screen pb-8">
      {/* Cover */}
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
        <button onClick={() => navigate('/admin/courses')} className="absolute top-4 left-4 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm">
          <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className={`absolute top-4 right-4 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
          course.is_published ? 'bg-green-500 text-white' : 'bg-gray-700/70 text-white'
        }`}>
          {course.is_published ? 'Опубликован' : 'Черновик'}
        </span>
      </div>

      {/* Info */}
      <div className="px-4 pt-4">
        <h1 className="text-xl font-extrabold text-gray-900 leading-tight">{course.title}</h1>
        {course.description && (
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">{course.description}</p>
        )}
        {course.target_roles && course.target_roles.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {course.target_roles.map((r) => (
              <span key={r} className="text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded-full font-medium">{getRoleLabel(r)}</span>
            ))}
          </div>
        )}
        <div className="flex gap-2 mt-3">
          <button
            onClick={handlePublish}
            className={`flex-1 h-10 rounded-xl text-sm font-semibold transition-colors ${
              course.is_published
                ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                : 'bg-green-50 text-green-700 hover:bg-green-100'
            }`}
          >
            {course.is_published ? 'Снять с публикации' : 'Опубликовать'}
          </button>
        </div>
      </div>

      {/* Modules */}
      <div className="px-4 mt-6">
        <h2 className="font-bold text-sm text-gray-900 mb-3">
          Модули ({modules.length})
        </h2>

        {modules.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">Пока нет модулей. Добавьте первый!</p>
        )}

        <div className="space-y-2">
          {modules.map((module) => {
            const lessons = module.lessons || [];
            return (
              <div key={module.id} className="bg-surface rounded-2xl overflow-hidden">
                <button
                  onClick={() => toggleModule(module.id)}
                  className="w-full flex items-center justify-between p-3 text-left"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${openModules[module.id] ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="font-semibold text-sm text-gray-900 truncate">{module.title}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{lessons.length} уроков</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteModule(module.id); }}
                    className="text-gray-300 hover:text-red-500 transition-colors p-1"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </button>

                {openModules[module.id] && (
                  <div className="px-3 pb-3 space-y-1">
                    {lessons.map((lesson) => (
                      <div key={lesson.id} className="flex items-center gap-3 p-2.5 bg-white rounded-xl">
                        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                          {lesson.video_url ? (
                            <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          )}
                        </div>
                        <span className="flex-1 text-sm text-gray-900 truncate">{lesson.title}</span>
                        <button
                          onClick={() => setTestLessonId(lesson.id)}
                          className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors ${
                            testsMap[lesson.id]
                              ? 'bg-green-50 text-green-600'
                              : 'bg-gray-100 text-gray-400 hover:text-accent hover:bg-accent/10'
                          }`}
                        >
                          {testsMap[lesson.id] ? '📝 Тест' : '+ Тест'}
                        </button>
                        <button
                          onClick={() => handleDeleteLesson(lesson.id)}
                          className="text-gray-300 hover:text-red-500 transition-colors p-1"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => setAddLessonModuleId(module.id)}
                      className="w-full flex items-center justify-center gap-1 p-2 rounded-xl border border-dashed border-gray-300 text-xs text-gray-400 hover:border-accent hover:text-accent transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Добавить урок
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={() => setShowAddModule(true)}
          className="w-full mt-3 flex items-center justify-center gap-2 p-3 rounded-2xl border-2 border-dashed border-gray-200 text-sm text-gray-400 hover:border-accent hover:text-accent transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Добавить модуль
        </button>
      </div>

      {showAddModule && (
        <AddModuleSheet
          courseId={course.id}
          nextOrder={modules.length}
          onClose={() => setShowAddModule(false)}
          onCreated={() => { setShowAddModule(false); fetchCourse(); }}
        />
      )}

      {addLessonModuleId && (
        <AddLessonSheet
          moduleId={addLessonModuleId}
          nextOrder={modules.find((m) => m.id === addLessonModuleId)?.lessons?.length || 0}
          onClose={() => setAddLessonModuleId(null)}
          onCreated={() => { setAddLessonModuleId(null); fetchCourse(); }}
        />
      )}

      {testLessonId && (
        <TestEditorSheet
          lessonId={testLessonId}
          existingTest={testsMap[testLessonId] || null}
          onClose={() => setTestLessonId(null)}
          onSaved={() => { setTestLessonId(null); fetchCourse(); }}
        />
      )}
    </div>
  );
}

function AddModuleSheet({ courseId, nextOrder, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    await createModule({ course_id: courseId, title: title.trim(), order_index: nextOrder });
    setLoading(false);
    onCreated();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <h3 className="font-bold text-lg text-gray-900 mb-4">Новый модуль</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название модуля"
            autoFocus
            className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
          <button type="submit" disabled={loading} className="w-full h-11 bg-accent hover:bg-accent-hover disabled:opacity-60 text-white font-semibold rounded-xl text-sm">
            {loading ? 'Создание...' : 'Создать модуль'}
          </button>
        </form>
      </div>
    </div>
  );
}

function AddLessonSheet({ moduleId, nextOrder, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoName, setVideoName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleVideoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    setVideoName(file.name);
    try {
      const { upload_url, file_url } = await getPresignedUrl(file.name, file.type, 'videos');
      await uploadToS3(upload_url, file, setUploadProgress);
      setVideoUrl(file_url);
    } catch {
      setError('Ошибка загрузки видео');
      setVideoName('');
    }
    setUploading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError('');
    try {
      await createLesson({
        module_id: moduleId,
        title: title.trim(),
        content_text: content.trim() || null,
        video_url: videoUrl || null,
        order_index: nextOrder,
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
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl p-5 pb-8 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <h3 className="font-bold text-lg text-gray-900 mb-4">Новый урок</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название урока"
            autoFocus
            className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Текст урока (необязательно)"
            rows={5}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-surface text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">Видео</p>
            {videoUrl ? (
              <div className="flex items-center gap-2 p-3 bg-green-50 rounded-xl">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-green-700 truncate flex-1">{videoName}</span>
                <button type="button" onClick={() => { setVideoUrl(''); setVideoName(''); }} className="text-green-600 hover:text-red-500 text-xs font-medium">Убрать</button>
              </div>
            ) : (
              <label className={`flex items-center justify-center h-14 rounded-xl border-2 border-dashed border-gray-200 cursor-pointer hover:border-accent/40 transition-colors ${uploading ? 'opacity-60' : ''}`}>
                <input type="file" accept="video/*" onChange={handleVideoUpload} className="hidden" disabled={uploading} />
                {uploading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-gray-400">Загрузка {uploadProgress}%</span>
                  </div>
                ) : (
                  <span className="text-sm text-gray-400">Выбрать видеофайл</span>
                )}
              </label>
            )}
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={loading} className="w-full h-11 bg-accent hover:bg-accent-hover disabled:opacity-60 text-white font-semibold rounded-xl text-sm">
            {loading ? 'Создание...' : 'Создать урок'}
          </button>
        </form>
      </div>
    </div>
  );
}

function TestEditorSheet({ lessonId, existingTest, onClose, onSaved }) {
  const [threshold, setThreshold] = useState(existingTest?.pass_threshold || 95);
  const [questions, setQuestions] = useState([
    { text: '', answers: [{ text: '', correct: false }, { text: '', correct: false }, { text: '', correct: false }, { text: '', correct: true }] },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const addQuestion = () => {
    setQuestions((prev) => [...prev, {
      text: '', answers: [{ text: '', correct: false }, { text: '', correct: false }, { text: '', correct: false }, { text: '', correct: true }],
    }]);
  };

  const updateQuestionText = (qi, text) => {
    setQuestions((prev) => prev.map((q, i) => i === qi ? { ...q, text } : q));
  };

  const updateAnswerText = (qi, ai, text) => {
    setQuestions((prev) => prev.map((q, i) => i === qi ? {
      ...q, answers: q.answers.map((a, j) => j === ai ? { ...a, text } : a),
    } : q));
  };

  const setCorrectAnswer = (qi, ai) => {
    setQuestions((prev) => prev.map((q, i) => i === qi ? {
      ...q, answers: q.answers.map((a, j) => ({ ...a, correct: j === ai })),
    } : q));
  };

  const removeQuestion = (qi) => {
    setQuestions((prev) => prev.filter((_, i) => i !== qi));
  };

  const handleSave = async () => {
    if (existingTest) { onSaved(); return; }
    const valid = questions.every((q) => q.text.trim() && q.answers.some((a) => a.text.trim() && a.correct));
    if (!valid) { setError('Заполните все вопросы и отметьте правильный ответ'); return; }
    setLoading(true);
    setError('');
    try {
      await createTestFull({
        lesson_id: lessonId,
        pass_threshold: threshold,
        questions: questions.map((q, qi) => ({
          question_text: q.text.trim(),
          order_index: qi,
          answers: q.answers.filter((a) => a.text.trim()).map((a) => ({
            answer_text: a.text.trim(),
            is_correct: a.correct,
          })),
        })),
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка сохранения');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex-shrink-0 pt-3 pb-2">
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto" />
        </div>
        <div className="flex-shrink-0 px-5 pb-3 border-b border-gray-100">
          <h3 className="font-bold text-lg text-gray-900">
            {existingTest ? 'Тест создан' : 'Создать тест'}
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
          {existingTest ? (
            <div className="text-center py-6">
              <span className="text-3xl">📝</span>
              <p className="text-sm text-gray-600 mt-2">Порог: {existingTest.pass_threshold}%</p>
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium text-gray-600">Порог прохождения (%)</label>
                <input type="number" min={1} max={100} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-full h-10 px-3 mt-1 rounded-xl border border-gray-200 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
              </div>
              {questions.map((q, qi) => (
                <div key={qi} className="bg-surface rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500">Вопрос {qi + 1}</span>
                    {questions.length > 1 && (
                      <button onClick={() => removeQuestion(qi)} className="text-xs text-red-400 hover:text-red-600">Удалить</button>
                    )}
                  </div>
                  <input type="text" value={q.text} onChange={(e) => updateQuestionText(qi, e.target.value)} placeholder="Текст вопроса" className="w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                  <div className="space-y-1">
                    {q.answers.map((a, ai) => (
                      <div key={ai} className="flex items-center gap-2">
                        <button type="button" onClick={() => setCorrectAnswer(qi, ai)} className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${a.correct ? 'border-green-500 bg-green-500' : 'border-gray-300'}`}>
                          {a.correct && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                        </button>
                        <input type="text" value={a.text} onChange={(e) => updateAnswerText(qi, ai, e.target.value)} placeholder={`Вариант ${ai + 1}`} className="flex-1 h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <button type="button" onClick={addQuestion} className="w-full p-2 rounded-xl border border-dashed border-gray-300 text-xs text-gray-400 hover:border-accent hover:text-accent transition-colors">+ Добавить вопрос</button>
            </>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button onClick={handleSave} disabled={loading} className="w-full h-11 bg-accent hover:bg-accent-hover disabled:opacity-60 text-white font-semibold rounded-xl text-sm mb-2">
            {existingTest ? 'Закрыть' : loading ? 'Сохранение...' : 'Сохранить тест'}
          </button>
        </div>
      </div>
    </div>
  );
}
