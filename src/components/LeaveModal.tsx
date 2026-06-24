"use client";

import { useState, useMemo } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isoToday, fmtDate } from "@/lib/format";
import DatePickerIT from "@/components/ui/DatePickerIT";

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

function getDaysInRange(from: string, to: string, excludeSundays: boolean): string[] {
  const days: string[] = [];
  const start = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return days;
  const cur = new Date(start);
  while (cur <= end) {
    if (!excludeSundays || cur.getDay() !== 0) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, "0");
      const d = String(cur.getDate()).padStart(2, "0");
      days.push(`${y}-${m}-${d}`);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

interface Props {
  staff: StaffItem[];
  supabase: SupabaseClient;
  onClose: () => void;
  onDone: () => void;
  showToast: (msg: string) => void;
  preselectedStaffId?: string;
  asRequest?: boolean;
  profileToStaffId?: Map<string, string>;
}

export default function LeaveModal({ staff, supabase, onClose, onDone, showToast, preselectedStaffId, asRequest, profileToStaffId }: Props) {
  const [staffId, setStaffId] = useState(preselectedStaffId ?? "");
  const [date, setDate] = useState(isoToday());
  const [dateTo, setDateTo] = useState(isoToday());
  const [type, setType] = useState<LeaveType>("permesso");
  const [period, setPeriod] = useState<Period>("giornata_intera");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [confirmRemoveShift, setConfirmRemoveShift] = useState(false);
  const [excludeSundays, setExcludeSundays] = useState(true);

  const isFerie = type === "ferie";
  const staffName = staff.find(s => s.id === staffId)?.name ?? "";
  const scheduleStaffId = profileToStaffId?.get(staffId) ?? staffId;

  const ferieDays = useMemo(() => {
    if (!isFerie) return [];
    return getDaysInRange(date, dateTo, excludeSundays);
  }, [isFerie, date, dateTo, excludeSundays]);

  const ferieSummary = useMemo(() => {
    if (!isFerie || ferieDays.length === 0) return null;
    return `Ferie dal ${fmtDate(ferieDays[0])} al ${fmtDate(ferieDays[ferieDays.length - 1])} — ${ferieDays.length} giorn${ferieDays.length === 1 ? "o" : "i"}`;
  }, [isFerie, ferieDays]);

  async function checkConflict() {
    if (!staffId || !date) return null;
    const datesToCheck = isFerie ? ferieDays : [date];
    if (datesToCheck.length === 0) return null;
    const { data } = await supabase
      .from("shifts")
      .select("id, shift_type_id, shift_date")
      .eq("staff_id", scheduleStaffId)
      .in("shift_date", datesToCheck);
    if (data && data.length > 0) {
      return `${staffName} ha ${data.length} turno/i assegnato/i nei giorni selezionati`;
    }
    return null;
  }

  async function handleSubmit() {
    if (!staffId) return showToast("Seleziona una persona");
    if (!date) return showToast("Seleziona una data");
    if (isFerie && ferieDays.length === 0) return showToast("L'intervallo ferie non è valido");

    setSaving(true);

    if (!asRequest) {
      if (!confirmRemoveShift) {
        const conflictMsg = await checkConflict();
        if (conflictMsg) {
          setConflict(conflictMsg);
          setSaving(false);
          return;
        }
      }

      if (confirmRemoveShift) {
        const datesToClear = isFerie ? ferieDays : (period === "giornata_intera" ? [date] : []);
        for (const d of datesToClear) {
          await supabase.from("shifts").update({ staff_id: null }).eq("staff_id", scheduleStaffId).eq("shift_date", d);
        }
      }
    }

    if (isFerie) {
      const rows = ferieDays.map(d => ({
        staff_id: staffId,
        staff_name: staffName,
        date: d,
        type: "ferie" as const,
        period: "giornata_intera" as const,
        reason: reason.trim() || null,
        status: asRequest ? "in_attesa" : "approvato",
      }));
      const { error } = await supabase.from("staff_leaves").insert(rows);
      if (error) {
        if (error.code === "23505") {
          showToast("Alcune date hanno già un'assenza registrata");
        } else {
          showToast("Errore: " + error.message);
        }
        setSaving(false);
        return;
      }
    } else {
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
          showToast("Assenza già registrata per questa data");
        } else {
          showToast("Errore: " + error.message);
        }
        setSaving(false);
        return;
      }
    }

    const label = isFerie ? `Ferie registrate per ${staffName} (${ferieDays.length} giorni)` :
      asRequest ? "Richiesta inviata. L'amministratore la valuterà." :
      `Assenza registrata per ${staffName}`;
    showToast(label);
    onDone();
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <div className="section-head" style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
          <h2>{asRequest ? "Richiedi assenza" : "Registra assenza"}</h2>
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

          {/* Type pills */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-soft)", display: "block", marginBottom: 6 }}>Tipo</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {LEAVE_TYPES.map(t => (
                <button key={t.value} type="button"
                  className={`absence-pill ${t.value}${type === t.value ? " active" : ""}`}
                  onClick={() => { setType(t.value); setConflict(null); setConfirmRemoveShift(false); }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date — single for non-ferie, range for ferie */}
          {isFerie ? (
            <div style={{ display: "flex", gap: 12 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Dal</label>
                <DatePickerIT value={date} onChange={v => { setDate(v); setConflict(null); setConfirmRemoveShift(false); }} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Al</label>
                <DatePickerIT value={dateTo} onChange={v => { setDateTo(v); setConflict(null); setConfirmRemoveShift(false); }} />
              </div>
            </div>
          ) : (
            <div className="field">
              <label>Data</label>
              <DatePickerIT value={date} onChange={v => { setDate(v); setConflict(null); setConfirmRemoveShift(false); }} />
            </div>
          )}

          {/* Exclude sundays toggle (ferie only) */}
          {isFerie && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", color: "var(--ink-soft)" }}>
              <input type="checkbox" checked={excludeSundays} onChange={e => setExcludeSundays(e.target.checked)} style={{ accentColor: "#7B61A6" }} />
              Escludi domeniche
            </label>
          )}

          {/* Ferie summary */}
          {isFerie && ferieSummary && (
            <div style={{
              padding: "12px 16px", borderRadius: 10,
              background: "rgba(79,123,140,.08)", border: "1px solid rgba(79,123,140,.2)",
              fontSize: 14, fontWeight: 600, color: "#4F7B8C",
            }}>
              {ferieSummary}
            </div>
          )}

          {isFerie && date && dateTo && date > dateTo && (
            <div style={{
              padding: "10px 14px", borderRadius: 10,
              background: "rgba(158,59,46,.08)", border: "1px solid rgba(158,59,46,.2)",
              fontSize: 13, color: "#9E3B2E", fontWeight: 600,
            }}>
              La data &quot;Al&quot; deve essere uguale o successiva a &quot;Dal&quot;
            </div>
          )}

          {/* Period — only for non-ferie */}
          {!isFerie && (
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
          )}

          {/* Reason */}
          <div className="field">
            <label>Motivo (opzionale)</label>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Es. visita medica, motivi personali..." />
          </div>

          {/* Conflict warning */}
          {!asRequest && conflict && !confirmRemoveShift && (
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
                  Rimuovi dai turni e registra
                </button>
                <button className="btn-ghost" style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13 }}
                  onClick={() => { setConflict(null); }}>
                  Annulla
                </button>
              </div>
            </div>
          )}

          {!asRequest && confirmRemoveShift && (
            <div style={{
              padding: "10px 14px", borderRadius: 10,
              background: "rgba(45,90,61,.08)", border: "1px solid rgba(45,90,61,.2)",
              fontSize: 13, color: "#2D5A3D", fontWeight: 600,
            }}>
              {isFerie ? `I turni nei ${ferieDays.length} giorni verranno rimossi automaticamente` : "Il turno verrà rimosso automaticamente"}
            </div>
          )}

          <button className="btn btn-primary" style={{ width: "100%", padding: "14px 22px", fontSize: 15 }}
            onClick={handleSubmit} disabled={saving || !staffId || (!isFerie && !date) || (isFerie && ferieDays.length === 0)}>
            {saving ? "Salvataggio..." : asRequest ? "Invia richiesta" : "Registra assenza"}
          </button>
        </div>
      </div>
    </div>
  );
}
