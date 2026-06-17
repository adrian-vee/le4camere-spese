"use client";

import { useState, useEffect } from "react";
import PinLockOverlay from "./PinLockOverlay";
import { isSoundEnabled, setSoundEnabled, isReceiptEnabled, setReceiptEnabled } from "@/lib/bar/sound";

type BarHeaderProps = {
  operatorName: string;
  onChangeOperator?: () => void;
  onLogout?: () => void;
};

export default function BarHeader({ operatorName, onChangeOperator, onLogout }: BarHeaderProps) {
  const [time, setTime] = useState("");
  const [locked, setLocked] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [receiptOn, setReceiptOn] = useState(true);

  useEffect(() => {
    setSoundOn(isSoundEnabled());
    setReceiptOn(isReceiptEnabled());
  }, []);

  useEffect(() => {
    const update = () =>
      setTime(
        new Date().toLocaleTimeString("it-IT", {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, []);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
  }

  function toggleReceipt() {
    const next = !receiptOn;
    setReceiptOn(next);
    setReceiptEnabled(next);
  }

  return (
    <>
      <header
        style={{
          background: "#1F3326",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          flexShrink: 0,
        }}
      >
        {/* Left: brand + icon */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#BFA762" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 2h8l-1 7H9L8 2z" />
            <path d="M12 9v4" />
            <path d="M7 17h10" />
            <path d="M9 13c0 2-2 4-2 4h10s-2-2-2-4" />
          </svg>
          <span
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 16,
              letterSpacing: 3,
              color: "rgba(250,249,245,0.8)",
            }}
          >
            BAR &middot; LE 4 CAMERE
          </span>
        </div>

        {/* Center: time */}
        <div
          style={{
            fontFamily: "'Albert Sans', sans-serif",
            fontSize: 15,
            color: "#FAF9F5",
            fontWeight: 600,
          }}
        >
          {time}
        </div>

        {/* Right: receipt toggle, sound toggle, operator, lock */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Receipt toggle */}
          <button
            onClick={toggleReceipt}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              opacity: receiptOn ? 1 : 0.5,
            }}
            title={receiptOn ? "Scontrino auto attivo" : "Scontrino auto disattivato"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FAF9F5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
          </button>

          {/* Sound toggle */}
          <button
            onClick={toggleSound}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              opacity: soundOn ? 1 : 0.5,
            }}
            title={soundOn ? "Suono attivo" : "Suono disattivato"}
          >
            {soundOn ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FAF9F5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 010 14.14" />
                <path d="M15.54 8.46a5 5 0 010 7.07" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FAF9F5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            )}
          </button>

          {/* Operator */}
          <button
            onClick={onChangeOperator}
            style={{
              fontFamily: "'Albert Sans', sans-serif",
              fontSize: 14,
              color: "#FAF9F5",
              background: "none",
              border: "none",
              cursor: onChangeOperator ? "pointer" : "default",
              padding: "4px 8px",
              borderRadius: 6,
              transition: "background 150ms",
            }}
            title="Cambio operatore"
          >
            {operatorName}
          </button>

          {/* Logout */}
          {onLogout && (
            <button
              onClick={onLogout}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 4,
                opacity: 0.7,
              }}
              title="Esci"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FAF9F5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          )}

          {/* Lock */}
          <button
            onClick={() => setLocked(true)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
            }}
            title="Blocca schermo"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#FAF9F5"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </button>
        </div>
      </header>

      {locked && <PinLockOverlay onUnlock={() => setLocked(false)} />}
    </>
  );
}
