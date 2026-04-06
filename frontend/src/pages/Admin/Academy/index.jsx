/**
 * /admin/academy — Управление академией (teacher / manager / superadmin)
 *
 * - Список занятий (предстоящие / прошедшие)
 * - Кнопка «Создать занятие» → модальное окно
 * - Кнопка «Отметить посещаемость» → модал с чекбоксами и оценками
 * - Кнопка «Отменить» занятие
 * - Ссылка «Журнал новичка» → /admin/academy/novice/:id
 */
import { useState } from "react";
import { Link, Routes, Route } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../../api";
import NoviceJournal from "./NoviceJournal";
import "./AcademyAdmin.css";

// ── Data hooks ─────────────────────────────────────────────────────────────────

const useSchedule = (filter) =>
  useQuery({
    queryKey: ["admin-schedule", filter],
    queryFn: () => api.get(`/api/academy/schedule?filter=${filter}`).then(r => r.data),
    placeholderData: [],
    retry: false,
  });

function useAttendanceList(scheduleId) {
  return useQuery({
    queryKey: ["attendance-list", scheduleId],
    queryFn: () => api.get(`/api/academy/schedule/${scheduleId}/attendance`).then(r => r.data),
    enabled: scheduleId != null,
    retry: false,
  });
}

function useMut(fn, invalidates) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => invalidates.forEach(k => qc.invalidateQueries({ queryKey: k })),
  });
}

function fmtDatetime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Create schedule modal ─────────────────────────────────────────────────────

