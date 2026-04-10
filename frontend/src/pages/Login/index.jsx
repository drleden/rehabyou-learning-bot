import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import api from "../../api";
import "./Login.css";

// ── Telegram info card ────────────────────────────────────────────────────────

function TelegramCard() {
  return (
    <div className="login-tg-card">
      <div className="login-tg-card-icon">✈</div>
      <p className="login-tg-card-text">
        Войдите через бота в Telegram — авторизация происходит автоматически.
      </p>
      <a
        className="login-btn login-btn--tg"
        href="https://t.me/rehabyoulearn_bot"
        target="_blank"
        rel="noopener noreferrer"
      >
        Открыть @rehabyoulearn_bot
      </a>
    </div>
  );
}

// ── Password form ─────────────────────────────────────────────────────────────

function PasswordForm({ onSuccess }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  function formatPhone(raw) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("8")) return ("+7" + digits.slice(1)).slice(0, 12);
    if (digits.startsWith("9")) return ("+7" + digits).slice(0, 12);
    if (digits.startsWith("7")) return ("+" + digits).slice(0, 12);
    return ("+" + digits).slice(0, 12);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (phone.length < 10) { setError("Введите корректный номер телефона"); return; }
    if (!password) { setError("Введите пароль"); return; }
    setError(null);
    setLoading(true);
    try {
      const { data: tokens } = await api.post("/api/auth/login-password", { phone, password });
      const { data: profile } = await api.get("/api/auth/me", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      onSuccess(profile, tokens.access_token, tokens.refresh_token);
    } catch (err) {
      setError(err?.response?.data?.detail ?? "Неверный телефон или пароль");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit} noValidate>
      <div className="login-field">
        <label className="login-label" htmlFor="pwd-phone">Номер телефона</label>
        <input
          id="pwd-phone"
          className="login-input"
          type="tel"
          placeholder="+7 900 000 00 00"
          value={phone}
          onChange={(e) => setPhone(formatPhone(e.target.value))}
          inputMode="tel"
          autoComplete="tel"
          required
        />
      </div>
      <div className="login-field">
        <label className="login-label" htmlFor="pwd-input">Пароль</label>
        <div className="login-pwd-wrap">
          <input
            id="pwd-input"
            className="login-input login-input--pwd"
            type={showPwd ? "text" : "password"}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            className="login-pwd-toggle"
            onClick={() => setShowPwd(v => !v)}
            aria-label={showPwd ? "Скрыть пароль" : "Показать пароль"}
          >
            {showPwd ? "🙈" : "👁"}
          </button>
        </div>
      </div>
      {error && <p className="login-error">{error}</p>}
      <button className="login-btn" type="submit" disabled={loading}>
        {loading ? <span className="login-spinner" /> : "Войти"}
      </button>
    </form>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Login({ telegramError }) {
  const { login } = useAuth();
  const [tab, setTab] = useState("password");

  const onSuccess = (profile, at, rt) => login(profile, at, rt);

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <span className="login-logo-dot" />
          Rehab.You
        </div>

        <h1 className="login-title">Вход в платформу</h1>
        <p className="login-subtitle">Обучение для мастеров и специалистов</p>

        {telegramError && (
          <div className="login-tg-error">
            <span className="login-tg-icon">⚠</span>
            <p>{telegramError}</p>
          </div>
        )}

        <div className="login-tabs">
          <button
            className={`login-tab ${tab === "password" ? "login-tab--active" : ""}`}
            onClick={() => setTab("password")}
          >
            По паролю
          </button>
          <button
            className={`login-tab ${tab === "phone" ? "login-tab--active" : ""}`}
            onClick={() => setTab("phone")}
          >
            Войти через Telegram
          </button>
        </div>

        {tab === "password"
          ? <PasswordForm onSuccess={onSuccess} />
          : <TelegramCard />
        }
      </div>
    </div>
  );
}
