"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import BottleIndicator from "@/components/BottleIndicator";
import type { Product } from "./types";

interface OpenBottleModalProps {
  product: Product | null;
  openingBottleId: string | null;
  onClose: () => void;
  onConfirm: (level: number) => Promise<void>;
}

export default function OpenBottleModal({
  product,
  openingBottleId,
  onClose,
  onConfirm,
}: OpenBottleModalProps) {
  const [level, setLevel] = useState(10);

  if (!product) return null;

  const cap = product.bottle_capacity_ml ?? 700;
  const pour = product.standard_pour_ml ?? 30;
  const ml = Math.round(level * cap / 10);
  const doses = pour > 0 ? Math.floor(ml / pour) : 0;
  const isOpening = openingBottleId === product.product_id;

  return (
    <Modal
      isOpen={!!product}
      onClose={() => { if (!isOpening) onClose(); }}
      maxWidth={440}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#1F3326", alignSelf: "flex-start" }}>{"\u{1F37E}"} Apri bottiglia</div>
        <div style={{ fontSize: 14, color: "var(--ink-soft)" }}>{product.name}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1F3326" }}>A che livello e la bottiglia?</div>
        <BottleIndicator fillLevel={level} size="lg" showLabel capacityMl={cap} />
        <div className="bottle-level-selector">
          {Array.from({ length: 11 }, (_, i) => (
            <button key={i} type="button"
              className={`bottle-level-btn${level === i ? " active" : ""}`}
              style={{ height: 10 + i * 2.5 }}
              onClick={() => setLevel(i)}>
              {i}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-soft)", textAlign: "center" }}>
          Livello: <strong style={{ color: "#1F3326" }}>{level}/10</strong> · ~{ml}ml · ~{doses} dosi
        </div>
        <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 4 }}>
          <button className="btn btn-ghost" style={{ flex: 1, padding: "12px 16px", fontSize: 14 }}
            onClick={onClose} disabled={isOpening}>Annulla</button>
          <button className="btn" style={{ flex: 1, padding: "12px 16px", fontSize: 14, fontWeight: 700, background: "#1F3326", color: "#FAF9F5", border: "none", borderRadius: 8, opacity: isOpening ? 0.6 : 1 }}
            onClick={() => onConfirm(level)} disabled={isOpening}>
            {isOpening ? "Apertura..." : "Conferma apertura"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
