/**
 * AuthContext
 *
 * Provides:
 *   user        – current user object { id, username, role, ... } or null
 *   token       – raw JWT string or null
 *   login(u, p) – returns true on success, throws on failure
 *   logout()    – clears state + storage
 *   can(perm)   – role-based permission check
 *   loading     – true while verifying stored token on first load
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import axios from "axios";

const API_BASE   = import.meta.env.VITE_API_BASE || "http://localhost:8000/api/v1";
const AUTH_BASE  = import.meta.env.VITE_API_BASE
  ? import.meta.env.VITE_API_BASE.replace("/api/v1", "")
  : "http://localhost:8000";

const TOKEN_KEY = "factory_twin_token";

// ── Role permission map ───────────────────────────────────────────────────────
const ROLE_PERMISSIONS = {
  admin:    ["dashboard", "machines", "telemetry", "alerts", "ai_insights", "anomalies", "admin"],
  engineer: ["dashboard", "machines", "telemetry", "alerts", "ai_insights", "anomalies"],
  operator: ["dashboard", "machines", "telemetry", "alerts"],
  viewer:   ["dashboard"],
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [token,   setToken]   = useState(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true);

  // ── Verify stored token on mount ─────────────────────────────────────────
  useEffect(() => {
    const verify = async () => {
      const stored = localStorage.getItem(TOKEN_KEY);
      if (!stored) {
        setLoading(false);
        return;
      }
      try {
        const { data } = await axios.get(`${AUTH_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${stored}` },
        });
        setUser(data);
        setToken(stored);
      } catch {
        // Token invalid or expired — clear it
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    verify();
  }, []);

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = useCallback(async (username, password) => {
    const { data } = await axios.post(`${AUTH_BASE}/auth/login`, {
      username,
      password,
    });
    const newToken = data.access_token;
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);

    // Fetch user profile
    const profile = await axios.get(`${AUTH_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${newToken}` },
    });
    setUser(profile.data);
    return profile.data;
  }, []);

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  // ── Permission check ──────────────────────────────────────────────────────
  const can = useCallback(
    (permission) => {
      if (!user?.role) return false;
      return ROLE_PERMISSIONS[user.role]?.includes(permission) ?? false;
    },
    [user]
  );

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}