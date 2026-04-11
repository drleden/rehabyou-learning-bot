import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "../../api";
import { ROLE_NAMES } from "../../utils/roles";
import "./AdminPsychResults.css";

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_LABELS = ROLE_NAMES;

const TEST_ICONS  = { "Белбин": "🎭", "MBTI": "🧠", "Выгорание": "🔥" };
const TEST_COLORS = { "Белбин": "var(--orange)", "MBTI": "#6c8ebf", "Выгорание": "#c4694f" };

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fullName(u) {
  return [u?.first_name, u?.last_name].filter(Boolean).join(" ") || u?.phone || "—";
}

function roleBadge(roles) {
  return (roles ?? []).map(r => ROLE_LABELS[r] ?? r).join(", ") || "Нет роли";
}

function getScoreLabel(r) {
  if (r.test_name === "MBTI") return r.raw_score?.type ?? "";
  if (r.test_name === "Выгорание") return `${r.raw_score?.level ?? ""} · ${r.raw_score?.percent ?? 0}%`;
  if (r.test_name === "Белбин") {
    const top = Object.entries(r.raw_score ?? {}).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : "";
  }
  return "";
}

function buildResultText(user, r) {
  const name = fullName(user);
  const role = roleBadge(user?.roles);
  const sl = getScoreLabel(r);
  const lines = [
    `Сотрудник: ${name}`,
    `Должность: ${role}`,
    `Дата прохождения: ${fmtDate(r.created_at)}`,
    "",
    `ТЕСТ: ${r.test_name}`,
  ];
  if (sl) lines.push(`Результат: ${sl}`);
  if (r.ai_interpretation) lines.push(`Интерпретация: ${r.ai_interpretation}`);
  return lines.join("\n");
}

function buildAllText(user, results) {
  const name = fullName(user);
  const role = roleBadge(user?.roles);
  const lines = [`Сотрудник: ${name}`, `Должность: ${role}`, ""];
  for (const r of results) {
    lines.push(`ТЕСТ: ${r.test_name}`);
    lines.push(`Дата: ${fmtDate(r.created_at)}`);
    const sl = getScoreLabel(r);
    if (sl) lines.push(`Результат: ${sl}`);
    if (r.ai_interpretation) lines.push(`Интерпретация: ${r.ai_interpretation}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useStaffUser(userId) {
  return useQuery({
    queryKey: ["staff-user", userId],
    queryFn: () => api.get(`/api/users/${userId}`).then(r => r.data),
    enabled: !!userId,
    retry: false,
  });
}

function usePsychResults(userId) {
  return useQuery({
    queryKey: ["staff-psych-results", userId],
    queryFn: () => api.get(`/api/psych-tests/results/${userId}`).then(r => r.data),
    enabled: !!userId,
    placeholderData: [],
    retry: false,
  });
}

// ── Result card ───────────────────────────────────────────────────────────────

function ResultCard({ result, user }) {
  const [copied, setCopied] = useState(false);
  const color = TEST_COLORS[result.test_name] ?? "var(--orange)";
  const icon  = TEST_ICONS[result.test_name] ?? "🧪";
  const sl    = getScoreLabel(result);

  function copy() {
    navigator.clipboard?.writeText(buildResultText(user, result)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="apr-card">
      <div className="apr-card-head">
        <span className="apr-card-icon" style={{ background: color + "22", color }}>{icon}</span>
        <div className="apr-card-meta">
          <span className="apr-card-name">{result.test_name}</span>
          <span className="apr-card-date">{fmtDate(result.created_at)}</span>
        </div>
        {sl && <span className="apr-card-badge" style={{ background: color + "22", color }}>{sl}</span>}
        <button className="apr-copy-btn" onClick={copy}>
          {copied ? "✅" : "📋"}
        </button>
      </div>

      {result.test_name === "Белбин" && result.raw_score && (
        <div className="apr-scores">
          {Object.entries(result.raw_score).sort((a, b) => b[1] - a[1]).map(([role, score]) => (
            <div key={role} className="apr-score-row">
              <span className="apr-score-role">{role}</span>
              <div className="apr-score-bar-wrap">
                <div className="apr-score-bar" style={{ width: `${(score / 5) * 100}%`, background: color }} />
              </div>
              <span className="apr-score-val">{score}/5</span>
            </div>
          ))}
        </div>
      )}

      {result.ai_interpretation && (
        <div className="apr-interp">{result.ai_interpretation}</div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminPsychResults() {
  const { userId } = useParams();
  const { data: user } = useStaffUser(userId);
  const { data: results = [], isLoading } = usePsychResults(userId);
  const [copiedAll, setCopiedAll] = useState(false);

  function copyAll() {
    const text = buildAllText(user, results);
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    });
  }

  return (
    <div className="apr-page">
      <header className="apr-header">
        <Link to={`/admin/staff/${userId}`} className="apr-back">‹</Link>
        <div className="apr-header-info">
          <span className="apr-header-title">Психотесты</span>
          {user && <span className="apr-header-sub">{fullName(user)}</span>}
        </div>
        {results.length > 0 && (
          <button className="apr-copy-all-btn" onClick={copyAll}>
            {copiedAll ? "✅" : "📋 Все"}
          </button>
        )}
      </header>

      {user && (
        <div className="apr-identity">
          <span className="apr-identity-name">{fullName(user)}</span>
          <span className="apr-identity-role">{roleBadge(user.roles)}</span>
        </div>
      )}

      <div className="apr-list">
        {isLoading ? (
          [0, 1, 2].map(i => <div key={i} className="apr-skeleton" />)
        ) : results.length === 0 ? (
          <p className="apr-empty">Тесты не пройдены</p>
        ) : (
          results.map(r => <ResultCard key={r.id} result={r} user={user} />)
        )}
      </div>
    </div>
  );
}
