"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { WEEKDAYS, type ShiftTypeRow, type CoverageExceptionRow } from "@/lib/turni";
import DatePickerIT from "@/components/ui/DatePickerIT";

export default function CoperturaPage() {
  const supabase = createClient();
  const [types, setTypes] = useState<ShiftTypeRow[]>([]);
  const [matrix, setMatrix] = useState<Record<string, number>>({}); // `${weekday}|${typeId}` -> count
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

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

  async function salva() {
    const rows: { weekday: number; shift_type_id: string; count: number }[] = [];
    for (let wd = 1; wd <= 7; wd++) for (const t of types) rows.push({ weekday: wd, shift_type_id: t.id, count: get(wd, t.id) });
    const { error } = await supabase.from("coverage_template").upsert(rows, { onConflict: "weekday,shift_type_id" });
    if (error) return alert("Errore: " + error.message);
    setSaved(true);
  }

  function resetExcForm() {
    setExcDate(""); setExcTypeId(""); setExcCount(0); setExcNotes(""); setEditingExc(null);
  }

  async function saveException() {
    if (!excDate || !excTypeId) return;
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
                    <td><strong>{t.name}</strong><div className="muted">{t.start_time.slice(0, 5)}–{t.end_time.slice(0, 5)}</div></td>
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
        <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={salva} disabled={loading}>{saved ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }}><path d="M20 6L9 17l-5-5" /></svg>Salvato</> : "Salva copertura"}</button>
      </div>

      {/* ── Eccezioni di copertura ── */}
      <div className="section-head" style={{ marginTop: 32 }}>
        <h2>Eccezioni giornaliere</h2>
      </div>
      <div className="section-body">
        <p className="muted" style={{ marginBottom: 16 }}>
          Modifica la copertura per giorni specifici. Le eccezioni sovrascrivono la copertura base solo per la data indicata.
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
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Persone</label>
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
                  <th style={{ textAlign: "center" }}>Persone</th>
                  <th>Note</th>
                  <th style={{ width: 90 }}></th>
                </tr>
              </thead>
              <tbody>
                {exceptions.map(exc => (
                  <tr key={exc.id}>
                    <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{fmtDate(exc.exception_date)}</td>
                    <td>{typeNameMap.get(exc.shift_type_id) ?? "—"}</td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{
                        display: "inline-block", padding: "2px 10px", borderRadius: 12, fontWeight: 700, fontSize: 13,
                        background: exc.required_count === 0 ? "rgba(158,59,46,.1)" : "rgba(191,167,98,.15)",
                        color: exc.required_count === 0 ? "#9E3B2E" : "#8B7730",
                      }}>
                        {exc.required_count}
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
