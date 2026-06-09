"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { logClientActivity } from "@/lib/activityLog";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000;

function getAttemptState(): { count: number; lockedUntil: number | null } {
  try {
    const raw = sessionStorage.getItem("login_attempts");
    if (!raw) return { count: 0, lockedUntil: null };
    return JSON.parse(raw);
  } catch {
    return { count: 0, lockedUntil: null };
  }
}

function setAttemptState(count: number, lockedUntil: number | null) {
  sessionStorage.setItem("login_attempts", JSON.stringify({ count, lockedUntil }));
}

export default function LoginForm() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [mode, setMode] = useState<"login" | "reset">("login");
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const [locked, setLocked] = useState(false);
  const [lockCountdown, setLockCountdown] = useState(0);

  const checkLock = useCallback(() => {
    const state = getAttemptState();
    if (state.lockedUntil && Date.now() < state.lockedUntil) {
      setLocked(true);
      setLockCountdown(Math.ceil((state.lockedUntil - Date.now()) / 1000));
      return true;
    }
    if (state.lockedUntil && Date.now() >= state.lockedUntil) {
      setAttemptState(0, null);
      setLocked(false);
    }
    return false;
  }, []);

  useEffect(() => {
    checkLock();
  }, [checkLock]);

  useEffect(() => {
    if (!locked) return;
    const id = setInterval(() => {
      const state = getAttemptState();
      if (!state.lockedUntil || Date.now() >= state.lockedUntil) {
        setLocked(false);
        setLockCountdown(0);
        setAttemptState(0, null);
        clearInterval(id);
        return;
      }
      setLockCountdown(Math.ceil((state.lockedUntil - Date.now()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [locked]);

  async function submit() {
    if (checkLock()) return;
    setError(null);
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        const state = getAttemptState();
        const newCount = state.count + 1;
        if (newCount >= MAX_ATTEMPTS) {
          setAttemptState(newCount, Date.now() + LOCKOUT_MS);
          setLocked(true);
          setLockCountdown(60);
          setError("Troppi tentativi. Riprova tra 60 secondi.");
          return;
        }
        setAttemptState(newCount, null);
        setError("Email o password non corretti");
        return;
      }
      setAttemptState(0, null);
      logClientActivity("login", "auth", "Login effettuato", { email });
      router.push("/");
      router.refresh();
    } catch {
      setError("Errore di connessione. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReset() {
    if (!resetEmail) return;
    setResetLoading(true);
    try {
      await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/auth/callback`,
      });
    } catch {
      // always show generic message
    }
    setResetSent(true);
    setResetLoading(false);
  }

  const formDisabled = locked || loading;

  return (
    <div className="login-wrap">
      <div className="login-card">
        {/* Logo */}
        <div className="login-logo-block">
          <img
            src="/le4camere-logo-bianco.svg"
            alt="Le 4 Camere Hotel"
            className="login-logo"
          />
          <div className="login-divider" />
          <div className="login-subtitle">GESTIONALE ALBERGHIERO</div>
        </div>

        {mode === "login" ? (
          <>
            {/* Error banner */}
            {error && (
              <div className="login-error-banner">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                </svg>
                <span>{locked ? `Troppi tentativi. Riprova tra ${lockCountdown}s` : error}</span>
              </div>
            )}

            {/* Email */}
            <div className="login-field">
              <label htmlFor="login-email">Email</label>
              <div className="login-input-wrap">
                <svg className="login-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 6L2 7" />
                </svg>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Il tuo indirizzo email"
                  autoComplete="email"
                  disabled={formDisabled}
                />
              </div>
            </div>

            {/* Password */}
            <div className="login-field">
              <label htmlFor="login-password">Password</label>
              <div className="login-input-wrap">
                <svg className="login-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="La tua password"
                  autoComplete="current-password"
                  disabled={formDisabled}
                  onKeyDown={(e) => e.key === "Enter" && !formDisabled && email && password && submit()}
                />
                <button
                  type="button"
                  className="login-eye-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Nascondi password" : "Mostra password"}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                      <path d="M1 1l22 22" /><path d="M14.12 14.12a3 3 0 11-4.24-4.24" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <label className="login-remember">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={formDisabled}
              />
              <span>Ricordami</span>
            </label>

            {/* Submit */}
            <button
              className="login-submit"
              onClick={submit}
              disabled={formDisabled || !email || !password}
            >
              {loading ? (
                <>
                  <span className="login-spinner" />
                  Accesso in corso...
                </>
              ) : (
                "Accedi"
              )}
            </button>

            {/* Forgot password */}
            <button
              type="button"
              className="login-forgot"
              onClick={() => { setMode("reset"); setResetEmail(email); setResetSent(false); }}
            >
              Hai dimenticato la password?
            </button>
          </>
        ) : (
          <>
            {/* Reset password mode */}
            <div className="login-reset-head">Reimposta password</div>

            {resetSent ? (
              <div className="login-reset-sent">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2D5A3D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" />
                </svg>
                <p>Se l&apos;email esiste, riceverai un link per reimpostare la password.</p>
              </div>
            ) : (
              <>
                <div className="login-field">
                  <label htmlFor="reset-email">Email del tuo account</label>
                  <div className="login-input-wrap">
                    <svg className="login-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 6L2 7" />
                    </svg>
                    <input
                      id="reset-email"
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="Il tuo indirizzo email"
                      autoComplete="email"
                      disabled={resetLoading}
                      onKeyDown={(e) => e.key === "Enter" && resetEmail && handleReset()}
                    />
                  </div>
                </div>
                <button
                  className="login-submit"
                  onClick={handleReset}
                  disabled={resetLoading || !resetEmail}
                >
                  {resetLoading ? (
                    <>
                      <span className="login-spinner" />
                      Invio in corso...
                    </>
                  ) : (
                    "Invia link di reset"
                  )}
                </button>
              </>
            )}

            <button
              type="button"
              className="login-forgot"
              onClick={() => { setMode("login"); setError(null); }}
            >
              &larr; Torna al login
            </button>
          </>
        )}

        <div className="login-footer-text">
          Accesso riservato al personale autorizzato
        </div>
        <div className="login-copyright">
          &copy; 2026 Le 4 Camere Hotel
        </div>
      </div>
    </div>
  );
}
