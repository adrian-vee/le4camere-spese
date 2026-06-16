"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { eur } from "@/lib/format";

interface CashSession {
  id: string;
  opened_at: string;
  closed_at: string | null;
  opened_by: string;
  closed_by: string | null;
  opening_amount: number;
  expected_amount: number | null;
  actual_amount: number | null;
  difference: number | null;
  notes: string | null;
  status: "open" | "closed";
  shift_date: string | null;
  shift_type: string | null;
}

interface CashMovement {
  id: string;
  session_id: string;
  created_at: string;
  created_by: string;
  type: "entrata" | "uscita";
  amount: number;
  category: string;
  description: string | null;
  receipt_url: string | null;
}

interface CategoryTotal {
  category: string;
  label: string;
  type: "entrata" | "uscita";
  total: number;
  count: number;
}

interface SessionTotals {
  openingAmount: number;
  fondoFisso: number;
  riporto: number;
  entrate: number;
  uscite: number;
  consegnato: number;
  saldo: number;
  daConsegnare: number;
}

export interface CloseSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSession: CashSession | null;
  sessionTotals: SessionTotals;
  movements: CashMovement[];
  closeCatTotals: CategoryTotal[];
  fondoCassa: number;
  onConfirm: (actualAmount: number, notes: string) => Promise<void>;
}

function fmtDateLocal(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function CloseSessionModal({
  isOpen,
  onClose,
  activeSession,
  sessionTotals,
  movements,
  closeCatTotals,
  onConfirm,
}: CloseSessionModalProps) {
  const [actualAmount, setActualAmount] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [closingSession, setClosingSession] = useState(false);

  const closeDiff = actualAmount && !isNaN(parseFloat(actualAmount)) ? parseFloat(actualAmount) - sessionTotals.saldo : null;
  const closeDiffColor = closeDiff === null ? undefined : Math.abs(closeDiff) < 0.01 ? "#2D5A3D" : closeDiff < 0 ? "#9E3B2E" : "#C77B4A";

  const title = useMemo(() => {
    if (!activeSession) return "Chiusura cassa";
    const shiftLabel = activeSession.shift_type || "";
    const dateLabel = fmtDateLocal(activeSession.shift_date ? activeSession.shift_date + "T00:00:00" : activeSession.opened_at);
    return `Chiusura cassa — Turno ${shiftLabel} ${dateLabel}`;
  }, [activeSession]);

  function handleClose() {
    setActualAmount("");
    setCloseNotes("");
    onClose();
  }

  async function handleConfirm() {
    const amt = parseFloat(actualAmount);
    if (isNaN(amt) || amt < 0) return;
    if (closingSession) return;
    setClosingSession(true);
    try {
      await onConfirm(amt, closeNotes);
      setActualAmount("");
      setCloseNotes("");
    } finally {
      setClosingSession(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} maxWidth={600}>
      <div style={{ maxHeight: "70vh", overflowY: "auto" }}>
        {/* Category breakdown */}
        {closeCatTotals.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "#1F3326" }}>Riepilogo per categoria</div>
            {closeCatTotals.filter(t => t.type === "entrata").length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#2D5A3D", marginBottom: 4 }}>Entrate</div>
                {closeCatTotals.filter(t => t.type === "entrata").map(t => (
                  <div key={t.category} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 2, paddingLeft: 8 }}>
                    <span>{t.label} ({t.count})</span>
                    <strong style={{ color: "#2D5A3D" }}>+{eur(t.total)}</strong>
                  </div>
                ))}
              </div>
            )}
            {closeCatTotals.filter(t => t.type === "uscita").length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#9E3B2E", marginBottom: 4 }}>Uscite</div>
                {closeCatTotals.filter(t => t.type === "uscita").map(t => (
                  <div key={t.category} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 2, paddingLeft: 8 }}>
                    <span>{t.label} ({t.count})</span>
                    <strong style={{ color: "#9E3B2E" }}>-{eur(t.total)}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Totals summary */}
        <div style={{ marginBottom: 16, padding: 16, background: "#F3EBDD", borderRadius: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span>Fondo fisso</span>
            <strong>{eur(sessionTotals.fondoFisso)}</strong>
          </div>
          {sessionTotals.riporto > 0.01 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, color: "#C77B4A" }}>
              <span>Riporto turno prec.</span>
              <strong>+{eur(sessionTotals.riporto)}</strong>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, color: "#2D5A3D" }}>
            <span>Incassi turno ({movements.filter(m => m.type === "entrata").length})</span>
            <strong>+{eur(sessionTotals.entrate)}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, color: "#9E3B2E" }}>
            <span>Uscite turno ({movements.filter(m => m.type === "uscita").length})</span>
            <strong>-{eur(sessionTotals.uscite)}</strong>
          </div>
          {sessionTotals.consegnato > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, color: "#4F7B8C" }}>
              <span>Consegnato</span>
              <strong>{eur(sessionTotals.consegnato)}</strong>
            </div>
          )}
          <div style={{ borderTop: "1px solid #D8CCB8", paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 16 }}>
            <strong>In cassa ora</strong>
            <strong style={{ color: "#1F3326" }}>{eur(sessionTotals.saldo)}</strong>
          </div>
        </div>

        {/* Warning: still money to hand over */}
        {sessionTotals.daConsegnare > 0.01 && (
          <div style={{
            padding: 14, borderRadius: 10, marginBottom: 12,
            background: "#FFF8F0", border: "1px solid #C77B4A40",
            fontSize: 14, textAlign: "center", color: "#C77B4A", fontWeight: 600,
          }}>
            Ci sono ancora {eur(sessionTotals.daConsegnare)} da consegnare
          </div>
        )}

        {/* Actual count */}
        <div className="field">
          <label style={{ fontWeight: 700 }}>Conteggio effettivo in cassa (EUR)</label>
          <input type="number" min="0" step="0.01" value={actualAmount}
            onChange={e => setActualAmount(e.target.value)} placeholder="0.00" autoFocus
            style={{ fontSize: 18, padding: "12px 16px", fontWeight: 700 }} />
        </div>

        {/* Difference display */}
        {closeDiff !== null && (
          <div style={{
            padding: 14, borderRadius: 10, marginBottom: 12, marginTop: 4,
            background: closeDiffColor === "#2D5A3D" ? "#E3EEE4" : closeDiffColor === "#9E3B2E" ? "#F5E6E4" : "#FFF8F0",
            fontWeight: 700, fontSize: 16, textAlign: "center",
            color: closeDiffColor,
          }}>
            Differenza: {eur(closeDiff)}
            {Math.abs(closeDiff) < 0.01 && " — Tutto quadra!"}
            {closeDiff > 0.01 && " — Soldi in più (errore di resto?)"}
          </div>
        )}

        <div className="field">
          <label>Note chiusura (opzionale)</label>
          <input value={closeNotes} onChange={e => setCloseNotes(e.target.value)} placeholder="Es. tutto quadra, banconota da 50 mancante..." />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button className="btn-ghost" style={{ flex: 1, padding: 12, borderRadius: 8 }} onClick={handleClose}>Annulla</button>
          <button className="btn btn-primary" style={{ flex: 1, padding: 12, background: "#9E3B2E" }}
            onClick={handleConfirm} disabled={closingSession}>
            {closingSession ? "Chiusura in corso..." : "Conferma chiusura"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
