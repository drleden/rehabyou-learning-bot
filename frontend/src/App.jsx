import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth, isTelegramEnv } from "./context/AuthContext";
import api from "./api";

import Home from "./pages/Home";
import Course from "./pages/Course";
import Academy from "./pages/Academy";
import Profile from "./pages/Profile";
import AIAssistant from "./pages/AIAssistant";
import Admin from "./pages/Admin";
import Login from "./pages/Login";

// ── Splash screen shown while auth is resolving ───────────────────────────────

function Splash() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#1a1a1a",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: "50%",
        border: "3px solid #c4694f",
        borderTopColor: "transparent",
        animation: "spin 0.8s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <span style={{ color: "#888", fontSize: 14 }}>Загрузка…</span>
    </div>
  );
}

// ── Inner app — has access to AuthContext ─────────────────────────────────────

function AppInner() {
  const { user, login } = useAuth();
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    // Already authenticated (token + user in localStorage)
    if (user) {
      setReady(true);
      return;
    }

    // Not in Telegram → show login page immediately
    if (!isTelegramEnv()) {
      setReady(true);
      return;
    }

    // Telegram Mini App → auto-authenticate
    const initData = window.Telegram.WebApp.initData;
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();

    api
      .post("/api/auth/telegram", { init_data: initData })
      .then(async ({ data: tokens }) => {
        const { data: profile } = await api.get("/api/auth/me", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        login(profile, tokens.access_token, tokens.refresh_token);
      })
      .catch((err) => {
        const msg = err?.response?.data?.detail ?? "Ошибка авторизации Telegram";
        setAuthError(msg);
      })
      .finally(() => setReady(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return <Splash />;

  if (!user) {
    return <Login telegramError={authError} />;
  }

  return (
    <Routes>
      <Route path="/"          element={<Home />} />
      <Route path="/course/*"  element={<Course />} />
      <Route path="/academy/*" element={<Academy />} />
      <Route path="/profile/*" element={<Profile />} />
      <Route path="/ai"        element={<AIAssistant />} />
      <Route path="/admin/*"   element={<Admin />} />
      <Route path="*"          element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
