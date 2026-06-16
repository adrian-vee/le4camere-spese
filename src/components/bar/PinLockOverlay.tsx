"use client";

import { useState, useCallback, useEffect } from "react";

type PinLockOverlayProps = {
  onUnlock: () => void;
};

const CORRECT_PIN = "1234";
const PIN_LENGTH = 4;

export default function PinLockOverlay({ onUnlock }: PinLockOverlayProps) {
  const [digits, setDigits] = useState<string[]>([]);
  const [shaking, setShaking] = useState(false);

  const addDigit = useCallback((d: string) => {
    setDigits((prev) => {
      if (prev.length >= PIN_LENGTH) return prev;
      return [...prev, d];
    });
  }, []);

  const removeLastDigit = useCallback(() => {
    setDigits((prev) => prev.slice(0, -1));
  }, []);

  const clearAll = useCallback(() => {
    setDigits([]);
  }, []);

  /* Auto-submit when 4 digits entered */
  useEffect(() => {
    if (digits.length !== PIN_LENGTH) return;

    const entered = digits.join("");
    if (entered === CORRECT_PIN) {
      const timeout = setTimeout(() => onUnlock(), 200);
      return () => clearTimeout(timeout);
    }

    /* Wrong PIN — shake and reset */
    setShaking(true);
    const timeout = setTimeout(() => {
      setShaking(false);
      setDigits([]);
    }, 500);
    return () => clearTimeout(timeout);
  }, [digits, onUnlock]);

  const numpadKeys = [
    "1", "2", "3",
    "4", "5", "6",
    "7", "8", "9",
    "clear", "0", "back",
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#1F3326",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <style>{`
        @keyframes pin-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
        .pin-dots-shaking {
          animation: pin-shake 0.3s ease-in-out 0s 2;
        }
        .pin-numpad-btn {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          border: none;
          background: rgba(255,255,255,0.1);
          color: #FAF9F5;
          font-family: 'Albert Sans', sans-serif;
          font-size: 24px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s ease;
          user-select: none;
          -webkit-user-select: none;
        }
        .pin-numpad-btn:hover {
          background: rgba(255,255,255,0.2);
        }
        .pin-numpad-btn:active {
          background: rgba(255,255,255,0.25);
          transform: scale(0.95);
        }
        .pin-numpad-btn--text {
          font-size: 13px;
          letter-spacing: 1px;
          text-transform: uppercase;
        }
      `}</style>

      {/* Title */}
      <h1
        style={{
          fontFamily: "'Fraunces', serif",
          fontSize: 28,
          color: "#FAF9F5",
          margin: 0,
          marginBottom: 8,
          fontWeight: 500,
        }}
      >
        POS Bloccato
      </h1>

      {/* Subtitle */}
      <p
        style={{
          fontFamily: "'Albert Sans', sans-serif",
          fontSize: 14,
          color: "rgba(250,249,245,0.6)",
          margin: 0,
          marginBottom: 40,
        }}
      >
        Inserisci il PIN per sbloccare
      </p>

      {/* PIN dots */}
      <div
        className={shaking ? "pin-dots-shaking" : undefined}
        style={{
          display: "flex",
          gap: 16,
          marginBottom: 48,
        }}
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <div
            key={i}
            style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              border: "2px solid rgba(250,249,245,0.4)",
              background: i < digits.length ? "#BFA762" : "transparent",
              transition: "background 0.15s ease",
            }}
          />
        ))}
      </div>

      {/* Numpad */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 72px)",
          gap: 16,
        }}
      >
        {numpadKeys.map((key) => {
          if (key === "clear") {
            return (
              <button
                key={key}
                className="pin-numpad-btn pin-numpad-btn--text"
                onClick={clearAll}
                type="button"
              >
                C
              </button>
            );
          }
          if (key === "back") {
            return (
              <button
                key={key}
                className="pin-numpad-btn"
                onClick={removeLastDigit}
                type="button"
                title="Cancella ultima cifra"
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#FAF9F5"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z" />
                  <line x1="18" y1="9" x2="12" y2="15" />
                  <line x1="12" y1="9" x2="18" y2="15" />
                </svg>
              </button>
            );
          }
          return (
            <button
              key={key}
              className="pin-numpad-btn"
              onClick={() => addDigit(key)}
              type="button"
            >
              {key}
            </button>
          );
        })}
      </div>
    </div>
  );
}
