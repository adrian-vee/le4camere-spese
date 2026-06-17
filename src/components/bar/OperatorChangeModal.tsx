"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { Modal } from "@/components/ui/Modal";

type Profile = {
  id: string;
  full_name: string | null;
  role: string;
  bar_pin: string | null;
};

type OperatorChangeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (profile: { id: string; name: string }) => void;
};

const PIN_LENGTH = 4;

export default function OperatorChangeModal({
  isOpen,
  onClose,
  onSelect,
}: OperatorChangeModalProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [digits, setDigits] = useState<string[]>([]);
  const [shaking, setShaking] = useState(false);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
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
    if (isOpen) {
      loadProfiles();
      setSelected(null);
      setDigits([]);
    }
  }, [isOpen, loadProfiles]);

  function selectProfile(p: Profile) {
    if (!p.bar_pin) {
      onSelect({ id: p.id, name: p.full_name ?? "Operatore" });
      return;
    }
    setSelected(p);
    setDigits([]);
  }

  function addDigit(d: string) {
    setDigits((prev) => {
      if (prev.length >= PIN_LENGTH) return prev;
      return [...prev, d];
    });
  }

  function removeLastDigit() {
    setDigits((prev) => prev.slice(0, -1));
  }

  useEffect(() => {
    if (!selected || digits.length !== PIN_LENGTH) return;

    const entered = digits.join("");
    if (entered === selected.bar_pin) {
      const t = setTimeout(() => {
        onSelect({ id: selected.id, name: selected.full_name ?? "Operatore" });
      }, 200);
      return () => clearTimeout(t);
    }

    setShaking(true);
    const t = setTimeout(() => {
      setShaking(false);
      setDigits([]);
    }, 500);
    return () => clearTimeout(t);
  }, [digits, selected, onSelect]);

  const numpadKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={selected ? `PIN — ${selected.full_name}` : "Cambio operatore"} maxWidth={400}>
      <div style={{ fontFamily: "'Albert Sans', sans-serif" }}>
        {!selected ? (
          /* Profile list */
          loading ? (
            <div style={{ padding: 24, textAlign: "center", color: "#6C6B5D", fontSize: 14 }}>
              Caricamento...
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {profiles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectProfile(p)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "14px 16px", borderRadius: 10,
                    border: "1px solid #D8CCB8", background: "#F3EBDD",
                    cursor: "pointer", fontFamily: "'Albert Sans', sans-serif",
                    touchAction: "manipulation", transition: "background 150ms",
                  }}
                >
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#1F3326" }}>
                      {p.full_name ?? "Utente"}
                    </div>
                    <div style={{ fontSize: 12, color: "#6C6B5D", marginTop: 2 }}>
                      {p.role}
                    </div>
                  </div>
                  {p.bar_pin && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6C6B5D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0110 0v4" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )
        ) : (
          /* PIN entry */
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 0" }}>
            <style>{`
              @keyframes op-pin-shake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-8px); }
                75% { transform: translateX(8px); }
              }
              .op-pin-shaking { animation: op-pin-shake 0.3s ease-in-out 0s 2; }
              .op-numpad-btn {
                width: 60px; height: 60px; border-radius: 50%; border: none;
                background: #F3EBDD; color: #1F3326;
                font-family: 'Albert Sans', sans-serif; font-size: 22; font-weight: 600;
                cursor: pointer; display: flex; align-items: center; justify-content: center;
                transition: background 0.15s; user-select: none; -webkit-user-select: none;
              }
              .op-numpad-btn:hover { background: #e8dcc6; }
              .op-numpad-btn:active { background: #ddd0b8; transform: scale(0.95); }
            `}</style>

            <button
              type="button"
              onClick={() => { setSelected(null); setDigits([]); }}
              style={{
                alignSelf: "flex-start", background: "none", border: "none",
                color: "#6C6B5D", fontSize: 13, cursor: "pointer", padding: "0 0 12px",
                fontFamily: "'Albert Sans', sans-serif",
              }}
            >
              &larr; Torna alla lista
            </button>

            {/* PIN dots */}
            <div
              className={shaking ? "op-pin-shaking" : undefined}
              style={{ display: "flex", gap: 14, marginBottom: 24 }}
            >
              {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 14, height: 14, borderRadius: "50%",
                    border: "2px solid #D8CCB8",
                    background: i < digits.length ? "#BFA762" : "transparent",
                    transition: "background 0.15s",
                  }}
                />
              ))}
            </div>

            {/* Numpad */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 60px)", gap: 12 }}>
              {numpadKeys.map((key) => {
                if (key === "clear") {
                  return (
                    <button key={key} className="op-numpad-btn" type="button" onClick={() => setDigits([])}
                      style={{ fontSize: 13, letterSpacing: 1, textTransform: "uppercase" }}>
                      C
                    </button>
                  );
                }
                if (key === "back") {
                  return (
                    <button key={key} className="op-numpad-btn" type="button" onClick={removeLastDigit}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z" />
                        <line x1="18" y1="9" x2="12" y2="15" />
                        <line x1="12" y1="9" x2="18" y2="15" />
                      </svg>
                    </button>
                  );
                }
                return (
                  <button key={key} className="op-numpad-btn" type="button" onClick={() => addDigit(key)}>
                    {key}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
