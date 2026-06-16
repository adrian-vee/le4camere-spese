"use client";

import { useState, useEffect } from "react";
import PinLockOverlay from "./PinLockOverlay";

type BarHeaderProps = {
  operatorName: string;
};

export default function BarHeader({ operatorName }: BarHeaderProps) {
  const [time, setTime] = useState("");
  const [locked, setLocked] = useState(false);

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
        <div
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 16,
            letterSpacing: 3,
            color: "rgba(250,249,245,0.8)",
          }}
        >
          BAR &middot; LE 4 CAMERE
        </div>

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

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span
            style={{
              fontFamily: "'Albert Sans', sans-serif",
              fontSize: 14,
              color: "#FAF9F5",
            }}
          >
            {operatorName}
          </span>
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
