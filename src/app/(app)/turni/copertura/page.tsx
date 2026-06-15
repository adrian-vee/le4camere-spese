"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { WEEKDAYS, type ShiftTypeRow, type CoverageExceptionRow } from "@/lib/turni";
import DatePickerIT from "@/components/ui/DatePickerIT";

const isoWd = (d: string) => { const x = new Date(`${d}T00:00:00`).getDay(); return x === 0 ? 7 : x; };
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINS = [0, 15, 30, 45];
const padT = (n: number) => String(n).padStart(2, "0");
const parseTime = (t: string) => { const [h, m] = t.split(":").map(Number); return { h, m: MINS.includes(m) ? m : MINS.reduce((p, c) => Math.abs(c - m) < Math.abs(p - m) ? c : p, 0) }; };

function TimeSelect({ h, m, onH, onM }: { h: number; m: number; onH: (v: number) => void; onM: (v: number) => void }) {
  const ss: React.CSSProperties = { fontFamily: "inherit", fontSize: 14, padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 8 };
  return (
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
      <select value={h} onChange={e => onH(Number(e.target.value))} style={ss}>{HOURS.map(v => <option key={v} value={v}>{padT(v)}</option>)}</select>
      <span style={{ fontWeight: 600 }}>:</span>
      <select value={m} onChange={e => onM(Number(e.target.value))} style={ss}>{MINS.map(v => <option key={v} value={v}>{padT(v)}</option>)}</select>
    </span>
  );
}

