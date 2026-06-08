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
      <div className="section">
        <div className="section-head"><h2>{editing ? "Modifica persona" : "Aggiungi al personale"}</h2>
          {editing && <button className="btn-ghost" style={{ padding: "8px 14px", borderRadius: 9 }} onClick={openNew}>+ Nuova</button>}
        </div>
        <div className="section-body">
          <div className="grid2">
            <div className="field"><label>Nome</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Es. Anna Rossi" /></div>
            <div className="field"><label>Ruolo (opzionale)</label>
              <input value={form.role ?? ""} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Reception, pulizie…" /></div>
          </div>
          <div className="grid2">
            <div className="field"><label>Tipo contratto</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as StaffRow["type"] })}>
                <option value="dipendente">Dipendente</option>
                <option value="a_chiamata">A chiamata</option>
              </select></div>
            <div className="field"><label>Ore / settimana <span className="muted">(0 = nessun limite)</span></label>
              <input type="number" min="0" step="1" value={form.hours_per_week} onChange={(e) => setForm({ ...form, hours_per_week: Number(e.target.value) })} /></div>
          </div>
          <div className="grid2">
            <div className="field"><label>Giorni / settimana <span className="muted">(0 = nessun limite)</span></label>
              <input type="number" min="0" max="7" step="1" value={form.days_per_week} onChange={(e) => setForm({ ...form, days_per_week: Number(e.target.value) })} /></div>
            <div className="field"><label>Attivo</label>
              <select value={form.active ? "1" : "0"} onChange={(e) => setForm({ ...form, active: e.target.value === "1" })}>
                <option value="1">Sì, disponibile per i turni</option>
                <option value="0">No, escluso dai turni</option>
              </select></div>
          </div>

          {shiftTypes.length > 0 && (
            <div style={{ marginTop: 16, marginBottom: 16 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-soft)", display: "block", marginBottom: 8 }}>Disponibilità settimanale</label>
              <div style={{ overflowX: "auto" }}>
                <table className="tbl" style={{ fontSize: 12.5 }}>
                  <thead>
                    <tr>
                      <th style={{ padding: "8px 10px" }}>Fascia</th>
                      {WEEKDAYS.map((d, i) => <th key={i} style={{ textAlign: "center", padding: "8px 6px" }}>{d}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {shiftTypes.map(st => (
                      <tr key={st.id}>
                        <td style={{ fontWeight: 600, fontSize: 12 }}>{st.name}</td>
                        {WEEKDAYS.map((_, i) => {
                          const wd = i + 1;
                          const key = `${wd}|${st.id}`;
                          const available = !unavailKeys.has(key);
                          return (
                            <td key={i} style={{ textAlign: "center", padding: "6px" }}>
                              <input type="checkbox" checked={available} onChange={() => toggleAvail(wd, st.id)}
                                style={{ width: 18, height: 18, cursor: "pointer", accentColor: "var(--ok)" }} />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="muted" style={{ marginTop: 4 }}>Deseleziona i turni in cui questa persona NON è disponibile.</div>
            </div>
          )}

          <button className="btn btn-primary" onClick={save}>{editing ? "Salva modifiche" : "Aggiungi"}</button>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>Personale ({list.length})</h2></div>
        <div className="section-body" style={{ padding: 0 }}>
          {loading ? <div className="empty">Caricamento…</div> : list.length === 0 ? (
            <div className="empty"><div className="serif">Nessuna persona</div><div>Aggiungi il primo membro dello staff qui sopra.</div></div>
          ) : (
            <table className="tbl">
              <thead><tr><th>Nome</th><th className="hide-sm">Contratto</th><th>Ore/gg</th><th></th></tr></thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} style={{ opacity: s.active ? 1 : 0.5 }}>
                    <td><strong>{s.name}</strong>{s.role && <div className="muted">{s.role}</div>}</td>
                    <td className="hide-sm"><span className="tag">{s.type === "dipendente" ? "Dipendente" : "A chiamata"}</span></td>
                    <td className="tabular">{s.hours_per_week || "—"}h / {s.days_per_week || "—"}gg</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="btn-ghost" style={{ padding: "6px 10px", borderRadius: 8, fontSize: 12, marginRight: 6 }} onClick={() => openEdit(s)}>Modifica</button>
                      <button className="btn-ghost" style={{ padding: "6px 10px", borderRadius: 8, fontSize: 12 }} onClick={() => remove(s.id)}>Elimina</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>Assenze (Ferie · Malattia · Permessi)</h2></div>
        <div className="section-body">
          <div className="grid2">
            <div className="field"><label>Persona</label>
              <select value={absForm.staff_id} onChange={(e) => setAbsForm({ ...absForm, staff_id: e.target.value })}>
                <option value="">Seleziona…</option>
                {list.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <div className="field"><label>Tipo</label>
              <select value={absForm.type} onChange={(e) => setAbsForm({ ...absForm, type: e.target.value as AbsenceRow["type"] })}>
                {ABSENCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select></div>
          </div>
          <div className="grid2">
            <div className="field"><label>Data inizio</label>
              <input type="date" value={absForm.absent_date} onChange={(e) => setAbsForm({ ...absForm, absent_date: e.target.value })} /></div>
            <div className="field"><label>Data fine <span className="muted">(vuoto = un giorno)</span></label>
              <input type="date" value={absForm.end_date} onChange={(e) => setAbsForm({ ...absForm, end_date: e.target.value })} /></div>
          </div>
          <div className="field"><label>Note (opzionale)</label>
            <input value={absForm.notes} onChange={(e) => setAbsForm({ ...absForm, notes: e.target.value })} placeholder="Es. visita medica, ferie estive…" /></div>
          <button className="btn btn-primary" onClick={saveAbsence}>Aggiungi assenza</button>
        </div>
      </div>

      {absences.length > 0 && (
        <div className="section">
          <div className="section-head"><h2>Storico assenze</h2></div>
          <div className="section-body" style={{ padding: 0 }}>
            <table className="tbl">
              <thead><tr><th>Persona</th><th>Tipo</th><th>Da</th><th>A</th><th className="hide-sm">Note</th><th></th></tr></thead>
              <tbody>
                {absences.map(a => (
                  <tr key={a.id}>
                    <td><strong>{staffNameById(a.staff_id)}</strong></td>
                    <td><span className="tag">{ABSENCE_TYPES.find(t => t.value === a.type)?.label ?? a.type}</span></td>
                    <td>{fmtDayShort(a.absent_date)}</td>
                    <td>{a.end_date ? fmtDayShort(a.end_date) : "—"}</td>
                    <td className="hide-sm muted">{a.notes || "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn-ghost" style={{ padding: "6px 10px", borderRadius: 8, fontSize: 12 }} onClick={() => removeAbsence(a.id)}>Elimina</button>
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
