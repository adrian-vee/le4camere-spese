"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type StaffItem = { id: string; name: string };

const LEAVE_TYPES = [
  { value: "permesso", label: "Permesso" },
  { value: "malattia", label: "Malattia" },
  { value: "ferie", label: "Ferie" },
  { value: "altro", label: "Altro" },
] as const;

const PERIOD_OPTIONS = [
  { value: "giornata_intera", label: "Giornata intera" },
  { value: "mattina", label: "Solo mattina" },
  { value: "pomeriggio", label: "Solo pomeriggio" },
] as const;

type LeaveType = typeof LEAVE_TYPES[number]["value"];
type Period = typeof PERIOD_OPTIONS[number]["value"];

interface Props {
  staff: StaffItem[];
  supabase: SupabaseClient;
  onClose: () => void;
  onDone: () => void;
  showToast: (msg: string) => void;
  /** Pre-selected staff id (optional) */
  preselectedStaffId?: string;
  /** If true, creates with status 'in_attesa' instead of 'approvato' */
  asRequest?: boolean;
}

export default function LeaveModal({ staff, supabase, onClose, onDone, showToast, preselectedStaffId, asRequest }: Props) {
  const [staffId, setStaffId] = useState(preselectedStaffId ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<LeaveType>("permesso");
  const [period, setPeriod] = useState<Period>("giornata_intera");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [confirmRemoveShift, setConfirmRemoveShift] = useState(false);

  const staffName = staff.find(s => s.id === staffId)?.name ?? "";

  async function checkConflict() {
    if (!staffId || !date) return null;
    const { data } = await supabase
      .from("shifts")
      .select("id, shift_type_id, shift_date")
      .eq("staff_id", staffId)
      .eq("shift_date", date);
    if (data && data.length > 0) {
      return `${staffName} ha ${data.length} turno/i assegnato/i il ${new Date(date + "T00:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" })}`;
    }
    return null;
  }

  async function handleSubmit() {
    if (!staffId) return showToast("Seleziona una persona");
    if (!date) return showToast("Seleziona una data");

    setSaving(true);

    // Check for shift conflicts
    if (!confirmRemoveShift) {
      const conflictMsg = await checkConflict();
      if (conflictMsg) {
        setConflict(conflictMsg);
        setSaving(false);
        return;
      }
    }

    // If confirmed, remove shifts for that day
    if (confirmRemoveShift) {
      if (period === "giornata_intera") {
        await supabase.from("shifts").update({ staff_id: null }).eq("staff_id", staffId).eq("shift_date", date);
      }
      // For half-day, we keep shifts but the leave record will block future assignment
    }

    const { error } = await supabase.from("staff_leaves").insert({
      staff_id: staffId,
      staff_name: staffName,
      date,
      type,
      period,
      reason: reason.trim() || null,
      status: asRequest ? "in_attesa" : "approvato",
    });

    if (error) {
      if (error.code === "23505") {
        showToast("Permesso già registrato per questa data");
      } else {
        showToast("Errore: " + error.message);
      }
      setSaving(false);
      return;
    }

    showToast(asRequest ? "Richiesta permesso inviata" : `Permesso registrato per ${staffName}`);
    onDone();
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <div className="section-head" style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
          <h2>{asRequest ? "Richiedi permesso" : "Dai permesso"}</h2>
          <button className="btn-ghost" style={{ padding: "4px 10px", borderRadius: 8 }} onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Staff selector */}
          <div className="field">
            <label>Persona</label>
            {preselectedStaffId ? (
              <input value={staffName} disabled style={{ background: "var(--surface-2)" }} />
            ) : (
              <select value={staffId} onChange={e => { setStaffId(e.target.value); setConflict(null); setConfirmRemoveShift(false); }}>
                <option value="">Seleziona...</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>

          {/* Date */}
          <div className="field">
            <label>Data</label>
            <input type="date" value={date} onChange={e => { setDate(e.target.value); setConflict(null); setConfirmRemoveShift(false); }} />
          </div>

          {/* Type pills */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-soft)", display: "block", marginBottom: 6 }}>Tipo</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {LEAVE_TYPES.map(t => (
                <button key={t.value} type="button"
                  className={`absence-pill ${t.value}${type === t.value ? " active" : ""}`}
                  onClick={() => setType(t.value)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Period */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-soft)", display: "block", marginBottom: 6 }}>Periodo</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {PERIOD_OPTIONS.map(p => (
                <button key={p.value} type="button"
                  style={{
                    padding: "8px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600,
                    border: period === p.value ? "2px solid #7B61A6" : "1.5px solid var(--line)",
                    background: period === p.value ? "rgba(123,97,166,.12)" : "transparent",
                    color: period === p.value ? "#7B61A6" : "var(--ink-soft)",
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                  onClick={() => setPeriod(p.value)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reason */}
          <div className="field">
            <label>Motivo (opzionale)</label>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Es. visita medica, motivi personali..." />
          </div>

          {/* Conflict warning */}
          {conflict && !confirmRemoveShift && (
            <div style={{
              padding: "14px 18px", borderRadius: 10,
              background: "rgba(199,123,74,.1)", border: "1px solid rgba(199,123,74,.25)",
              fontSize: 13, color: "#C77B4A",
            }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><path d="M12 9v4M12 17h.01" />
                </svg>
                Conflitto turno
              </div>
              <div>{conflict}</div>
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <button className="btn btn-primary" style={{ padding: "8px 16px", fontSize: 13, background: "#C77B4A" }}
                  onClick={() => setConfirmRemoveShift(true)}>
                  Rimuovi dal turno e registra
                </button>
                <button className="btn-ghost" style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13 }}
                  onClick={() => { setConflict(null); }}>
                  Annulla
                </button>
              </div>
            </div>
          )}

          {confirmRemoveShift && (
            <div style={{
              padding: "10px 14px", borderRadius: 10,
              background: "rgba(45,90,61,.08)", border: "1px solid rgba(45,90,61,.2)",
              fontSize: 13, color: "#2D5A3D", fontWeight: 600,
            }}>
              Il turno verrà rimosso automaticamente
            </div>
          )}

          <button className="btn btn-primary" style={{ width: "100%", padding: "14px 22px", fontSize: 15 }}
            onClick={handleSubmit} disabled={saving || !staffId || !date}>
            {saving ? "Salvataggio..." : asRequest ? "Invia richiesta" : "Registra permesso"}
          </button>
        </div>
      </div>
    </div>
  );
}
