/**
 * /admin/academy/novice/:userId — Журнал новичка
 *
 * - Статус, пропуски, часы обучения
 * - История посещаемости с оценками
 * - История аттестаций
 * - Кнопка «Сбросить пропуски»
 * - Разрешить 4-ю+ попытку аттестации
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../../api";
import "./AcademyAdmin.css";

const useJournal = (userId) =>
  useQuery({
    queryKey: ["novice-journal", userId],
    queryFn: () => api.get(`/api/academy/novice/${userId}/journal`).then(r => r.data),
    enabled: userId != null,
    retry: false,
  });

function fmtDatetime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const STATUS_LABEL = {
  in_training:    "В обучении",
  base_certified: "Базовая аттестация",
  full_certified: "Полная аттестация",
  blocked:        "Заблокирован",
  failed:         "Не прошёл",
};

const RESULT_LABEL = { pending: "Ожидает", passed: "Пройдена ✓", failed: "Не пройдена ✗" };
const RESULT_CLS = { pending: "aa-attest--pending", passed: "aa-attest--pass", failed: "aa-attest--fail" };

export default function NoviceJournal() {
  const { userId } = useParams();
  const { data: journal, isLoading, isError } = useJournal(userId);
  const qc = useQueryClient();

  const resetMut = useMutation({
    mutationFn: () => api.post(`/api/academy/skips/${userId}/reset`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["novice-journal", userId] }),
  });

  const approveMut = useMutation({
    mutationFn: (attestId) => api.put(`/api/academy/attestation/${attestId}`, { approved_by: Number(userId) }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["novice-journal", userId] }),
  });

  if (isLoading) {
    return (
      <div className="aa-page">
        <header className="aa-header">
          <Link to="/admin/academy" className="aa-back">‹</Link>
          <span className="aa-header-title">Журнал новичка</span>
        </header>
        <div className="aa-list">{[0,1,2].map(i => <div key={i} className="aa-skeleton" />)}</div>
      </div>
    );
  }

  if (isError || !journal) {
    return (
      <div className="aa-page">
        <header className="aa-header">
          <Link to="/admin/academy" className="aa-back">‹</Link>
          <span className="aa-header-title">Журнал не найден</span>
        </header>
      </div>
    );
  }

  const isBlocked = journal.status === "blocked";

  return (
    <div className="aa-page">
      <header className="aa-header">
        <Link to="/admin/academy" className="aa-back">‹</Link>
        <span className="aa-header-title">Журнал новичка #{userId}</span>
      </header>

      {/* Summary card */}
      <div className="aa-journal-card">
        <div className="aa-journal-row">
          <span className="aa-journal-label">Статус</span>
          <span className={`aa-status-badge ${isBlocked ? "aa-status--blocked" : ""}`}>
            {STATUS_LABEL[journal.status] ?? journal.status}
          </span>
        </div>
        <div className="aa-journal-stats">
          <div className="aa-journal-stat">
            <span className="aa-journal-stat-val">{journal.skip_count}</span>
            <span className="aa-journal-stat-lbl">пропусков</span>
          </div>
          <div className="aa-journal-stat">
            <span className="aa-journal-stat-val">{Math.round(journal.total_training_hours)}</span>
            <span className="aa-journal-stat-lbl">часов</span>
          </div>
          <div className="aa-journal-stat">
            <span className="aa-journal-stat-val">{journal.attendance.filter(a => a.was_present).length}</span>
            <span className="aa-journal-stat-lbl">посещений</span>
          </div>
        </div>

        {journal.skip_count > 0 && (
          <button
            className="aa-btn-ghost"
            style={{ marginTop: 12 }}
            onClick={() => { if (window.confirm("Сбросить счётчик пропусков и разблокировать?")) resetMut.mutate(); }}
            disabled={resetMut.isPending}
          >
            {resetMut.isPending ? "…" : `Сбросить ${journal.skip_count} пропус. и разблокировать`}
          </button>
        )}
      </div>

      {/* Attendance history */}
      <div className="aa-section-label">История посещаемости</div>
      <div className="aa-attend-history">
        {journal.attendance.length === 0
          ? <p className="aa-empty-sm">Нет записей</p>
          : journal.attendance.map((a, i) => (
              <div key={i} className={`aa-hist-row ${a.was_present ? "aa-hist-row--present" : "aa-hist-row--absent"}`}>
                <span className="aa-hist-icon">{a.was_present ? "✅" : "❌"}</span>
                <div className="aa-hist-info">
                  <span className="aa-hist-topic">{a.topic ?? "Занятие"}</span>
                  <span className="aa-hist-dt">{fmtDatetime(a.starts_at)}</span>
                </div>
                {a.score != null && (
                  <span className="aa-hist-score">{a.score} / 10</span>
                )}
              </div>
            ))
        }
      </div>

      {/* Attestation history */}
      <div className="aa-section-label">Аттестации</div>
      <div className="aa-attest-list">
        {journal.attestations.length === 0
          ? <p className="aa-empty-sm">Аттестаций нет</p>
          : journal.attestations.map(a => (
              <div key={a.id} className={`aa-attest-item ${RESULT_CLS[a.result] ?? ""}`}>
                <div className="aa-attest-row2">
                  <span className="aa-attest-num2">Попытка {a.attempt_number}</span>
                  <span className="aa-attest-res2">{RESULT_LABEL[a.result] ?? a.result}</span>
                </div>
                {a.scheduled_at && (
                  <div className="aa-attest-date2">📅 {fmtDatetime(a.scheduled_at)}</div>
                )}
                {a.notes && <div className="aa-attest-notes">{a.notes}</div>}
                {a.result === "pending" && a.attempt_number > 3 && !a.approved_by && (
                  <button
                    className="aa-btn-primary aa-btn-sm"
                    style={{ marginTop: 8 }}
                    onClick={() => approveMut.mutate(a.id)}
                    disabled={approveMut.isPending}
                  >
                    Разрешить попытку {a.attempt_number}
                  </button>
                )}
              </div>
            ))
        }
      </div>

      {journal.notes && (
        <>
          <div className="aa-section-label">Заметки</div>
          <div className="aa-notes">{journal.notes}</div>
        </>
      )}
    </div>
  );
}
