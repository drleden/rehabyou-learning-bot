import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth, isTelegramEnv } from "./context/AuthContext";
import api from "./api";

import Home from "./pages/Home";
import Course from "./pages/Course";
import MyCourses from "./pages/MyCourses";
import CourseView from "./pages/CourseView";
import LessonView from "./pages/LessonView";
import Academy from "./pages/Academy";
import Profile from "./pages/Profile";
import AIAssistant from "./pages/AIAssistant";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import PageStub from "./pages/Stub";
import PsychTestList, { PsychTestTake, PsychTestResults } from "./pages/PsychTests";

// ── PWA install banner ────────────────────────────────────────────────────────

const PWA_DISMISSED_KEY = "pwa_banner_dismissed";

function PWAInstallBanner() {
  const [androidPrompt, setAndroidPrompt] = useState(null);
  const [showIOS, setShowIOS] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Already dismissed
    if (localStorage.getItem(PWA_DISMISSED_KEY)) return;

    // Already installed (standalone mode)
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    if (isStandalone) return;

    // Android/Chrome: listen for install prompt
    const handler = (e) => {
      e.preventDefault();
      setAndroidPrompt(e);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS Safari detection
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari =
      /safari/i.test(navigator.userAgent) && !/chrome|crios|fxios/i.test(navigator.userAgent);
    if (isIOS && isSafari) {
      setShowIOS(true);
      setVisible(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    localStorage.setItem(PWA_DISMISSED_KEY, "1");
    setVisible(false);
  }

  async function install() {
    if (androidPrompt) {
      androidPrompt.prompt();
      const { outcome } = await androidPrompt.userChoice;
      if (outcome === "accepted") dismiss();
      else setVisible(false);
    }
  }

  if (!visible) return null;

  const S = {
    banner: {
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
      background: "#1a1a1a",
      borderTop: "1px solid #333",
      padding: "14px 16px calc(14px + env(safe-area-inset-bottom, 0px))",
      display: "flex", alignItems: "center", gap: 12,
      boxShadow: "0 -4px 24px rgba(0,0,0,0.5)",
    },
    icon: { width: 44, height: 44, borderRadius: 10, flexShrink: 0 },
    text: { flex: 1, minWidth: 0 },
    title: { color: "#f0f0f0", fontWeight: 700, fontSize: 14, margin: 0 },
    sub: { color: "#888", fontSize: 12, margin: "2px 0 0", lineHeight: 1.4 },
    btn: {
      background: "linear-gradient(135deg,#c4694f,#e8925a)",
      border: "none", borderRadius: 10,
      color: "#fff", fontWeight: 700, fontSize: 13,
      padding: "9px 14px", cursor: "pointer", flexShrink: 0,
      fontFamily: "inherit",
    },
    close: {
      background: "none", border: "none", color: "#666",
      fontSize: 20, cursor: "pointer", padding: "0 4px", lineHeight: 1,
      flexShrink: 0,
    },
  };

  return (
    <div style={S.banner}>
      <img src="/icon-192.png" alt="Rehab.You" style={S.icon} />
      <div style={S.text}>
        <p style={S.title}>Rehab.You</p>
        {showIOS ? (
          <p style={S.sub}>Нажмите <strong style={{color:"#f0f0f0"}}>Share</strong> → <strong style={{color:"#f0f0f0"}}>На экран «Домой»</strong></p>
        ) : (
          <p style={S.sub}>Установите приложение на экран</p>
        )}
      </div>
      {!showIOS && (
        <button style={S.btn} onClick={install}>Установить</button>
      )}
      <button style={S.close} onClick={dismiss} aria-label="Закрыть">✕</button>
    </div>
  );
}

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
      <Route path="/"               element={<Home />} />
      <Route path="/course/*"       element={<Course />} />
      <Route path="/courses"        element={<MyCourses />} />
      <Route path="/courses/:id"    element={<CourseView />} />
      <Route path="/lessons/:id"    element={<LessonView />} />
      <Route path="/academy"         element={<Academy />} />
      <Route path="/profile/*"      element={<Profile />} />
      <Route path="/ai"              element={<AIAssistant />} />
      <Route path="/ai-assistant"   element={<AIAssistant />} />
      <Route path="/psych-tests"         element={<PsychTestList />} />
      <Route path="/psych-tests/results" element={<PsychTestResults />} />
      <Route path="/psych-tests/:id"     element={<PsychTestTake />} />
      <Route path="/questions"      element={<PageStub title="Вопросы" icon="💬" />} />
      <Route path="/rating"         element={<PageStub title="Рейтинг" icon="🏆" />} />
      <Route path="/admin/*"        element={<Admin />} />
      <Route path="*"               element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
      <PWAInstallBanner />
    </AuthProvider>
  );
}
