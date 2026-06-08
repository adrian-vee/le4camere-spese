"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { StaffRow } from "@/lib/turni";

const EMPTY: Omit<StaffRow, "id"> = {
  name: "", type: "dipendente", hours_per_week: 40, days_per_week: 5, role: "", active: true, notes: "",
};

export default function PersonalePage() {
  const supabase = createClient();
  const [list, setList] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [form, setForm] = useState<Omit<StaffRow, "id">>(EMPTY);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("staff").select("*").order("name");
    setList((data ?? []) as StaffRow[]);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  function openNew() { setEditing(null); setForm(EMPTY); }
  function openEdit(s: StaffRow) {
    setEditing(s);
    setForm({ name: s.name, type: s.type, hours_per_week: s.hours_per_week, days_per_week: s.days_per_week, role: s.role ?? "", active: s.active, notes: s.notes ?? "" });
  }

  async function save() {
    if (!form.name.trim()) return alert("Inserisci il nome.");
    const payload = { ...form, name: form.name.trim() };
    if (editing) await supabase.from("staff").update(payload).eq("id", editing.id);
    else await supabase.from("staff").insert(payload);
    setForm(EMPTY); setEditing(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Eliminare questa persona? I turni collegati resteranno come scoperti.")) return;
    await supabase.from("staff").delete().eq("id", id);
    load();
  }

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
    </>
  );
}
