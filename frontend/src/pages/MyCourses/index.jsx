import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "../../api";
import "./MyCourses.css";

const useMyCourses = () =>
  useQuery({
    queryKey: ["my-courses"],
    queryFn: () => api.get("/api/learning/courses").then(r => r.data),
    placeholderData: [],
    retry: false,
  });

function ProgressBar({ percent }) {
  const p = Math.min(100, Math.max(0, percent));
  return (
    <div className="mc-prog-track">
      <div className="mc-prog-fill" style={{ width: `${p}%` }} />
    </div>
  );
}

const STATUS_LABEL = {
  not_started: "Не начат",
  in_progress:  "В процессе",
  completed:    "Завершён",
};
const STATUS_CLS = {
  not_started: "mc-badge--new",
  in_progress:  "mc-badge--active",
  completed:    "mc-badge--done",
};

function CourseCard({ course }) {
  const { course_status, title, description, completed, total, percent } = course;
  const btnLabel = course_status === "not_started" ? "Начать" : course_status === "completed" ? "Повторить" : "Продолжить";

  return (
    <Link to={`/courses/${course.id}`} className="mc-card">
      <div className="mc-card-top">
        <span className="mc-icon">📚</span>
        <span className={`mc-badge ${STATUS_CLS[course_status]}`}>
          {STATUS_LABEL[course_status]}
        </span>
      </div>
      <div className="mc-title">{title}</div>
      {description && <div className="mc-desc">{description}</div>}
      <div className="mc-stats">
        <span className="mc-stat">{completed} / {total} уроков</span>
        <span className="mc-pct">{percent}%</span>
      </div>
      <ProgressBar percent={percent} />
      <div className="mc-btn">{btnLabel} →</div>
    </Link>
  );
}

const FILTERS = [
  { key: "all",         label: "Все" },
  { key: "in_progress", label: "В процессе" },
  { key: "completed",   label: "Завершённые" },
];

export default function MyCourses() {
  const { data: courses = [], isLoading } = useMyCourses();
  const [filter, setFilter] = useState("all");

  const filtered = filter === "all"
    ? courses
    : courses.filter(c => c.course_status === filter);

  return (
    <div className="mc-page">
      <header className="mc-header">
        <Link to="/" className="mc-back">‹</Link>
        <span className="mc-header-title">Мои курсы</span>
      </header>

      <div className="mc-filters">
        {FILTERS.map(f => (
          <button
            key={f.key}
            className={`mc-filter-btn ${filter === f.key ? "mc-filter-btn--on" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mc-list">
        {isLoading
          ? [0, 1].map(i => <div key={i} className="mc-card mc-card--skeleton" />)
          : filtered.length === 0
            ? (
              <div className="mc-empty">
                {filter === "all"
                  ? "Курсы не назначены. Обратитесь к администратору."
                  : "Нет курсов в этой категории."}
              </div>
            )
            : filtered.map(c => <CourseCard key={c.id} course={c} />)
        }
      </div>
    </div>
  );
}
