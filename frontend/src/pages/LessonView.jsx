import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Markdown from 'react-markdown';
import client from '../api/client';
import { updateLessonProgress } from '../api/courses';

export default function LessonView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [courseId, setCourseId] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await client.get(`/lessons/${id}`);
        setLesson(data);

        // Get progress
        try {
          const { data: prog } = await client.get(`/lessons/${id}/progress`);
          if (prog && prog.status === 'completed') setCompleted(true);
        } catch { /* no progress yet */ }

        // Find course id by going module → course
        try {
          const { data: courses } = await client.get('/courses/');
          for (const c of courses) {
            const { data: detail } = await client.get(`/courses/${c.id}`);
            const found = (detail.modules || []).some((m) =>
              (m.lessons || []).some((l) => l.id === parseInt(id))
            );
            if (found) { setCourseId(c.id); break; }
          }
        } catch { /* ok */ }
      } catch { navigate('/'); }
      setLoading(false);
    })();
  }, [id]);

  const handleComplete = async () => {
    setCompleting(true);
    try {
      await updateLessonProgress(id, 'completed');
      setCompleted(true);
    } catch { /* interceptor */ }
    setCompleting(false);
  };

  if (loading || !lesson) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen pb-24">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => courseId ? navigate(`/course/${courseId}`) : navigate(-1)}
            className="text-gray-400"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-sm text-gray-900 truncate">{lesson.title}</h1>
          </div>
        </div>
      </header>

      <div className="px-4 pt-4">
        {lesson.video_url && (
          <div className="rounded-2xl overflow-hidden bg-black mb-4">
            <video
              src={lesson.video_url}
              controls
              playsInline
              className="w-full aspect-video"
            />
          </div>
        )}

        {lesson.content_text && (
          <div className="prose prose-sm prose-gray max-w-none">
            <Markdown>{lesson.content_text}</Markdown>
          </div>
        )}

        {!lesson.content_text && !lesson.video_url && (
          <p className="text-center text-gray-400 py-12 text-sm">Контент урока пока не добавлен</p>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4">
        {completed ? (
          <div className="flex items-center justify-center gap-2 h-12 bg-green-50 rounded-xl">
            <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm font-semibold text-green-700">Урок пройден</span>
          </div>
        ) : (
          <button
            onClick={handleComplete}
            disabled={completing}
            className="w-full h-12 bg-accent hover:bg-accent-hover disabled:opacity-60 text-white font-semibold rounded-xl transition-colors active:scale-[0.98] flex items-center justify-center"
          >
            {completing ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              'Отметить как пройденный'
            )}
          </button>
        )}
      </div>
    </div>
  );
}