function CreateClassModal({ onClose }) {
  const [form, setForm] = useState({
    branch_id: 1,
    topic: "",
    description: "",
    starts_at: "",
    duration_minutes: 60,
  });
  const [err, setErr] = useState(null);

  const mut = useMut(
    data => api.post("/api/academy/schedule", data).then(r => r.data),
    [["admin-schedule", "upcoming"], ["admin-schedule", "all"]]
  );

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.topic.trim())   { setErr("Введите тему"); return; }
    if (!form.starts_at)       { setErr("Укажите дату и время"); return; }
    setErr(null);
    const payload = { ...form, starts_at: new Date(form.starts_at).toISOString() };
    mut.mutate(payload, { onSuccess: onClose, onError: e => setErr(e?.response?.data?.detail ?? "Ошибка") });
  };

  return (
    <div className="aa-overlay" onClick={onClose}>
      <div className="aa-modal" onClick={e => e.stopPropagation()}>
        <div className="aa-modal-hd">
          <span className="aa-modal-title">Создать занятие</span>
          <button className="aa-close" onClick={onClose}>✕</button>
        </div>
        <form className="aa-form" onSubmit={submit}>
          <label className="aa-label">Тема занятия</label>
          <input className="aa-input" value={form.topic} onChange={e => upd("topic", e.target.value)}
            placeholder="Техника массажа спины" autoFocus />

          <label className="aa-label">Описание</label>
          <textarea className="aa-input aa-textarea" rows={2} value={form.description}
            onChange={e => upd("description", e.target.value)} placeholder="Краткое описание…" />

          <label className="aa-label">Дата и время</label>
          <input className="aa-input" type="datetime-local" value={form.starts_at}
            onChange={e => upd("starts_at", e.target.value)} />

          <label className="aa-label">Длительность (мин)</label>
          <input className="aa-input" type="number" min={15} max={480} value={form.duration_minutes}
            onChange={e => upd("duration_minutes", Number(e.target.value))} />

          {err && <p className="aa-err">{err}</p>}
          <button className="aa-btn-primary" type="submit" disabled={mut.isPending}>
            {mut.isPending ? <span className="aa-spinner" /> : "Создать занятие"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Attendance modal ──────────────────────────────────────────────────────────

function AttendanceModal({ scheduleId, onClose }) {
  const { data, isLoading } = useAttendanceList(scheduleId);
  const [entries, setEntries] = useState({});
  const [err, setErr] = useState(null);

  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: payload => api.post(`/api/academy/schedule/${scheduleId}/attendance`, payload).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-schedule"] });
      onClose();
    },
    onError: e => setErr(e?.response?.data?.detail ?? "Ошибка"),
  });

  const upd = (userId, field, val) => {
    setEntries(prev => ({
      ...prev,
      [userId]: { ...prev[userId], user_id: userId, [field]: val },
    }));
  };

  const getEntry = (uid) => entries[uid] ?? { user_id: uid, was_present: false, score: null, comment: "" };

  const submit = () => {
    if (!data?.rows?.length) { onClose(); return; }
    const payload = {
      entries: data.rows.map(row => {
        const e = getEntry(row.user_id);
        return {
          user_id: row.user_id,
          was_present: e.was_present ?? false,
          score: e.score ? Number(e.score) : null,
          comment: e.comment || null,
        };
      }),
    };
    mut.mutate(payload);
  };

  return (
    <div className="aa-overlay" onClick={onClose}>
      <div className="aa-modal aa-modal--wide" onClick={e => e.stopPropagation()}>
        <div className="aa-modal-hd">
          <span className="aa-modal-title">Посещаемость</span>
          <button className="aa-close" onClick={onClose}>✕</button>
        </div>
        {data?.topic && (
          <div className="aa-modal-sub">{data.topic} · {fmtDatetime(data.starts_at)}</div>
        )}

        <div className="aa-attend-list">
          {isLoading
            ? <p className="aa-loading">Загрузка…</p>
            : (data?.rows ?? []).length === 0
              ? <p className="aa-empty-sm">Никто не записан</p>
              : (data?.rows ?? []).map(row => {
                  const e = getEntry(row.user_id);
                  return (
                    <div key={row.user_id} className="aa-attend-row">
                      <div className="aa-attend-name">{row.full_name}</div>
                      <label className="aa-attend-check">
                        <input
                          type="checkbox"
                          checked={e.was_present ?? false}
                          onChange={ev => upd(row.user_id, "was_present", ev.target.checked)}
                          className="aa-checkbox"
                        />
                        <span className="aa-check-label">{e.was_present ? "Присутствовал" : "Отсутствовал"}</span>
                      </label>
                      {e.was_present && (
                        <>
                          <div className="aa-score-row">
                            <span className="aa-score-label">Оценка</span>
                            <div className="aa-score-btns">
                              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                                <button
                                  key={n}
                                  type="button"
                                  className={`aa-score-btn ${Number(e.score) === n ? "aa-score-btn--on" : ""}`}
                                  onClick={() => upd(row.user_id, "score", n)}
                                >{n}</button>
                              ))}
                            </div>
                          </div>
                          <input
                            className="aa-input"
                            placeholder="Комментарий преподавателя…"
                            value={e.comment ?? ""}
                            onChange={ev => upd(row.user_id, "comment", ev.target.value)}
                          />
                        </>
                      )}
                    </div>
                  );
                })
          }
        </div>
        {err && <p className="aa-err" style={{ margin: "0 20px" }}>{err}</p>}
        <div className="aa-modal-footer">
          <button className="aa-btn-primary" onClick={submit} disabled={mut.isPending}>
            {mut.isPending ? <span className="aa-spinner" /> : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Schedule card ─────────────────────────────────────────────────────────────

function ScheduleCard({ item, isPast }) {
  const [attendModal, setAttendModal] = useState(false);

  const mut = useMut(
    () => api.delete(`/api/academy/schedule/${item.id}?reason=Отменено`),
    [["admin-schedule", "upcoming"], ["admin-schedule", "all"]]
  );

  return (
    <div className="aa-card">
      <div className="aa-card-hd">
        <div>
          <div className="aa-card-dt">{fmtDatetime(item.starts_at)}</div>
          <div className="aa-card-topic">{item.topic}</div>
        </div>
        <div className="aa-card-badges">
          <span className="aa-cnt-badge">👥 {item.enrolled_count}</span>
          {item.attendance_taken && <span className="aa-att-badge">✓ Отмечено</span>}
          {item.is_cancelled && <span className="aa-cancelled-badge">Отменено</span>}
        </div>
      </div>

      {item.description && <div className="aa-card-desc">{item.description}</div>}

      <div className="aa-card-footer">
        {isPast && !item.is_cancelled && !item.attendance_taken && (
          <button className="aa-btn-primary aa-btn-sm" onClick={() => setAttendModal(true)}>
            Отметить посещаемость
          </button>
        )}
        {isPast && item.attendance_taken && (
          <button className="aa-btn-ghost aa-btn-sm" onClick={() => setAttendModal(true)}>
            Редактировать посещаемость
          </button>
        )}
        {!isPast && !item.is_cancelled && (
          <button
            className="aa-btn-danger aa-btn-sm"
            onClick={() => { if (window.confirm("Отменить занятие?")) mut.mutate(); }}
            disabled={mut.isPending}
          >
            Отменить
          </button>
        )}
      </div>

      {attendModal && <AttendanceModal scheduleId={item.id} onClose={() => setAttendModal(false)} />}
    </div>
  );
}

// ── Main academy admin page ───────────────────────────────────────────────────

function AcademyAdminMain() {
  const [tab, setTab] = useState("upcoming");
  const [creating, setCreating] = useState(false);
  const { data: schedule = [], isLoading } = useSchedule(tab);
  const isPast = tab === "past";

  return (
    <div className="aa-page">
      <header className="aa-header">
        <Link to="/" className="aa-back">‹</Link>
        <span className="aa-header-title">Управление академией</span>
        <button className="aa-add-btn" onClick={() => setCreating(true)}>＋</button>
      </header>

      <div className="aa-tabs">
        {[["upcoming", "Предстоящие"], ["past", "Прошедшие"]].map(([k, l]) => (
          <button key={k} className={`aa-tab ${tab === k ? "aa-tab--on" : ""}`}
            onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      <div className="aa-list">
        {isLoading
          ? [0, 1, 2].map(i => <div key={i} className="aa-skeleton" />)
          : schedule.length === 0
            ? <p className="aa-empty">{tab === "upcoming" ? "Предстоящих занятий нет — создайте первое" : "Прошедших занятий нет"}</p>
            : schedule.map(s => <ScheduleCard key={s.id} item={s} isPast={isPast} />)
        }
      </div>

      {creating && <CreateClassModal onClose={() => setCreating(false)} />}
    </div>
  );
}

// ── Router wrapper ────────────────────────────────────────────────────────────

export default function AcademyAdmin() {
  return (
    <Routes>
      <Route index element={<AcademyAdminMain />} />
      <Route path="novice/:userId" element={<NoviceJournal />} />
    </Routes>
  );
}
