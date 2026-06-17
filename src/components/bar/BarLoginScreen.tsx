"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";

type Profile = {
  id: string;
  full_name: string | null;
  role: string;
  bar_pin: string | null;
};

type BarLoginScreenProps = {
  onLogin: (operator: { id: string; name: string }) => void;
};

const PIN_LENGTH = 4;

function roleLabel(role: string) {
  if (role === "admin") return "Admin";
  if (role === "manager") return "Manager";
  return "Staff";
}

export default function BarLoginScreen({ onLogin }: BarLoginScreenProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [digits, setDigits] = useState<string[]>([]);
  const [shaking, setShaking] = useState(false);
  const [now, setNow] = useState(new Date());

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

  // Clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

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

  const numpadKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

  const dateStr = now.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
  const timeStr = now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

  if (loading) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100%", background: "linear-gradient(180deg, #FAF9F5 0%, #F3EBDD 100%)",
        fontFamily: "'Albert Sans', sans-serif", fontSize: 15, color: "#6C6B5D",
      }}>
        Caricamento...
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", height: "100%", padding: 24,
      background: "linear-gradient(180deg, #FAF9F5 0%, #F3EBDD 100%)",
      overflow: "auto", position: "relative",
    }}>
      <style>{`
        @keyframes bar-login-fade-header {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes bar-login-fade-card {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes bar-login-pin-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-10px); }
          40% { transform: translateX(10px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
        .bar-login-header {
          animation: bar-login-fade-header 0.4s ease-out both;
        }
        .bar-login-card {
          position: relative;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          min-width: 130px; min-height: 130px; border-radius: 16px;
          border: 1px solid #D8CCB8; background: #fff;
          cursor: pointer; font-family: 'Albert Sans', sans-serif;
          box-shadow: 0 2px 8px rgba(31, 51, 38, 0.06);
          transition: box-shadow 200ms ease, border-color 200ms ease, transform 200ms ease;
          user-select: none; -webkit-user-select: none;
          touch-action: manipulation; padding: 16px 12px;
          animation: bar-login-fade-card 0.4s ease-out both;
        }
        .bar-login-card:hover {
          box-shadow: 0 4px 16px rgba(31, 51, 38, 0.12);
          border-color: #BFA762;
          transform: translateY(-2px);
        }
        .bar-login-card:active {
          transform: translateY(0) scale(0.97);
          box-shadow: 0 2px 6px rgba(31, 51, 38, 0.1);
        }
        .bar-login-pin-shaking {
          animation: bar-login-pin-shake 0.4s ease-in-out;
        }
        .bar-login-numpad-btn {
          width: 60px; height: 60px; border-radius: 50%; border: none;
          background: #F3EBDD; color: #1F3326;
          font-family: 'Albert Sans', sans-serif; font-size: 22px; font-weight: 500;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: background 200ms ease, color 200ms ease, transform 120ms ease;
          user-select: none; -webkit-user-select: none;
        }
        .bar-login-numpad-btn:hover {
          background: #1F3326; color: #fff;
        }
        .bar-login-numpad-btn:active {
          transform: scale(0.92);
        }
        .bar-login-numpad-back {
          width: 60px; height: 60px; border-radius: 50%; border: none;
          background: transparent; color: #6C6B5D;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: color 200ms ease, transform 120ms ease;
          user-select: none; -webkit-user-select: none;
        }
        .bar-login-numpad-back:hover { color: #1F3326; }
        .bar-login-numpad-back:active { transform: scale(0.92); }
        .bar-login-pin-overlay {
          position: fixed; inset: 0; z-index: 9999;
          background: rgba(31, 51, 38, 0.85);
          display: flex; align-items: center; justify-content: center;
          animation: bar-login-fade-header 0.25s ease-out both;
        }
      `}</style>

      {!selected ? (
        <>
          {/* ── Branding ── */}
          <div className="bar-login-header" style={{ textAlign: "center", marginBottom: 32 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#BFA762" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
              <path d="M8 2h8l-1 7H9L8 2z" />
              <path d="M12 9v4" />
              <path d="M7 17h10" />
              <path d="M9 13c0 2-2 4-2 4h10s-2-2-2-4" />
            </svg>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 28, letterSpacing: 3, color: "#1F3326", lineHeight: 1,
            }}>
              BAR &middot; LE 4 CAMERE
            </div>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 14, letterSpacing: 3, color: "#BFA762", marginTop: 4,
            }}>
              GESTIONALE ALBERGHIERO
            </div>

            {/* Gold separator */}
            <div style={{
              width: 80, height: 1, background: "rgba(191, 167, 98, 0.3)",
              margin: "24px auto 0",
            }} />

            <h1 style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 20, fontWeight: 500, color: "#1F3326",
              margin: "32px 0 0", letterSpacing: -0.3,
            }}>
              Seleziona operatore
            </h1>
          </div>

          {/* ── Profile Grid ── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
            gap: 16, maxWidth: 600, width: "100%",
          }}>
            {profiles.map((p, idx) => (
              <button
                key={p.id}
                type="button"
                className="bar-login-card"
                onClick={() => selectProfile(p)}
                style={{ animationDelay: `${0.15 + idx * 0.05}s` }}
              >
                {/* Lock icon */}
                {p.bar_pin && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#BFA762" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", top: 10, right: 10 }}>
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                )}

                {/* Avatar */}
                <div style={{
                  width: 56, height: 56, borderRadius: "50%",
                  background: "linear-gradient(145deg, #1F3326, #2a4a35)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "inset 0 2px 4px rgba(0,0,0,0.15)",
                  flexShrink: 0,
                }}>
                  <span style={{
                    fontFamily: "'Fraunces', serif",
                    fontSize: 24, color: "#BFA762", fontWeight: 500, lineHeight: 1,
                  }}>
                    {(p.full_name ?? "?")[0].toUpperCase()}
                  </span>
                </div>

                {/* Name */}
                <div style={{
                  fontWeight: 500, fontSize: 14, color: "#1F3326",
                  textAlign: "center", lineHeight: 1.2, marginTop: 12,
                  maxWidth: "100%", overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {p.full_name ?? "Utente"}
                </div>

                {/* Role */}
                <div style={{
                  fontSize: 11, color: "#999", textTransform: "uppercase",
                  letterSpacing: 1, marginTop: 3,
                }}>
                  {roleLabel(p.role)}
                </div>
              </button>
            ))}
          </div>

          {/* ── Clock / Date ── */}
          <div style={{
            marginTop: 40,
            fontFamily: "'Albert Sans', sans-serif",
            fontSize: 13, color: "#999", letterSpacing: 0.3,
            animation: "bar-login-fade-card 0.5s ease-out 0.6s both",
          }}>
            {dateStr} &middot; {timeStr}
          </div>
        </>
      ) : (
        /* ── PIN Overlay ── */
        <div className="bar-login-pin-overlay" onClick={() => { setSelected(null); setDigits([]); }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 20, padding: "36px 40px 28px",
              display: "flex", flexDirection: "column", alignItems: "center",
              maxWidth: 340, width: "90vw",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
          >
            {/* Avatar */}
            <div style={{
              width: 64, height: 64, borderRadius: "50%",
              background: "linear-gradient(145deg, #1F3326, #2a4a35)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "inset 0 2px 4px rgba(0,0,0,0.15)",
              marginBottom: 12,
            }}>
              <span style={{
                fontFamily: "'Fraunces', serif",
                fontSize: 28, color: "#BFA762", fontWeight: 500, lineHeight: 1,
              }}>
                {(selected.full_name ?? "?")[0].toUpperCase()}
              </span>
            </div>

            <div style={{
              fontFamily: "'Albert Sans', sans-serif",
              fontSize: 18, fontWeight: 600, color: "#1F3326", marginBottom: 4,
            }}>
              {selected.full_name}
            </div>
            <div style={{
              fontFamily: "'Albert Sans', sans-serif",
              fontSize: 13, color: "#6C6B5D", marginBottom: 28,
            }}>
              Inserisci il PIN
            </div>

            {/* PIN dots */}
            <div
              className={shaking ? "bar-login-pin-shaking" : undefined}
              style={{ display: "flex", gap: 18, marginBottom: 28 }}
            >
              {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 14, height: 14, borderRadius: "50%",
                    border: "2px solid #D8CCB8",
                    background: i < digits.length
                      ? (shaking ? "#C4453C" : "#1F3326")
                      : "transparent",
                    transition: "background 0.15s, border-color 0.15s",
                    borderColor: i < digits.length && shaking ? "#C4453C" : "#D8CCB8",
                  }}
                />
              ))}
            </div>

            {/* Numpad */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 60px)", gap: 12 }}>
              {numpadKeys.map((key) => {
                if (key === "") {
                  return <div key="empty" />;
                }
                if (key === "back") {
                  return (
                    <button key={key} className="bar-login-numpad-back" type="button"
                      onClick={() => setDigits(prev => prev.slice(0, -1))}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z" />
                        <line x1="18" y1="9" x2="12" y2="15" />
                        <line x1="12" y1="9" x2="18" y2="15" />
                      </svg>
                    </button>
                  );
                }
                return (
                  <button key={key} className="bar-login-numpad-btn" type="button"
                    onClick={() => setDigits(prev => prev.length >= PIN_LENGTH ? prev : [...prev, key])}>
                    {key}
                  </button>
                );
              })}
            </div>

            {/* Cancel */}
            <button
              type="button"
              onClick={() => { setSelected(null); setDigits([]); }}
              style={{
                marginTop: 20, background: "none", border: "none",
                fontFamily: "'Albert Sans', sans-serif",
                fontSize: 13, color: "#999", cursor: "pointer",
                padding: "8px 16px",
              }}
            >
              Annulla
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
