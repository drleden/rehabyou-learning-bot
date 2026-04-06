import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import api from "../../api";
import "./Login.css";

// ── Phone login form (browser fallback) ──────────────────────────────────────

function PhoneForm({ onSuccess }) {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  function formatPhone(raw) {
    // keep only digits and leading +
    return raw.replace(/[^\d+]/g, "").slice(0, 12);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (phone.length < 10) {
      setError("Введите корректный номер телефона");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { data: tokens } = await api.post("/api/auth/phone", { phone });
      const { data: profile } = await api.get("/api/auth/me", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      onSuccess(profile, tokens.access_token, tokens.refresh_token);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(detail ?? "Пользователь не найден. Обратитесь к администратору.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit} noValidate>
      <div className="login-field">
        <label className="login-label" htmlFor="phone">Номер телефона</label>
        <input
          id="phone"
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

      {error && <p className="login-error">{error}</p>}

      <button className="login-btn" type="submit" disabled={loading}>
        {loading ? <span className="login-spinner" /> : "Войти"}
      </button>

      <p className="login-hint">
        Для входа используйте номер, который зарегистрирован в системе.<br />
        Или откройте приложение через Telegram.
      </p>
    </form>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Login({ telegramError }) {
  const { login } = useAuth();

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Logo */}
        <div className="login-logo">
          <span className="login-logo-dot" />
          Rehab.You
        </div>

        <h1 className="login-title">Вход в платформу</h1>
        <p className="login-subtitle">Обучение для мастеров и специалистов</p>

        {telegramError ? (
          /* Telegram auth failed — show error */
          <div className="login-tg-error">
            <span className="login-tg-icon">⚠</span>
            <p>{telegramError}</p>
            <p className="login-hint">Попробуйте открыть приложение заново через Telegram.</p>
          </div>
        ) : (
          /* Browser fallback — phone form */
          <PhoneForm onSuccess={(profile, at, rt) => login(profile, at, rt)} />
        )}
      </div>
    </div>
  );
}