export default function CoperturaPage() {
  const supabase = createClient();
  const [types, setTypes] = useState<ShiftTypeRow[]>([]);
  const [matrix, setMatrix] = useState<Record<string, number>>({}); // `${weekday}|${typeId}` -> count
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  // Shift type CRUD state
  const [editingType, setEditingType] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSH, setEditSH] = useState(0);
  const [editSM, setEditSM] = useState(0);
  const [editEH, setEditEH] = useState(0);
  const [editEM, setEditEM] = useState(0);
  const [showNewType, setShowNewType] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSH, setNewSH] = useState(7);
  const [newSM, setNewSM] = useState(0);
  const [newEH, setNewEH] = useState(14);
  const [newEM, setNewEM] = useState(0);

  // Exceptions state
  const [exceptions, setExceptions] = useState<CoverageExceptionRow[]>([]);
  const [excDate, setExcDate] = useState("");
  const [excTypeId, setExcTypeId] = useState("");
  const [excCount, setExcCount] = useState(0);
  const [excNotes, setExcNotes] = useState("");
  const [excSaving, setExcSaving] = useState(false);
  const [editingExc, setEditingExc] = useState<CoverageExceptionRow | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: ty }, { data: cov }, { data: exc }] = await Promise.all([
      supabase.from("shift_types").select("*").order("sort"),
      supabase.from("coverage_template").select("*"),
      supabase.from("coverage_exceptions").select("*").order("exception_date"),
    ]);
    setTypes((ty ?? []) as ShiftTypeRow[]);
    const m: Record<string, number> = {};
    for (const c of (cov ?? []) as { weekday: number; shift_type_id: string; count: number }[]) {
      m[`${c.weekday}|${c.shift_type_id}`] = c.count;
    }
    setMatrix(m);
    setExceptions((exc ?? []) as CoverageExceptionRow[]);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const get = (wd: number, id: string) => matrix[`${wd}|${id}`] ?? 0;
  function set(wd: number, id: string, v: number) {
    setMatrix((m) => ({ ...m, [`${wd}|${id}`]: Math.max(0, v) }));
    setSaved(false);
  }

  // Get base coverage for a specific date + shift type
  function getBaseCount(date: string, typeId: string): number {
    if (!date || !typeId) return 0;
    const wd = isoWd(date);
    return matrix[`${wd}|${typeId}`] ?? 0;
  }

  // Current base count for the form selection
  const excBaseCount = useMemo(() => getBaseCount(excDate, excTypeId), [excDate, excTypeId, matrix]); // eslint-disable-line

  // Auto-fill count when date+type change (only for new exceptions, not edits)
  useEffect(() => {
    if (editingExc) return;
    if (excDate && excTypeId) {
      const base = getBaseCount(excDate, excTypeId);
      setExcCount(base > 0 ? base + 1 : 2); // Default to base+1
    }
  }, [excDate, excTypeId]); // eslint-disable-line

  async function salva() {
    const rows: { weekday: number; shift_type_id: string; count: number }[] = [];
    for (let wd = 1; wd <= 7; wd++) for (const t of types) rows.push({ weekday: wd, shift_type_id: t.id, count: get(wd, t.id) });
    const { error } = await supabase.from("coverage_template").upsert(rows, { onConflict: "weekday,shift_type_id" });
    if (error) return alert("Errore: " + error.message);
    setSaved(true);
  }

  // ── Shift type CRUD ──
  function startEditType(t: ShiftTypeRow) {
    const s = parseTime(t.start_time), e = parseTime(t.end_time);
    setEditingType(t.id); setEditName(t.name);
    setEditSH(s.h); setEditSM(s.m); setEditEH(e.h); setEditEM(e.m);
  }
  async function saveEditType() {
    if (!editingType || !editName.trim()) return;
    const { error } = await supabase.from("shift_types").update({
      name: editName.trim(), start_time: `${padT(editSH)}:${padT(editSM)}`, end_time: `${padT(editEH)}:${padT(editEM)}`,
    }).eq("id", editingType);
    if (error) return alert("Errore: " + error.message);
    setEditingType(null); load();
  }
  async function deleteType(id: string) {
    if (types.length <= 2) return alert("Servono almeno 2 fasce orarie.");
    if (!confirm("Sei sicuro? I turni assegnati a questa fascia verranno rimossi.")) return;
    await supabase.from("shift_types").delete().eq("id", id);
    load();
  }
  async function addNewType() {
    if (!newName.trim()) return;
    const maxSort = types.length > 0 ? Math.max(...types.map(t => t.sort)) : 0;
    const { error } = await supabase.from("shift_types").insert({
      name: newName.trim(), start_time: `${padT(newSH)}:${padT(newSM)}`, end_time: `${padT(newEH)}:${padT(newEM)}`, sort: maxSort + 1,
    });
    if (error) return alert("Errore: " + error.message);
    setShowNewType(false); setNewName(""); setNewSH(7); setNewSM(0); setNewEH(14); setNewEM(0);
    load();
  }

  function resetExcForm() {
    setExcDate(""); setExcTypeId(""); setExcCount(0); setExcNotes(""); setEditingExc(null);
  }

  async function saveException() {
    if (!excDate || !excTypeId) return;
    if (excCount === excBaseCount && !editingExc) {
      alert(`Il valore ${excCount} è uguale alla copertura base. Imposta un numero diverso per creare un'eccezione.`);
      return;
    }
    setExcSaving(true);
    if (editingExc) {
      const { error } = await supabase.from("coverage_exceptions")
        .update({ exception_date: excDate, shift_type_id: excTypeId, required_count: excCount, notes: excNotes || null })
        .eq("id", editingExc.id);
      if (error) { alert("Errore: " + error.message); setExcSaving(false); return; }
    } else {
      const { error } = await supabase.from("coverage_exceptions")
        .upsert({ exception_date: excDate, shift_type_id: excTypeId, required_count: excCount, notes: excNotes || null },
          { onConflict: "exception_date,shift_type_id" });
      if (error) { alert("Errore: " + error.message); setExcSaving(false); return; }
    }
    resetExcForm();
    setExcSaving(false);
    load();
  }

  async function deleteException(id: string) {
    if (!confirm("Eliminare questa eccezione?")) return;
    await supabase.from("coverage_exceptions").delete().eq("id", id);
    load();
  }

  function startEditExc(exc: CoverageExceptionRow) {
    setEditingExc(exc);
    setExcDate(exc.exception_date);
    setExcTypeId(exc.shift_type_id);
    setExcCount(exc.required_count);
    setExcNotes(exc.notes ?? "");
  }

  const typeNameMap = new Map(types.map(t => [t.id, t.name]));

  const fmtDate = (d: string) => {
    const dt = new Date(`${d}T00:00:00`);
    return dt.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short" });
  };

  return (
    <div className="section">
      <div className="section-head">
        <h2>Copertura settimanale</h2>
        <Link href="/turni" className="muted" style={{ fontWeight: 600 }}>← Torna ai turni</Link>
      </div>
      <div className="section-body">
        <p className="muted" style={{ marginBottom: 16 }}>Imposta quante persone servono per ogni fascia, in ogni giorno della settimana. Il generatore userà questi numeri.</p>
        {loading ? <div className="empty">Caricamento…</div> : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl" style={{ minWidth: 540 }}>
              <thead><tr><th>Fascia</th>{WEEKDAYS.map((d) => <th key={d} style={{ textAlign: "center" }}>{d}</th>)}</tr></thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t.id}>
                    <td style={{ minWidth: 200 }}>
                      {editingType === t.id ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <input value={editName} onChange={e => setEditName(e.target.value)}
                            style={{ fontFamily: "inherit", fontSize: 14, padding: "6px 10px", border: "1px solid var(--line)", borderRadius: 8, width: "100%" }} />
                          <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                            <TimeSelect h={editSH} m={editSM} onH={setEditSH} onM={setEditSM} />
                            <span className="muted">–</span>
                            <TimeSelect h={editEH} m={editEM} onH={setEditEH} onM={setEditEM} />
                          </div>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button className="btn btn-primary" style={{ fontSize: 12, padding: "5px 12px" }} onClick={saveEditType}>Salva</button>
                            <button className="btn btn-secondary" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => setEditingType(null)}>Annulla</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <strong>{t.name}</strong>
                            <div className="muted">{t.start_time.slice(0, 5)}–{t.end_time.slice(0, 5)}</div>
                          </div>
                          <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                            <button onClick={() => startEditType(t)} title="Modifica"
                              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--ink)", opacity: 0.6 }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                            </button>
                            {types.length > 2 && (
                              <button onClick={() => deleteType(t.id)} title="Elimina"
                                style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#9E3B2E", opacity: 0.7 }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                    {WEEKDAYS.map((_, i) => {
                      const wd = i + 1;
                      return (
                        <td key={wd} style={{ textAlign: "center" }}>
                          <input type="number" min="0" max="9" value={get(wd, t.id)} onChange={(e) => set(wd, t.id, Number(e.target.value))}
                            style={{ width: 52, textAlign: "center", fontFamily: "inherit", fontSize: 14, padding: "7px 6px", border: "1px solid var(--line)", borderRadius: 8 }} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={salva} disabled={loading}>{saved ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }}><path d="M20 6L9 17l-5-5" /></svg>Salvato</> : "Salva copertura"}</button>
          {!showNewType && (
            <button className="btn btn-ghost" onClick={() => setShowNewType(true)}>+ Aggiungi fascia oraria</button>
          )}
        </div>

        {showNewType && (
          <div style={{ marginTop: 16, padding: 16, border: "1px dashed var(--line)", borderRadius: 10, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 140px" }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Nome fascia</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Es. Notte"
                style={{ width: "100%", fontFamily: "inherit", fontSize: 14, padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 8 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Ora inizio</label>
              <TimeSelect h={newSH} m={newSM} onH={setNewSH} onM={setNewSM} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Ora fine</label>
              <TimeSelect h={newEH} m={newEM} onH={setNewEH} onM={setNewEM} />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-primary" onClick={addNewType} disabled={!newName.trim()}>Aggiungi</button>
              <button className="btn btn-secondary" onClick={() => setShowNewType(false)}>Annulla</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Eccezioni di copertura ── */}
      <div className="section-head" style={{ marginTop: 32 }}>
        <h2>Eccezioni giornaliere</h2>
      </div>
      <div className="section-body">
        <p className="muted" style={{ marginBottom: 16 }}>
          Modifica il numero di persone per giorni specifici. Il valore inserito <strong>sostituisce</strong> la copertura base per quella data e fascia.
          <br />Esempio: se la base è 1 persona e serve rinforzo, imposta 2 o 3.
        </p>

        {/* Add/Edit form */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginBottom: 20 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Data</label>
            <DatePickerIT value={excDate} onChange={setExcDate} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Fascia</label>
            <select value={excTypeId} onChange={e => setExcTypeId(e.target.value)}
              style={{ fontFamily: "inherit", fontSize: 14, padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 8 }}>
              <option value="">Seleziona…</option>
              {types.map(t => <option key={t.id} value={t.id}>{t.name} ({t.start_time.slice(0, 5)}–{t.end_time.slice(0, 5)})</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
              Persone necessarie
              {excDate && excTypeId && (
                <span style={{ fontWeight: 400, color: "var(--ink-soft)", marginLeft: 6 }}>(base: {excBaseCount})</span>
              )}
            </label>
            <input type="number" min="0" max="9" value={excCount} onChange={e => setExcCount(Number(e.target.value))}
              style={{ width: 60, textAlign: "center", fontFamily: "inherit", fontSize: 14, padding: "7px 6px", border: "1px solid var(--line)", borderRadius: 8 }} />
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Note</label>
            <input type="text" value={excNotes} onChange={e => setExcNotes(e.target.value)} placeholder="Es. evento speciale"
              style={{ width: "100%", fontFamily: "inherit", fontSize: 14, padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 8 }} />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-primary" onClick={saveException} disabled={excSaving || !excDate || !excTypeId}>
              {editingExc ? "Aggiorna" : "Aggiungi"}
            </button>
            {editingExc && (
              <button className="btn btn-secondary" onClick={resetExcForm}>Annulla</button>
            )}
          </div>
        </div>

        {/* Exceptions list */}
        {exceptions.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>Nessuna eccezione impostata.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl" style={{ minWidth: 480 }}>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Fascia</th>
                  <th style={{ textAlign: "center" }}>Base</th>
                  <th style={{ textAlign: "center" }}>Eccezione</th>
                  <th>Note</th>
                  <th style={{ width: 90 }}></th>
                </tr>
              </thead>
              <tbody>
                {exceptions.map(exc => {
                  const base = getBaseCount(exc.exception_date, exc.shift_type_id);
                  const diff = exc.required_count - base;
                  return (
                    <tr key={exc.id}>
                      <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{fmtDate(exc.exception_date)}</td>
                      <td>{typeNameMap.get(exc.shift_type_id) ?? "—"}</td>
                      <td className="tabular" style={{ textAlign: "center", color: "var(--ink-soft)" }}>{base}</td>
                      <td style={{ textAlign: "center" }}>
                        <span style={{
                          display: "inline-block", padding: "2px 10px", borderRadius: 12, fontWeight: 700, fontSize: 13,
                          background: exc.required_count === 0 ? "rgba(158,59,46,.1)" : diff > 0 ? "rgba(45,90,61,.1)" : "rgba(191,167,98,.15)",
                          color: exc.required_count === 0 ? "#9E3B2E" : diff > 0 ? "#2D5A3D" : "#8B7730",
                        }}>
                          {exc.required_count}
                          {diff !== 0 && <span style={{ fontSize: 11, marginLeft: 4 }}>({diff > 0 ? "+" : ""}{diff})</span>}
                        </span>
                      </td>
                      <td className="muted" style={{ fontSize: 13 }}>{exc.notes ?? "—"}</td>
                      <td>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button onClick={() => startEditExc(exc)} title="Modifica"
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--ink)", opacity: 0.6 }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                          </button>
                          <button onClick={() => deleteException(exc.id)} title="Elimina"
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#9E3B2E", opacity: 0.7 }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
