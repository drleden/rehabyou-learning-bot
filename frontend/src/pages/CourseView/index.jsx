import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "../../api";
import "./CourseView.css";

const useCourseProgress = (id) =>
  useQuery({
    queryKey: ["course-progress", id],
    queryFn: () => api.get(`/api/learning/courses/${id}`).then(r => r.data),
    enabled: id != null,
    retry: false,
  });

function ProgressBar({ percent }) {
  const p = Math.min(100, Math.max(0, percent));
  return (
    <div className="cv-prog-wrap">
      <div className="cv-prog-meta">
        <span className="cv-prog-label">Общий прогресс</span>
        <span className="cv-prog-pct">{p}%</span>
      </div>
      <div className="cv-prog-track">
        <div className="cv-prog-fill" style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

const STATUS_ICON = {
  completed: "✅",
  available: "⭕",
  locked:    "🔒",
};

const STATUS_CLS = {
  completed: "cv-lesson--done",
  available: "cv-lesson--open",
  locked:    "cv-lesson--locked",
};

function LessonItem({ lesson, isNext }) {
  const icon   = STATUS_ICON[lesson.lesson_status] ?? "⭕";
  const cls    = STATUS_CLS[lesson.lesson_status] ?? "";
  const locked = lesson.lesson_status === "locked";

  const inner = (
    <div className={`cv-lesson ${cls} ${isNext ? "cv-lesson--next" : ""}`}>
      <span className="cv-lesson-icon">{icon}</span>
      <div className="cv-lesson-info">
        <span className="cv-lesson-title">{lesson.title}</span>
        <div className="cv-lesson-tags">
          {lesson.has_test       && <span className="cv-tag cv-tag--test">Тест</span>}
          {lesson.has_assignment && <span className="cv-tag cv-tag--hw">Задание</span>}
        </div>
      </div>
      {!locked && <span className="cv-lesson-arrow">›</span>}
    </div>
  );

  if (locked) return inner;
  return <Link to={`/lessons/${lesson.id}`} className="cv-lesson-link">{inner}</Link>;
}

function ModuleSection({ module, nextLessonId }) {
  const allDone = module.lessons.every(l => l.lesson_status === "completed");
  return (
    <div className="cv-module">
      <div className="cv-module-hd">
        <span className={`cv-module-dot ${allDone ? "cv-module-dot--done" : ""}`} />
        <span className="cv-module-title">{module.title}</span>
        <span className="cv-module-count">
          {module.lessons.filter(l => l.lesson_status === "completed").length} / {module.lessons.length}
        </span>
      </div>
      <div className="cv-module-lessons">
        {module.lessons.map(l => (
          <LessonItem
            key={l.id} lesson={l}
            isNext={l.id === nextLessonId}
          />
        ))}
      </div>
    </div>
  );
}

export default function CourseView() {
  const { id } = useParams();
  const { data: course, isLoading, isError } = useCourseProgress(Number(id));

  if (isLoading) {
    return (
      <div className="cv-page">
        <header className="cv-header">
          <Link to="/courses" className="cv-back">‹</Link>
          <span className="cv-header-title">Загрузка…</span>
        </header>
        <div className="cv-skeleton-list">
          {[0, 1, 2, 3].map(i => <div key={i} className="cv-skeleton-row" />)}
        </div>
      </div>
    );
  }

  if (isError || !course) {
    return (
      <div className="cv-page">
        <header className="cv-header">
          <Link to="/courses" className="cv-back">‹</Link>
          <span className="cv-header-title">Ошибка</span>
        </header>
        <p className="cv-empty">Курс не найден или недоступен.</p>
      </div>
    );
  }

  const allDone = course.completed >= course.total && course.total > 0;

  return (
    <div className="cv-page">
      <header className="cv-header">
        <Link to="/courses" className="cv-back">‹</Link>
        <span className="cv-header-title">{course.title}</span>
      </header>

      <div className="cv-summary">
        <ProgressBar percent={course.percent} />
        <div className="cv-stats">
          <span className="cv-stat">
            {course.completed} из {course.total} уроков завершено
          </span>
          {allDone && <span className="cv-done-badge">🎉 Курс пройден!</span>}
        </div>

        {course.next_lesson_id && !allDone && (
          <Link to={`/lessons/${course.next_lesson_id}`} className="cv-continue-btn">
            ▶ Продолжить обучение
          </Link>
        )}
      </div>

      <div className="cv-section-label">Программа курса</div>

      <div className="cv-modules">
        {course.modules.length === 0
          ? <p className="cv-empty">Модули ещё не добавлены</p>
          : course.modules.map(m => (
              <ModuleSection
                key={m.id} module={m}
                nextLessonId={course.next_lesson_id}
              />
            ))
        }
      </div>
    </div>
  );
}
