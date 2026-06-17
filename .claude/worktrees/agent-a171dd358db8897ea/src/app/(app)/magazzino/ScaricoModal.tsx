"use client";

import { useState } from "react";
import { fmtDate } from "@/lib/format";
import { Modal } from "@/components/ui/Modal";
import DatePickerIT from "@/components/ui/DatePickerIT";
import type { Product, Batch } from "./types";
import { SCARICO_REASONS } from "./types";

interface ScaricoModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  scaricoProd: Product | null;
  setScaricoProd: (p: Product | null) => void;
  nearestExpiryMap: Record<string, string>;
  todayStr: string;
  batchesByProduct: Record<string, Batch[]>;
  showToast: (msg: string, type?: "ok" | "warn" | "error") => void;
  onConfirm: (prod: Product, qty: number, reason: string, notes: string) => Promise<void>;
}

export default function ScaricoModal({
  isOpen,
  onClose,
  products,
  scaricoProd,
  setScaricoProd,
  nearestExpiryMap,
  todayStr,
  showToast,
  onConfirm,
}: ScaricoModalProps) {
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState(SCARICO_REASONS[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  function handleClose() {
    setScaricoProd(null);
    setQty(1);
    setReason(SCARICO_REASONS[0]);
    setNotes("");
    onClose();
  }

  async function handleConfirm() {
    if (!scaricoProd || qty <= 0) return;
    setSaving(true);
    try {
      await onConfirm(scaricoProd, qty, reason, notes);
      handleClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Scarico rapido">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {!scaricoProd ? (
          <div className="field">
            <label>Prodotto</label>
            <select value="" onChange={e => { const p = products.find(x => x.product_id === e.target.value); if (p) setScaricoProd(p); }}>
              <option value="">Seleziona...</option>
              {products.map(p => <option key={p.product_id} value={p.product_id}>{p.name} ({p.current_stock} {p.unit})</option>)}
            </select>
          </div>
        ) : (
          <>
            <div style={{ padding: "14px 16px", borderRadius: 10, background: "var(--surface-2)" }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{scaricoProd.name}</div>
              <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 4 }}>Giacenza: <strong>{scaricoProd.current_stock} {scaricoProd.unit}</strong></div>
              {nearestExpiryMap[scaricoProd.product_id] && (
                <div style={{ fontSize: 12, marginTop: 4, color: nearestExpiryMap[scaricoProd.product_id] < todayStr ? "#9E3B2E" : "#C77B4A", fontWeight: 600 }}>
                  Lotto con scadenza piu vicina: {fmtDate(nearestExpiryMap[scaricoProd.product_id])}
                  {nearestExpiryMap[scaricoProd.product_id] < todayStr ? " (scaduto)" : ""}
                </div>
              )}
            </div>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-soft)", display: "block", marginBottom: 8 }}>Quantita</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
                <button className="btn btn-ghost" style={{ width: 44, height: 44, fontSize: 20, padding: 0 }} onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
                <input type="number" min="1" value={qty} onChange={e => setQty(Math.max(1, Number(e.target.value)))}
                  style={{ width: 80, textAlign: "center", fontSize: 24, fontWeight: 700, padding: "10px 8px", border: "1px solid var(--line)", borderRadius: 10, fontFamily: "inherit" }} />
                <button className="btn btn-ghost" style={{ width: 44, height: 44, fontSize: 20, padding: 0 }} onClick={() => setQty(qty + 1)}>+</button>
              </div>
            </div>
            <div className="field">
              <label>Motivo</label>
              <select value={reason} onChange={e => setReason(e.target.value)}>
                {SCARICO_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Note (opzionale)</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Note aggiuntive..." />
            </div>
            <button className="btn btn-primary" style={{ width: "100%", padding: "14px 22px", fontSize: 15 }}
              onClick={handleConfirm} disabled={saving}>
              {saving ? "Salvataggio..." : `Scarica ${qty} ${scaricoProd.unit}`}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
