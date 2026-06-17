"use client";

import { useState } from "react";

type GiftConfirmModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  total: number;
};

const REASONS = [
  { value: "vip", label: "VIP" },
  { value: "cortesia", label: "Cortesia" },
  { value: "errore", label: "Errore cucina/bar" },
  { value: "promozione", label: "Promozione" },
  { value: "altro", label: "Altro" },
];

export default function GiftConfirmModal({ isOpen, onClose, onConfirm, total }: GiftConfirmModalProps) {
  const [reason, setReason] = useState("cortesia");
  const [customReason, setCustomReason] = useState("");

  if (!isOpen) return null;

  const finalReason = reason === "altro" ? customReason.trim() || "Altro" : REASONS.find(r => r.value === reason)!.label;

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
          background: "#fff", borderRadius: 16, padding: 28, width: 380,
          maxWidth: "92vw", fontFamily: "'Albert Sans', sans-serif",
        }}
      >
        <h3 style={{
          margin: "0 0 6px", fontFamily: "'Fraunces', serif",
          fontSize: 20, color: "#1F3326", fontWeight: 600,
        }}>
          Conferma omaggio
        </h3>
        <p style={{ margin: "0 0 20px", fontSize: 14, color: "#6C6B5D" }}>
          Stai per registrare un omaggio di{" "}
          <strong style={{ color: "#C4453C" }}>
            {total.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
          </strong>.
          Le scorte verranno comunque scaricate.
        </p>

        <label style={{ fontSize: 13, fontWeight: 600, color: "#1F3326", marginBottom: 6, display: "block" }}>
          Motivo
        </label>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={{
            width: "100%", padding: "10px 12px", border: "1px solid #D8CCB8",
            borderRadius: 8, fontSize: 14, fontFamily: "inherit",
            color: "#1F3326", background: "#fff", marginBottom: 12,
          }}
        >
          {REASONS.map(r => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>

        {reason === "altro" && (
          <input
            type="text"
            placeholder="Specifica motivo..."
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            autoFocus
            style={{
              width: "100%", padding: "10px 12px", border: "1px solid #D8CCB8",
              borderRadius: 8, fontSize: 14, fontFamily: "inherit",
              color: "#1F3326", background: "#fff", marginBottom: 12,
              boxSizing: "border-box",
            }}
          />
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1, padding: "12px 0", borderRadius: 10,
              border: "1px solid #D8CCB8", background: "#fff",
              color: "#1F3326", fontSize: 14, fontWeight: 600,
              fontFamily: "inherit", cursor: "pointer",
            }}
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={() => { onConfirm(finalReason); setReason("cortesia"); setCustomReason(""); }}
            style={{
              flex: 1, padding: "12px 0", borderRadius: 10,
              border: "none", background: "#C4453C", color: "#fff",
              fontSize: 14, fontWeight: 700, fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            Conferma omaggio
          </button>
        </div>
      </div>
    </div>
  );
}
