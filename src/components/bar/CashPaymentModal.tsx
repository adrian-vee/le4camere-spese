"use client";

import { useState, useCallback } from "react";
import { eur } from "@/lib/format";

type CashPaymentModalProps = {
  isOpen: boolean;
  onClose: () => void;
  total: number;
  onConfirm: (amountReceived: number, changeGiven: number) => void;
};

const QUICK_AMOUNTS = [5, 10, 20, 50];

export default function CashPaymentModal({ isOpen, onClose, total, onConfirm }: CashPaymentModalProps) {
  const [input, setInput] = useState("");

  const amountReceived = parseFloat(input) || 0;
  const changeGiven = Math.max(0, amountReceived - total);
  const canConfirm = amountReceived >= total;

  const appendDigit = useCallback((d: string) => {
    setInput(prev => {
      if (d === "." && prev.includes(".")) return prev;
      if (prev.includes(".") && prev.split(".")[1].length >= 2) return prev;
      return prev + d;
    });
  }, []);

  const backspace = useCallback(() => {
    setInput(prev => prev.slice(0, -1));
  }, []);

  const handleExact = useCallback(() => {
    onConfirm(total, 0);
    setInput("");
  }, [total, onConfirm]);

  const handleQuick = useCallback((amount: number) => {
    if (amount >= total) {
      onConfirm(amount, Math.round((amount - total) * 100) / 100);
      setInput("");
    } else {
      setInput(String(amount));
    }
  }, [total, onConfirm]);

  const handleConfirm = useCallback(() => {
    if (!canConfirm) return;
    onConfirm(amountReceived, Math.round(changeGiven * 100) / 100);
    setInput("");
  }, [canConfirm, amountReceived, changeGiven, onConfirm]);

  if (!isOpen) return null;

  const numpadKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"];

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
      }}
    >
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 16, padding: 24, width: 340,
          maxWidth: "92vw", fontFamily: "'Albert Sans', sans-serif",
        }}
      >
        <h3 style={{
          margin: "0 0 4px", fontFamily: "'Fraunces', serif",
          fontSize: 20, color: "#1F3326", fontWeight: 600,
        }}>
          Pagamento contanti
        </h3>

        {/* Total to pay */}
        <div style={{ textAlign: "center", margin: "16px 0 12px" }}>
          <div style={{ fontSize: 13, color: "#6C6B5D", marginBottom: 4 }}>Da pagare</div>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif", fontSize: 36,
            color: "#1F3326", lineHeight: 1,
          }}>
            {eur(total)}
          </div>
        </div>

        {/* Amount received display */}
        <div style={{
          background: "#F3EBDD", borderRadius: 10, padding: "12px 16px",
          textAlign: "right", marginBottom: 12, minHeight: 48,
          display: "flex", alignItems: "center", justifyContent: "flex-end",
        }}>
          <span style={{
            fontFamily: "'Bebas Neue', sans-serif", fontSize: 28,
            color: input ? "#1F3326" : "#a0a09a", lineHeight: 1,
          }}>
            {input ? `€ ${input}` : "Importo ricevuto"}
          </span>
        </div>

        {/* Change display */}
        {input && (
          <div style={{
            textAlign: "center", marginBottom: 12, padding: "8px 0",
            borderRadius: 8,
            background: canConfirm ? "rgba(45,90,61,0.08)" : "rgba(158,59,46,0.08)",
          }}>
            <span style={{
              fontSize: 14, fontWeight: 700,
              color: canConfirm ? "#2D5A3D" : "#9E3B2E",
            }}>
              {canConfirm ? `Resto: ${eur(changeGiven)}` : `Mancano ${eur(total - amountReceived)}`}
            </span>
          </div>
        )}

        {/* Quick amount buttons */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {QUICK_AMOUNTS.map(a => (
            <button
              key={a}
              type="button"
              onClick={() => handleQuick(a)}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 8,
                border: "1px solid #D8CCB8", background: "#fff",
                fontFamily: "'Bebas Neue', sans-serif", fontSize: 18,
                color: "#1F3326", cursor: "pointer",
                transition: "background 150ms",
              }}
            >
              €{a}
            </button>
          ))}
        </div>

        {/* Numpad */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8, marginBottom: 12,
        }}>
          {numpadKeys.map(key => (
            <button
              key={key}
              type="button"
              onClick={() => {
                if (key === "back") backspace();
                else appendDigit(key);
              }}
              style={{
                height: 52, borderRadius: 10, border: "1px solid #D8CCB8",
                background: key === "back" ? "#F3EBDD" : "#fff",
                fontFamily: key === "back" ? "'Albert Sans', sans-serif" : "'Bebas Neue', sans-serif",
                fontSize: key === "back" ? 18 : 22,
                fontWeight: key === "back" ? 700 : 400,
                color: "#1F3326", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                touchAction: "manipulation",
              }}
            >
              {key === "back" ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z" />
                  <line x1="18" y1="9" x2="12" y2="15" />
                  <line x1="12" y1="9" x2="18" y2="15" />
                </svg>
              ) : key}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={handleExact}
            style={{
              flex: 1, padding: "12px 0", borderRadius: 10,
              border: "1px solid #D8CCB8", background: "#F3EBDD",
              color: "#1F3326", fontSize: 13, fontWeight: 600,
              fontFamily: "inherit", cursor: "pointer",
            }}
          >
            Importo esatto
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            style={{
              flex: 1, padding: "12px 0", borderRadius: 10,
              border: "none",
              background: canConfirm ? "#1F3326" : "#a0a09a",
              color: "#fff", fontSize: 14, fontWeight: 700,
              fontFamily: "inherit",
              cursor: canConfirm ? "pointer" : "default",
              opacity: canConfirm ? 1 : 0.6,
            }}
          >
            Conferma
          </button>
        </div>
      </div>
    </div>
  );
}
