"use client";

import type { ShiftType } from "@/lib/scheduler";

type Slot = { key: string; date: string; shift_type_id: string; staff_id: string | null };
type StaffItem = { id: string; name: string; type: string; hours_per_week: number };

type SwapModalProps = {
  swapDate: string;
  setSwapDate: (v: string) => void;
  swapTargetId: string;
  setSwapTargetId: (v: string) => void;
  swapNote: string;
  setSwapNote: (v: string) => void;
  swapSending: boolean;
  onSubmit: () => void;
  onClose: () => void;
  slots: Slot[];
  staff: StaffItem[];
  myStaffId: string | null;
  stById: Map<string, ShiftType>;
  today: string;
};

export default function SwapModal({
  swapDate, setSwapDate, swapTargetId, setSwapTargetId,
  swapNote, setSwapNote, swapSending, onSubmit, onClose,
  slots, staff, myStaffId, stById, today,
}: SwapModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="section-head" style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
          <h2>Richiedi cambio turno</h2>
          <button className="btn-ghost" style={{ padding: "4px 10px", borderRadius: 8 }} onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="field">
            <label>Il mio turno da scambiare</label>
            <select value={swapDate} onChange={e => setSwapDate(e.target.value)}>
              <option value="">Seleziona...</option>
              {slots.filter(s => s.staff_id === myStaffId && s.date >= today).map(s => {
                const t = stById.get(s.shift_type_id);
                return <option key={s.key} value={s.date}>{new Date(s.date + "T00:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "long" })} &mdash; {t?.name ?? "?"}</option>;
              })}
            </select>
          </div>
          <div className="field">
            <label>Scambia con</label>
            <select value={swapTargetId} onChange={e => setSwapTargetId(e.target.value)}>
              <option value="">Seleziona collega...</option>
              {staff.filter(s => s.id !== myStaffId).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Nota (opzionale)</label>
            <textarea value={swapNote} onChange={e => setSwapNote(e.target.value)} placeholder="Motivo dello scambio..." rows={3} />
          </div>
          <button className="btn btn-primary" style={{ width: "100%", padding: "14px 22px", fontSize: 15 }}
            onClick={onSubmit} disabled={swapSending || !swapDate || !swapTargetId}>
            {swapSending ? "Invio..." : "Invia richiesta"}
          </button>
        </div>
      </div>
    </div>
  );
}
