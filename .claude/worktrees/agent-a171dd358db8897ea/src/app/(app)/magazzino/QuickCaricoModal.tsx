"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import DatePickerIT from "@/components/ui/DatePickerIT";
import type { Product } from "./types";

interface QuickCaricoModalProps {
  isOpen: boolean;
  product: Product | null;
  onClose: () => void;
  onConfirm: (prod: Product, qty: number, notes: string, expiry: string) => Promise<void>;
}

export default function QuickCaricoModal({
  isOpen,
  product,
  onClose,
  onConfirm,
}: QuickCaricoModalProps) {
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [expiry, setExpiry] = useState("");
  const [saving, setSaving] = useState(false);

  function handleClose() {
    setQty(1);
    setNotes("");
    setExpiry("");
    onClose();
  }

  async function handleConfirm() {
    if (!product || qty <= 0) return;
    setSaving(true);
    try {
      await onConfirm(product, qty, notes, expiry);
      handleClose();
    } finally {
      setSaving(false);
    }
  }

  if (!product) return null;

  return (
    <Modal isOpen={isOpen && !!product} onClose={handleClose} title="Carico rapido">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ padding: "14px 16px", borderRadius: 10, background: "#E3EEE4", border: "1px solid rgba(45,90,61,.2)" }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#2D5A3D" }}>{product.name}</div>
          <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 4 }}>Giacenza attuale: <strong>{product.current_stock} {product.unit}</strong></div>
        </div>
        <div>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-soft)", display: "block", marginBottom: 8 }}>Quantita da caricare</label>
          <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
            <button className="btn btn-ghost" style={{ width: 44, height: 44, fontSize: 20, padding: 0 }} onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
            <input type="number" min="1" value={qty} onChange={e => setQty(Math.max(1, Number(e.target.value)))}
              style={{ width: 80, textAlign: "center", fontSize: 24, fontWeight: 700, padding: "10px 8px", border: "1px solid var(--line)", borderRadius: 10, fontFamily: "inherit" }} />
            <button className="btn btn-ghost" style={{ width: 44, height: 44, fontSize: 20, padding: 0 }} onClick={() => setQty(qty + 1)}>+</button>
          </div>
        </div>
        <div className="field">
          <label>Scadenza (opzionale)</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <DatePickerIT value={expiry} onChange={v => setExpiry(v)} />
            {[{ label: "+6m", months: 6 }, { label: "+1a", months: 12 }, { label: "+2a", months: 24 }].map(b => (
              <button key={b.label} type="button" className="btn btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }}
                onClick={() => { const d = new Date(); d.setMonth(d.getMonth() + b.months); setExpiry(d.toISOString().slice(0, 10)); }}>
                {b.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Note (opzionale)</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Note aggiuntive..." />
        </div>
        <button className="btn btn-primary" style={{ width: "100%", padding: "14px 22px", fontSize: 15 }}
          onClick={handleConfirm} disabled={saving}>
          {saving ? "Salvataggio..." : `Carica ${qty} ${product.unit}`}
        </button>
      </div>
    </Modal>
  );
}
