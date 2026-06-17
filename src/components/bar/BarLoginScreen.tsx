"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";

type Profile = {
  id: string;
  full_name: string | null;
  role: string;
  bar_pin: string | null;
  avatar_url?: string | null;
};

type BarLoginScreenProps = {
  onLogin: (operator: { id: string; name: string }) => void;
};

const PIN_LENGTH = 4;

export default function BarLoginScreen({ onLogin }: BarLoginScreenProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [digits, setDigits] = useState<string[]>([]);
  const [shaking, setShaking] = useState(false);

  const loadProfiles = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, role, bar_pin")
      .in("role", ["admin", "manager", "staff"])
      .order("full_name");
    setProfiles((data ?? []) as Profile[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  function selectProfile(p: Profile) {
    if (!p.bar_pin) {
      onLogin({ id: p.id, name: p.full_name ?? "Operatore" });
      return;
    }
    setSelected(p);
    setDigits([]);
  }

  useEffect(() => {
    if (!selected || digits.length !== PIN_LENGTH) return;

    const entered = digits.join("");
    if (entered === selected.bar_pin) {
      const t = setTimeout(() => {
        onLogin({ id: selected.id, name: selected.full_name ?? "Operatore" });
      }, 200);
      return () => clearTimeout(t);
    }

    setShaking(true);
    const t = setTimeout(() => {
      setShaking(false);
      setDigits([]);
    }, 500);
    return () => clearTimeout(t);
  }, [digits, selected, onLogin]);

  const numpadKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];

  if (loading) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100%", fontFamily: "'Albert Sans', sans-serif",
        fontSize: 15, color: "#6C6B5D",
      }}>
        Caricamento...
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", height: "100%", padding: 24,
      background: "#FAF9F5", overflow: "auto",
    }}>
      <style>{`
        @keyframes login-pin-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
        .login-pin-shaking { animation: login-pin-shake 0.3s ease-in-out 0s 2; }
        .login-profile-card {
          position: relative;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          width: 140px; height: 120px; border-radius: 16px;
          border: 1px solid #D8CCB8; background: #F3EBDD;
          cursor: pointer; font-family: 'Albert Sans', sans-serif;
          transition: background 150ms, transform 150ms, box-shadow 150ms;
          user-select: none; -webkit-user-select: none;
          touch-action: manipulation; gap: 8px;
        }
        .login-profile-card:hover { background: #e8dcc6; }
        .login-profile-card:active { transform: scale(0.96); box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
        .login-numpad-btn {
          width: 64px; height: 64px; border-radius: 50%; border: none;
          background: #F3EBDD; color: #1F3326;
          font-family: 'Albert Sans', sans-serif; font-size: 24px; font-weight: 600;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: background 0.15s; user-select: none; -webkit-user-select: none;
        }
        .login-numpad-btn:hover { background: #e8dcc6; }
        .login-numpad-btn:active { background: #ddd0b8; transform: scale(0.95); }
      `}</style>

      {!selected ? (
        <>
          {/* Logo / Title */}
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
              <path d="M8 2h8l-1 7H9L8 2z" />
              <path d="M12 9v4" />
              <path d="M7 17h10" />
              <path d="M9 13c0 2-2 4-2 4h10s-2-2-2-4" />
            </svg>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 18, letterSpacing: 4, color: "#6C6B5D", marginBottom: 4,
            }}>
              BAR &middot; LE 4 CAMERE
            </div>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 11, letterSpacing: 3, color: "#a0a09a",
            }}>
              GESTIONALE ALBERGHIERO
            </div>
            <h1 style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 22, fontWeight: 600, color: "#1F3326",
              margin: "20px 0 0",
            }}>
              Seleziona operatore
            </h1>
          </div>

          {/* Profile grid */}
          <div style={{
            display: "flex", flexWrap: "wrap", gap: 16,
            justifyContent: "center", maxWidth: 520,
          }}>
            {profiles.map((p) => (
              <button
                key={p.id}
                type="button"
                className="login-profile-card"
                onClick={() => selectProfile(p)}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: "50%",
                  background: "#1F3326", display: "flex",
                  alignItems: "center", justifyContent: "center",
                  color: "#FAF9F5", fontSize: 18, fontWeight: 700,
                  fontFamily: "'Albert Sans', sans-serif",
                }}>
                  {(p.full_name ?? "?")[0].toUpperCase()}
                </div>
                <div style={{
                  fontWeight: 700, fontSize: 14, color: "#1F3326",
                  textAlign: "center", lineHeight: 1.2,
                }}>
                  {p.full_name ?? "Utente"}
                </div>
                {p.bar_pin && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6C6B5D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", top: 8, right: 8 }}>
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      ) : (
        /* PIN entry */
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => { setSelected(null); setDigits([]); }}
            style={{
              alignSelf: "flex-start", background: "none", border: "none",
              color: "#6C6B5D", fontSize: 14, cursor: "pointer",
              padding: "0 0 24px", fontFamily: "'Albert Sans', sans-serif",
            }}
          >
            &larr; Torna alla lista
          </button>

          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "#1F3326", display: "flex",
            alignItems: "center", justifyContent: "center",
            color: "#FAF9F5", fontSize: 24, fontWeight: 700,
            fontFamily: "'Albert Sans', sans-serif", marginBottom: 12,
          }}>
            {(selected.full_name ?? "?")[0].toUpperCase()}
          </div>

          <div style={{
            fontFamily: "'Albert Sans', sans-serif",
            fontSize: 18, fontWeight: 700, color: "#1F3326", marginBottom: 8,
          }}>
            {selected.full_name}
          </div>
          <div style={{
            fontFamily: "'Albert Sans', sans-serif",
            fontSize: 13, color: "#6C6B5D", marginBottom: 24,
          }}>
            Inserisci il PIN
          </div>

          {/* PIN dots */}
          <div
            className={shaking ? "login-pin-shaking" : undefined}
            style={{ display: "flex", gap: 16, marginBottom: 32 }}
          >
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 16, height: 16, borderRadius: "50%",
                  border: "2px solid #D8CCB8",
                  background: i < digits.length ? "#BFA762" : "transparent",
                  transition: "background 0.15s",
                }}
              />
            ))}
          </div>

          {/* Numpad */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 64px)", gap: 14 }}>
            {numpadKeys.map((key) => {
              if (key === "clear") {
                return (
                  <button key={key} className="login-numpad-btn" type="button"
                    onClick={() => setDigits([])}
                    style={{ fontSize: 14, letterSpacing: 1, textTransform: "uppercase" }}>
                    C
                  </button>
                );
              }
              if (key === "back") {
                return (
                  <button key={key} className="login-numpad-btn" type="button"
                    onClick={() => setDigits(prev => prev.slice(0, -1))}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z" />
                      <line x1="18" y1="9" x2="12" y2="15" />
                      <line x1="12" y1="9" x2="18" y2="15" />
                    </svg>
                  </button>
                );
              }
              return (
                <button key={key} className="login-numpad-btn" type="button"
                  onClick={() => setDigits(prev => prev.length >= PIN_LENGTH ? prev : [...prev, key])}>
                  {key}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
