/**
 * /academy — Академия новичков (для мастера/новичка)
 *
 * - Мой прогресс: статус, часы, посещения, пропуски
 * - Ближайшие/прошедшие занятия с кнопками «Записаться» / «Уведомить о неявке»
 * - Кнопка «Запросить аттестацию»
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../api";
import "./Academy.css";

// ── API hooks ─────────────────────────────────────────────────────────────────

const useMyProgress = () =>
  useQuery({
    queryKey: ["academy-progress"],
    queryFn: () => api.get("/api/academy/my-progress").then(r => r.data),
    retry: false,
  });

const useSchedule = (filter) =>
  useQuery({
    queryKey: ["academy-schedule", filter],
    queryFn: () => api.get(`/api/academy/schedule?filter=${filter}`).then(r => r.data),
    placeholderData: [],
    retry: false,
  });

function useMut(fn, invalidates) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => invalidates.forEach(k => qc.invalidateQueries({ queryKey: k })),
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABEL = {
  in_training:    "В обучении",
  base_certified: "Базовая аттестация ✓",
  full_certified: "Полная аттестация ✓",
  blocked:        "Заблокирован",
  failed:         "Не прошёл",
};

const STATUS_CLS = {
  in_training:    "ac-status--training",
  base_certified: "ac-status--cert",
  full_certified: "ac-status--full",
  blocked:        "ac-status--blocked",
  failed:         "ac-status--blocked",
};

function fmtDatetime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ── Absence notice modal ──────────────────────────────────────────────────────

function AbsenceModal({ scheduleId, onClose }) {
  const [reason, setReason] = useState("");
  const mut = useMut(
    () => api.post(`/api/academy/schedule/${scheduleId}/absence`, { reason }).then(r => r.data),
    [["academy-schedule", "upcoming"]]
  );

  const submit = (e) => {
    e.preventDefault();
    mut.mutate(undefined, { onSuccess: onClose });
  };

  return (
    <div className="ac-overlay" onClick={onClose}>
      <div className="ac-modal" onClick={e => e.stopPropagation()}>
        <div className="ac-modal-hd">
          <span className="ac-modal-title">Уведомление о неявке</span>
          <button className="ac-close" onClick={onClose}>✕</button>
        </div>
        <form className="ac-form" onSubmit={submit}>
          <label className="ac-label">Причина (необязательно)</label>
          <textarea className="ac-input ac-textarea" rows={3} value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Объясните причину…" />
          {mut.isError && (
            <p className="ac-err">{mut.error?.response?.data?.detail ?? "Ошибка"}</p>
          )}
          <button className="ac-btn-primary" type="submit" disabled={mut.isPending}>
            {mut.isPending ? <span className="ac-spinner" /> : "Отправить"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Class card ────────────────────────────────────────────────────────────────

function ClassCard({ item }) {
  const [absModal, setAbsModal] = useState(false);

  const enrollMut = useMut(
    () => api.post(`/api/academy/schedule/${item.id}/enroll`).then(r => r.data),
    [["academy-schedule", "upcoming"], ["academy-progress"]]
  );
  const unenrollMut = useMut(
    () => api.delete(`/api/academy/schedule/${item.id}/enroll`),
    [["academy-schedule", "upcoming"]]
  );

  const isPast = new Date(item.starts_at) <= new Date();

  return (
    <div className="ac-class-card">
      <div className="ac-class-dt">{fmtDatetime(item.starts_at)}</div>
      <div className="ac-class-topic">{item.topic}</div>
      {item.description && <div className="ac-class-desc">{item.description}</div>}
      <div className="ac-class-meta">
        <span className="ac-class-dur">⏱ {item.duration_minutes} мин</span>
        <span className="ac-class-cnt">👥 {item.enrolled_count} записан.</span>
      </div>

      {!isPast && !item.is_cancelled && (
        <div className="ac-class-actions">
          {item.is_enrolled
            ? (
              <>
                <span className="ac-enrolled-badge">✓ Вы записаны</span>
                <button className="ac-btn-ghost ac-btn-sm" onClick={() => setAbsModal(true)}>
                  Уведомить о неявке
                </button>
                <button
                  className="ac-btn-danger ac-btn-sm"
                  onClick={() => unenrollMut.mutate()}
                  disabled={unenrollMut.isPending}
                >
                  Отписаться
                </button>
              </>
            )
            : (
              <button
                className="ac-btn-primary"
                onClick={() => enrollMut.mutate()}
                disabled={enrollMut.isPending}
              >
                {enrollMut.isPending ? <span className="ac-spinner" /> : "Записаться"}
              </button>
            )
          }
        </div>
      )}
      {item.is_cancelled && <div className="ac-cancelled">❌ Отменено</div>}
      {absModal && <AbsenceModal scheduleId={item.id} onClose={() => setAbsModal(false)} />}
    </div>
  );
}

// ── Attestation section ───────────────────────────────────────────────────────

function AttestationSection({ progress }) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => api.post("/api/academy/attestation").then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["academy-progress"] }),
  });

  const attest = progress?.latest_attestation;
  const canRequest = progress?.can_request_attestation;
  const pendingAttest = attest?.result === "pending";

  return (
    <div className="ac-attest-section">
      <div className="ac-section-label">Аттестация</div>
      {attest && (
        <div className={`ac-attest-card ${attest.result === "passed" ? "ac-attest--pass" : attest.result === "failed" ? "ac-attest--fail" : "ac-attest--pending"}`}>
          <div className="ac-attest-row">
            <span className="ac-attest-num">Попытка {attest.attempt_number}</span>
            <span className="ac-attest-result">
              {attest.result === "pending" ? "⏳ Ожидает" : attest.result === "passed" ? "✅ Пройдена" : "❌ Не пройдена"}
            </span>
          </div>
          {attest.scheduled_at && (
            <span className="ac-attest-date">📅 {fmtDatetime(attest.scheduled_at)}</span>
          )}
        </div>
      )}
      {canRequest && !pendingAttest && (
        <button
          className="ac-btn-primary"
          style={{ marginTop: 10 }}
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
        >
          {mut.isPending ? <span className="ac-spinner" /> : "Запросить аттестацию"}
        </button>
      )}
      {mut.isError && (
        <p className="ac-err">{mut.error?.response?.data?.detail ?? "Ошибка"}</p>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Academy() {
  const [tab, setTab] = useState("upcoming");
  const { data: progress, isLoading: progLoading } = useMyProgress();
  const { data: schedule = [], isLoading: schedLoading } = useSchedule(tab);

  return (
    <div className="ac-page">
      <header className="ac-header">
        <Link to="/" className="ac-back">‹</Link>
        <span className="ac-header-title">Академия новичков</span>
      </header>

      {/* Progress card */}
      <div className="ac-progress-card">
        {progLoading
          ? <div className="ac-skeleton" style={{ height: 100 }} />
          : progress && (
            <>
              <div className="ac-prog-row">
                <span className="ac-prog-label">Статус</span>
                <span className={`ac-status-badge ${STATUS_CLS[progress.status] ?? ""}`}>
                  {STATUS_LABEL[progress.status] ?? progress.status}
                </span>
              </div>
              <div className="ac-prog-stats">
                <div className="ac-prog-stat">
                  <span className="ac-prog-stat-val">{progress.classes_attended}</span>
                  <span className="ac-prog-stat-lbl">занятий</span>
                </div>
                <div className="ac-prog-stat">
                  <span className="ac-prog-stat-val">{Math.round(progress.total_training_hours)}</span>
                  <span className="ac-prog-stat-lbl">часов</span>
                </div>
                <div className={`ac-prog-stat ${progress.skip_count >= 2 ? "ac-prog-stat--warn" : ""}`}>
                  <span className="ac-prog-stat-val">{progress.skip_count} / 3</span>
                  <span className="ac-prog-stat-lbl">пропусков</span>
                </div>
              </div>
              {progress.skip_count >= 2 && progress.status !== "blocked" && (
                <div className="ac-warning">⚠ Ещё один пропуск приведёт к блокировке</div>
              )}
            </>
          )
        }
      </div>

      {/* Attestation */}
      {progress && <AttestationSection progress={progress} />}

      {/* Schedule */}
      <div className="ac-section-label">Занятия</div>
      <div className="ac-tabs">
        {[["upcoming", "Предстоящие"], ["past", "Прошедшие"]].map(([k, l]) => (
          <button key={k} className={`ac-tab ${tab === k ? "ac-tab--on" : ""}`}
            onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      <div className="ac-list">
        {schedLoading
          ? [0, 1].map(i => <div key={i} className="ac-skeleton" style={{ height: 120 }} />)
          : schedule.length === 0
            ? <p className="ac-empty">{tab === "upcoming" ? "Ближайших занятий нет" : "Прошедших занятий нет"}</p>
            : schedule.map(s => <ClassCard key={s.id} item={s} />)
        }
      </div>
    </div>
  );
}
