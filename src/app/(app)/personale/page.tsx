"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { WEEKDAYS, fmtDayShort, type StaffRow, type ShiftTypeRow, type AvailabilityRow, type AbsenceRow } from "@/lib/turni";

const EMPTY: Omit<StaffRow, "id"> = {
  name: "", type: "dipendente", hours_per_week: 40, days_per_week: 5, role: "", active: true, notes: "",
};

const ABSENCE_TYPES = [
  { value: "ferie", label: "Ferie" },
  { value: "malattia", label: "Malattia" },
  { value: "permesso", label: "Permesso" },
] as const;

export default function PersonalePage() {
  const supabase = createClient();
  const [list, setList] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [form, setForm] = useState<Omit<StaffRow, "id">>(EMPTY);

  const [shiftTypes, setShiftTypes] = useState<ShiftTypeRow[]>([]);
  const [unavailKeys, setUnavailKeys] = useState<Set<string>>(new Set());

  const [absences, setAbsences] = useState<AbsenceRow[]>([]);
  const [absForm, setAbsForm] = useState({ staff_id: "", type: "ferie" as AbsenceRow["type"], absent_date: "", end_date: "", notes: "" });

  async function load() {
    setLoading(true);
    const [{ data: staffData }, { data: typesData }, { data: absData }] = await Promise.all([
      supabase.from("staff").select("*").order("name"),
      supabase.from("shift_types").select("*").order("sort"),
      supabase.from("absences").select("*").order("absent_date", { ascending: false }),
    ]);
    setList((staffData ?? []) as StaffRow[]);
    setShiftTypes((typesData ?? []) as ShiftTypeRow[]);
    setAbsences((absData ?? []) as AbsenceRow[]);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function loadAvailability(staffId: string) {
    const { data } = await supabase.from("staff_availability").select("*").eq("staff_id", staffId).eq("available", false);
    const rows = (data ?? []) as AvailabilityRow[];
    setUnavailKeys(new Set(rows.map(r => `${r.weekday}|${r.shift_type_id}`)));
  }

  function openNew() { setEditing(null); setForm(EMPTY); setUnavailKeys(new Set()); }
  function openEdit(s: StaffRow) {
    setEditing(s);
    setForm({ name: s.name, type: s.type, hours_per_week: s.hours_per_week, days_per_week: s.days_per_week, role: s.role ?? "", active: s.active, notes: s.notes ?? "" });
    loadAvailability(s.id);
  }

  function toggleAvail(weekday: number, shiftTypeId: string) {
    const key = `${weekday}|${shiftTypeId}`;
    setUnavailKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    if (!form.name.trim()) return alert("Inserisci il nome.");
    const payload = { ...form, name: form.name.trim() };
    let staffId: string;
    if (editing) {
      await supabase.from("staff").update(payload).eq("id", editing.id);
      staffId = editing.id;
    } else {
      const { data } = await supabase.from("staff").insert(payload).select("id").single();
      if (!data) return;
      staffId = data.id;
    }

    await supabase.from("staff_availability").delete().eq("staff_id", staffId);
    const availRows = Array.from(unavailKeys).map(key => {
      const [wd, stId] = key.split("|");
      return { staff_id: staffId, weekday: Number(wd), shift_type_id: stId, available: false };
    });
    if (availRows.length > 0) {
      await supabase.from("staff_availability").insert(availRows);
    }

    setForm(EMPTY);
    setEditing(null);
    setUnavailKeys(new Set());
    load();
  }

  async function remove(id: string) {
    if (!confirm("Eliminare questa persona? I turni collegati resteranno come scoperti.")) return;
    await supabase.from("staff").delete().eq("id", id);
    load();
  }

  async function saveAbsence() {
    if (!absForm.staff_id || !absForm.absent_date) return alert("Seleziona persona e data inizio.");
    const payload: Record<string, unknown> = {
      staff_id: absForm.staff_id,
      type: absForm.type,
      absent_date: absForm.absent_date,
      end_date: absForm.end_date || null,
      notes: absForm.notes || null,
    };
    const { error } = await supabase.from("absences").insert(payload);
    if (error) return alert("Errore: " + error.message);
    setAbsForm({ staff_id: "", type: "ferie", absent_date: "", end_date: "", notes: "" });
    load();
  }

  async function removeAbsence(id: string) {
    if (!confirm("Eliminare questa assenza?")) return;
    await supabase.from("absences").delete().eq("id", id);
    load();
  }

  const staffNameById = (id: string) => list.find(s => s.id === id)?.name ?? "?";

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <h1 className="serif" style={{ fontSize: 24, fontWeight: 500 }}>Personale</h1>
      </div>

      <div className="staff-layout">
        {/* ── LEFT: Form ── */}
        <div>
          <div className="section" style={{ position: "sticky", top: 24 }}>
            <div className="section-head">
              <h2>{editing ? `Modifica: ${editing.name}` : "Aggiungi persona"}</h2>
              {editing && (
                <button className="btn-ghost" style={{ padding: "7px 14px", borderRadius: 9, fontSize: 13 }} onClick={openNew}>
                  + Nuova
                </button>
              )}
            </div>
            <div className="section-body">
              <div className="grid2">
                <div className="field">
                  <label>Nome</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Es. Anna Rossi" />
                </div>
                <div className="field">
                  <label>Ruolo (opzionale)</label>
                  <input value={form.role ?? ""} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Reception, pulizie…" />
                </div>
              </div>

              {/* Contract type pills */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-soft)", display: "block", marginBottom: 6 }}>
                  Tipo contratto
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className={`contract-pill${form.type === "dipendente" ? " active" : ""}`}
                    onClick={() => setForm({ ...form, type: "dipendente" })}>
                    Dipendente
                  </button>
                  <button type="button" className={`contract-pill${form.type === "a_chiamata" ? " active" : ""}`}
                    onClick={() => setForm({ ...form, type: "a_chiamata" })}>
                    A chiamata
                  </button>
                </div>
              </div>

              <div className="grid2">
                <div className="field">
                  <label>Ore / settimana</label>
                  <input type="number" min="0" step="1" value={form.hours_per_week}
                    onChange={(e) => setForm({ ...form, hours_per_week: Number(e.target.value) })} />
                  <span className="muted" style={{ fontSize: 11 }}>0 = nessun limite</span>
                </div>
                <div className="field">
                  <label>Giorni / settimana</label>
                  <input type="number" min="0" max="7" step="1" value={form.days_per_week}
                    onChange={(e) => setForm({ ...form, days_per_week: Number(e.target.value) })} />
                  <span className="muted" style={{ fontSize: 11 }}>0 = nessun limite</span>
                </div>
              </div>

              {/* Active toggle */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-soft)", display: "block", marginBottom: 8 }}>
                  Stato
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button type="button" className={`toggle-switch${form.active ? " on" : ""}`}
                    onClick={() => setForm({ ...form, active: !form.active })} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    {form.active ? "Attivo — disponibile per turni" : "Non attivo — escluso dai turni"}
                  </span>
                </div>
              </div>

              {/* Availability grid (when editing or always) */}
              {shiftTypes.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-soft)", display: "block", marginBottom: 8 }}>
                    Disponibilità settimanale
                  </label>
                  <div style={{ overflowX: "auto" }}>
                    <table className="tbl" style={{ fontSize: 12.5 }}>
                      <thead>
                        <tr>
                          <th style={{ padding: "8px 10px" }}>Fascia</th>
                          {WEEKDAYS.map((d, i) => <th key={i} style={{ textAlign: "center", padding: "8px 6px", minWidth: 42 }}>{d}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {shiftTypes.map(st => (
                          <tr key={st.id}>
                            <td style={{ fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>{st.name}</td>
                            {WEEKDAYS.map((_, i) => {
                              const wd = i + 1;
                              const key = `${wd}|${st.id}`;
                              const available = !unavailKeys.has(key);
                              return (
                                <td key={i} style={{ textAlign: "center", padding: 6 }}>
                                  <button type="button" className={`avail-cell${available ? " on" : ""}`}
                                    onClick={() => toggleAvail(wd, st.id)}>
                                    {available ? "✓" : ""}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
                    Clicca per attivare/disattivare la disponibilità su ogni fascia.
                  </div>
                </div>
              )}

              <button className="btn btn-primary" style={{ width: "100%", padding: "14px 22px", fontSize: 15 }} onClick={save}>
                {editing ? "Salva modifiche" : "Aggiungi persona"}
              </button>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Staff cards ── */}
        <div>
          <div className="section">
            <div className="section-head">
              <h2>Team ({list.length})</h2>
            </div>
            <div className="section-body">
              {loading ? (
                <div className="empty">Caricamento…</div>
              ) : list.length === 0 ? (
                <div className="empty">
                  <div className="serif" style={{ fontSize: 18, marginBottom: 6 }}>Nessuna persona</div>
                  <div>Aggiungi il primo membro dello staff dal form a sinistra.</div>
                </div>
              ) : (
                <div className="staff-grid">
                  {list.map(s => (
                    <div className="staff-card" key={s.id} style={{ opacity: s.active ? 1 : 0.55 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>{s.name}</div>
                        <span className={`badge ${s.type === "dipendente" ? "badge-dip" : "badge-call"}`}>
                          {s.type === "dipendente" ? "Dipendente" : "A chiamata"}
                        </span>
                      </div>
                      {s.role && <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>{s.role}</div>}
                      <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
                        {s.hours_per_week || "—"}h/sett · {s.days_per_week || "—"} giorni
                        {!s.active && <span style={{ color: "var(--danger)", fontWeight: 600 }}> · Non attivo</span>}
                      </div>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12 }}
                          onClick={() => openEdit(s)}>Modifica</button>
                        <button className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, color: "var(--danger)" }}
                          onClick={() => remove(s.id)}>Elimina</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── FULL WIDTH: Absences ── */}
      <div className="section">
        <div className="section-head"><h2>Gestione assenze</h2></div>
        <div className="section-body">
          <div className="grid2">
            <div className="field">
              <label>Persona</label>
              <select value={absForm.staff_id} onChange={(e) => setAbsForm({ ...absForm, staff_id: e.target.value })}>
                <option value="">Seleziona…</option>
                {list.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-soft)", display: "block", marginBottom: 6 }}>Tipo</label>
              <div style={{ display: "flex", gap: 8 }}>
                {ABSENCE_TYPES.map(t => (
                  <button key={t.value} type="button"
                    className={`absence-pill ${t.value}${absForm.type === t.value ? " active" : ""}`}
                    onClick={() => setAbsForm({ ...absForm, type: t.value })}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid2">
            <div className="field">
              <label>Data inizio</label>
              <input type="date" value={absForm.absent_date} onChange={(e) => setAbsForm({ ...absForm, absent_date: e.target.value })} />
            </div>
            <div className="field">
              <label>Data fine <span className="muted">(vuoto = un giorno)</span></label>
              <input type="date" value={absForm.end_date} onChange={(e) => setAbsForm({ ...absForm, end_date: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>Note (opzionale)</label>
            <input value={absForm.notes} onChange={(e) => setAbsForm({ ...absForm, notes: e.target.value })} placeholder="Es. visita medica, ferie estive…" />
          </div>
          <button className="btn btn-primary" onClick={saveAbsence}>Aggiungi assenza</button>
        </div>
      </div>

      {absences.length > 0 && (
        <div className="section">
          <div className="section-head"><h2>Storico assenze</h2></div>
          <div className="section-body" style={{ padding: 0 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Tipo</th>
                  <th>Dal</th>
                  <th>Al</th>
                  <th className="hide-sm">Note</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {absences.map(a => (
                  <tr key={a.id}>
                    <td><strong>{staffNameById(a.staff_id)}</strong></td>
                    <td>
                      <span className={`badge badge-${a.type}`}>
                        {ABSENCE_TYPES.find(t => t.value === a.type)?.label ?? a.type}
                      </span>
                    </td>
                    <td>{fmtDayShort(a.absent_date)}</td>
                    <td>{a.end_date ? fmtDayShort(a.end_date) : "—"}</td>
                    <td className="hide-sm muted">{a.notes || "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12 }}
                        onClick={() => removeAbsence(a.id)}>Elimina</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
