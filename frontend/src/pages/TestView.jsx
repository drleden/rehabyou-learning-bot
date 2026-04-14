import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTestFullByLesson, submitTest } from '../api/tests';
import { updateLessonProgress } from '../api/courses';
import client from '../api/client';

export default function TestView() {
  const { lessonId } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState(null);
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [testData, { data: lessonData }] = await Promise.all([
          getTestFullByLesson(lessonId),
          client.get(`/lessons/${lessonId}`),
        ]);
        setTest(testData);
        setLesson(lessonData);
      } catch { navigate('/'); }
      setLoading(false);
    })();
  }, [lessonId]);

  const handleSelect = (questionId, answerId) => {
    setAnswers((prev) => ({ ...prev, [String(questionId)]: String(answerId) }));
  };

  const handleSubmit = async () => {
    if (!test) return;
    setSubmitting(true);
    try {
      const res = await submitTest(test.id, answers);
      setResult({
        score: res.score,
        passed: res.passed,
        correct: Object.values(answers).length,
        total: test.questions.length,
        passThreshold: test.pass_threshold,
      });
      if (res.passed) {
        await updateLessonProgress(lessonId, 'completed');
      }
    } catch { /* interceptor */ }
    setSubmitting(false);
  };

  const handleRetry = () => {
    setAnswers({});
    setCurrentQ(0);
    setResult(null);
  };

  if (loading || !test || !lesson) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!test.questions || test.questions.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6 gap-4">
        <p className="text-sm text-gray-500">Тест пока не содержит вопросов</p>
        <button onClick={() => navigate(`/lesson/${lessonId}`)} className="text-sm text-accent font-semibold">
          ← Назад к уроку
        </button>
      </div>
    );
  }

  // Result screen
  if (result) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 ${
          result.passed ? 'bg-green-100' : 'bg-red-100'
        }`}>
          <span className="text-4xl">{result.passed ? '🎉' : '😔'}</span>
        </div>
        <h2 className={`text-2xl font-extrabold ${result.passed ? 'text-green-600' : 'text-red-500'}`}>
          {result.passed ? 'Тест пройден!' : 'Тест не пройден'}
        </h2>
        <p className="text-5xl font-extrabold text-gray-900 mt-3">{result.score}%</p>
        <p className="text-sm text-gray-500 mt-2">
          Порог прохождения: {result.passThreshold}%
        </p>
        <div className="mt-8 w-full space-y-3">
          {result.passed ? (
            <button
              onClick={() => navigate(lesson.course_id ? `/course/${lesson.course_id}` : '/')}
              className="w-full h-12 bg-accent hover:bg-accent-hover text-white font-semibold rounded-xl transition-colors active:scale-[0.98] flex items-center justify-center gap-2"
            >
              Продолжить курс
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleRetry}
              className="w-full h-12 bg-accent hover:bg-accent-hover text-white font-semibold rounded-xl transition-colors active:scale-[0.98]"
            >
              Попробовать снова
            </button>
          )}
          <button
            onClick={() => navigate(`/lesson/${lessonId}`)}
            className="w-full h-12 border border-gray-200 text-gray-700 font-semibold rounded-xl transition-colors hover:bg-surface active:scale-[0.98]"
          >
            Вернуться к уроку
          </button>
        </div>
      </div>
    );
  }

  // Question screen
  const questions = test.questions;
  const question = questions[currentQ];
  const selectedAnswer = answers[String(question.id)];

  return (
    <div className="bg-white min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/lesson/${lessonId}`)} className="text-gray-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-sm text-gray-900 truncate">Тест</h1>
            <p className="text-xs text-gray-400">Вопрос {currentQ + 1} из {questions.length}</p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all"
            style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }}
          />
        </div>
      </header>

      <div className="flex-1 px-4 pt-6 pb-4">
        <h2 className="text-lg font-bold text-gray-900 leading-tight">{question.question_text}</h2>
        <div className="mt-5 space-y-2">
          {(question.answers || []).map((ans) => (
            <button
              key={ans.id}
              onClick={() => handleSelect(question.id, ans.id)}
              className={`w-full p-4 rounded-xl text-left text-sm font-medium transition-all border-2 ${
                String(selectedAnswer) === String(ans.id)
                  ? 'border-accent bg-accent/5 text-accent'
                  : 'border-gray-100 bg-white text-gray-700 hover:border-gray-200'
              }`}
            >
              {ans.answer_text}
            </button>
          ))}
        </div>
      </div>

      <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4">
        {currentQ < questions.length - 1 ? (
          <button
            onClick={() => setCurrentQ((p) => p + 1)}
            disabled={!selectedAnswer}
            className="w-full h-12 bg-accent hover:bg-accent-hover disabled:opacity-40 text-white font-semibold rounded-xl transition-colors active:scale-[0.98]"
          >
            Далее
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!selectedAnswer || submitting}
            className="w-full h-12 bg-accent hover:bg-accent-hover disabled:opacity-40 text-white font-semibold rounded-xl transition-colors active:scale-[0.98] flex items-center justify-center"
          >
            {submitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              'Завершить тест'
            )}
          </button>
        )}
      </div>
    </div>
  );
}
