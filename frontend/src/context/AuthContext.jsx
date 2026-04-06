import { createContext, useCallback, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);

function readLocalUser() {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readLocalUser);
  const [token, setToken] = useState(() => localStorage.getItem("access_token") ?? null);

  const login = useCallback((userData, accessToken, refreshToken) => {
    setUser(userData);
    setToken(accessToken);
    localStorage.setItem("access_token", accessToken);
    if (refreshToken) localStorage.setItem("refresh_token", refreshToken);
    localStorage.setItem("user", JSON.stringify(userData));
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
  }, []);

  // Listen for forced logout dispatched by api.js token refresh failure
  useEffect(() => {
    function handleLogout() {
      setUser(null);
      setToken(null);
    }
    window.addEventListener("auth:logout", handleLogout);
    return () => window.removeEventListener("auth:logout", handleLogout);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** Returns true when running inside Telegram Mini App */
export function isTelegramEnv() {
  try {
    const tg = window?.Telegram?.WebApp;
    return !!(tg?.initData && tg.initData.length > 0);
  } catch {
    return false;
  }
}
