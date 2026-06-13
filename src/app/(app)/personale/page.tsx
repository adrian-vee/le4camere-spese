"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { WEEKDAYS, fmtDayShort, type StaffRow, type ShiftTypeRow, type AvailabilityRow, type AbsenceRow, type LeaveRow } from "@/lib/turni";
import { fmtDate } from "@/lib/format";
import DatePickerIT from "@/components/ui/DatePickerIT";

type StaffDoc = {
  id: string; staff_id: string; doc_type: string; title: string;
  file_path: string | null; expiry_date: string | null; notes: string | null;
  created_at: string;
};

const WEEKDAYS_SHORT = ["L", "M", "M", "G", "V", "S", "D"];

const EMPTY: Omit<StaffRow, "id"> = {
  name: "", type: "dipendente", hours_per_week: 40, days_per_week: 5, role: "", active: true, notes: "", profile_id: null,
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
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [isMobile, setIsMobile] = useState(false);

  const DOC_TYPES = ["Contratto", "Documento identità", "Codice fiscale", "Permesso soggiorno", "Certificazione", "Attestato sicurezza", "UNILAV", "Busta paga", "Altro"];
  const [staffDocs, setStaffDocs] = useState<StaffDoc[]>([]);
  const [docStaffId, setDocStaffId] = useState("");
  const [docForm, setDocForm] = useState({ doc_type: DOC_TYPES[0], title: "", expiry_date: "", notes: "" });
  const [docFile, setDocFile] = useState<File | null>(null);
  const docFileRef = useRef<HTMLInputElement>(null);
  const [docFilter, setDocFilter] = useState("");

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  async function load() {
    setLoading(true);
    const curYear = new Date().getFullYear();
    const yearStart = `${curYear}-01-01`;
    const yearEnd = `${curYear}-12-31`;
    const [{ data: staffData }, { data: typesData }, { data: absData }, { data: leavesData }, { data: docsData }] = await Promise.all([
      supabase.from("staff").select("*").order("name"),
      supabase.from("shift_types").select("*").order("sort"),
      supabase.from("absences").select("*").order("absent_date", { ascending: false }),
      supabase.from("staff_leaves").select("*").gte("date", yearStart).lte("date", yearEnd).order("date", { ascending: false }),
      supabase.from("staff_documents").select("*").order("created_at", { ascending: false }),
    ]);
    setList((staffData ?? []) as StaffRow[]);
    setShiftTypes((typesData ?? []) as ShiftTypeRow[]);
    setAbsences((absData ?? []) as AbsenceRow[]);
    setLeaves((leavesData ?? []) as LeaveRow[]);
    setStaffDocs((docsData ?? []) as StaffDoc[]);
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
    setForm({ name: s.name, type: s.type, hours_per_week: s.hours_per_week, days_per_week: s.days_per_week, role: s.role ?? "", active: s.active, notes: s.notes ?? "", profile_id: s.profile_id });
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

  async function saveDoc() {
    if (!docStaffId) return alert("Seleziona una persona.");
    if (!docForm.title.trim()) return alert("Inserisci il titolo del documento.");

    const { data: { user } } = await supabase.auth.getUser();

    let filePath: string | null = null;
    if (docFile) {
      const ext = docFile.name.split(".").pop()?.toLowerCase() ?? "pdf";
      const path = `personale/${docStaffId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("documenti").upload(path, docFile);
      if (upErr) return alert("Errore upload: " + upErr.message);
      const { data: { publicUrl } } = supabase.storage.from("documenti").getPublicUrl(path);
      filePath = publicUrl;
    }

    const { error } = await supabase.from("staff_documents").insert({
      staff_id: docStaffId,
      doc_type: docForm.doc_type,
      title: docForm.title.trim(),
      file_path: filePath,
      expiry_date: docForm.expiry_date || null,
      notes: docForm.notes || null,
      uploaded_by: user?.id ?? null,
    });
    if (error) return alert("Errore: " + error.message);

    setDocForm({ doc_type: DOC_TYPES[0], title: "", expiry_date: "", notes: "" });
    setDocFile(null);
    if (docFileRef.current) docFileRef.current.value = "";
    load();
  }

  async function deleteDoc(id: string) {
    if (!confirm("Eliminare questo documento?")) return;
    await supabase.from("staff_documents").delete().eq("id", id);
    load();
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const filteredDocs = staffDocs.filter(d => !docFilter || d.staff_id === docFilter);
  const expiringDocs = staffDocs.filter(d => d.expiry_date && d.expiry_date <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <h1 className="serif" style={{ fontSize: 24, fontWeight: 500 }}>Personale</h1>
      </div>

      <div className="staff-layout">
        {/* ── LEFT: Form ── */}
        <div>
          <div className="section" style={isMobile ? undefined : { position: "sticky", top: 24 }}>
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
                  <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                    <table className="tbl" style={{ fontSize: 12.5, minWidth: isMobile ? 0 : undefined }}>
                      <thead>
                        <tr>
                          <th style={{ padding: "8px 6px" }}>{isMobile ? "" : "Fascia"}</th>
                          {(isMobile ? WEEKDAYS_SHORT : WEEKDAYS).map((d, i) => <th key={i} style={{ textAlign: "center", padding: isMobile ? "6px 2px" : "8px 6px", minWidth: isMobile ? 32 : 42 }}>{d}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {shiftTypes.map(st => (
                          <tr key={st.id}>
                            <td style={{ fontWeight: 600, fontSize: isMobile ? 11 : 12, whiteSpace: "nowrap", padding: isMobile ? "6px 4px" : undefined }}>{isMobile ? st.name.slice(0, 4) : st.name}</td>
                            {WEEKDAYS.map((_, i) => {
                              const wd = i + 1;
                              const key = `${wd}|${st.id}`;
                              const available = !unavailKeys.has(key);
                              return (
                                <td key={i} style={{ textAlign: "center", padding: isMobile ? 3 : 6 }}>
                                  <button type="button" className={`avail-cell${available ? " on" : ""}`}
                                    onClick={() => toggleAvail(wd, st.id)}>
                                    {available && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
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
              <DatePickerIT value={absForm.absent_date} onChange={v => setAbsForm({ ...absForm, absent_date: v })} />
            </div>
            <div className="field">
              <label>Data fine <span className="muted">(vuoto = un giorno)</span></label>
              <DatePickerIT value={absForm.end_date} onChange={v => setAbsForm({ ...absForm, end_date: v })} />
            </div>
          </div>
          <div className="field">
            <label>Note (opzionale)</label>
            <input value={absForm.notes} onChange={(e) => setAbsForm({ ...absForm, notes: e.target.value })} placeholder="Es. visita medica, ferie estive…" />
          </div>
          <button className="btn btn-primary" onClick={saveAbsence}>Aggiungi assenza</button>
        </div>
      </div>

      {/* ── Annual Leave Summary ── */}
      {leaves.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2>Riepilogo permessi {new Date().getFullYear()}</h2>
            <span className="muted">{leaves.length} totali</span>
          </div>
          <div className="section-body" style={{ padding: 0 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th style={{ textAlign: "center" }}>Permessi</th>
                  <th style={{ textAlign: "center" }}>Malattia</th>
                  <th style={{ textAlign: "center" }}>Ferie</th>
                  <th style={{ textAlign: "center" }}>Altro</th>
                  <th style={{ textAlign: "center" }}>Totale</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const byStaff: Record<string, { name: string; permesso: number; malattia: number; ferie: number; altro: number }> = {};
                  for (const l of leaves) {
                    if (l.status === "rifiutato") continue;
                    if (!byStaff[l.staff_id]) byStaff[l.staff_id] = { name: l.staff_name, permesso: 0, malattia: 0, ferie: 0, altro: 0 };
                    byStaff[l.staff_id][l.type] = (byStaff[l.staff_id][l.type] ?? 0) + 1;
                  }
                  return Object.entries(byStaff).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([id, s]) => {
                    const total = s.permesso + s.malattia + s.ferie + s.altro;
                    return (
                      <tr key={id}>
                        <td><strong>{s.name}</strong></td>
                        <td className="tabular" style={{ textAlign: "center", fontWeight: 600, color: "#7B61A6" }}>{s.permesso || "—"}</td>
                        <td className="tabular" style={{ textAlign: "center", fontWeight: 600, color: "#9E3B2E" }}>{s.malattia || "—"}</td>
                        <td className="tabular" style={{ textAlign: "center", fontWeight: 600, color: "#3B6FA0" }}>{s.ferie || "—"}</td>
                        <td className="tabular" style={{ textAlign: "center", fontWeight: 600 }}>{s.altro || "—"}</td>
                        <td className="tabular" style={{ textAlign: "center", fontWeight: 700 }}>{total}</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── FASCICOLO DIPENDENTE ── */}
      <div className="section">
        <div className="section-head">
          <h2>Fascicolo dipendente</h2>
          {expiringDocs.length > 0 && (
            <span className="badge" style={{ background: "#9E3B2E", color: "#FAF9F5" }}>{expiringDocs.length} in scadenza</span>
          )}
        </div>
        <div className="section-body">
          <div className="grid2">
            <div className="field">
              <label>Persona</label>
              <select value={docStaffId} onChange={e => setDocStaffId(e.target.value)}>
                <option value="">Seleziona...</option>
                {list.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Tipo documento</label>
              <select value={docForm.doc_type} onChange={e => setDocForm({ ...docForm, doc_type: e.target.value })}>
                {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="grid2">
            <div className="field">
              <label>Titolo</label>
              <input value={docForm.title} onChange={e => setDocForm({ ...docForm, title: e.target.value })} placeholder="Es. Contratto tempo indeterminato" />
            </div>
            <div className="field">
              <label>Scadenza (opzionale)</label>
              <DatePickerIT value={docForm.expiry_date} onChange={v => setDocForm({ ...docForm, expiry_date: v })} />
            </div>
          </div>
          <div className="grid2">
            <div className="field">
              <label>File (opzionale)</label>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" ref={docFileRef} onChange={e => setDocFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="field">
              <label>Note (opzionale)</label>
              <input value={docForm.notes} onChange={e => setDocForm({ ...docForm, notes: e.target.value })} placeholder="Note aggiuntive..." />
            </div>
          </div>
          <button className="btn btn-primary" onClick={saveDoc}>Carica documento</button>
        </div>
      </div>

      {/* Docs list */}
      {staffDocs.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2>Documenti caricati ({filteredDocs.length})</h2>
            <select value={docFilter} onChange={e => setDocFilter(e.target.value)} style={{ fontSize: 13, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line)" }}>
              <option value="">Tutti</option>
              {list.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="section-body" style={{ padding: 0, overflowX: "auto" }}>
            <table className="tbl">
              <thead><tr>
                <th>Persona</th>
                <th>Tipo</th>
                <th>Titolo</th>
                <th className="hide-sm">Scadenza</th>
                <th className="hide-sm">Note</th>
                <th></th>
              </tr></thead>
              <tbody>
                {filteredDocs.map(d => {
                  const isExpired = d.expiry_date && d.expiry_date < todayStr;
                  const isExpiring = d.expiry_date && !isExpired && d.expiry_date <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
                  return (
                    <tr key={d.id} style={isExpired ? { background: "rgba(158,59,46,.06)" } : undefined}>
                      <td><strong>{staffNameById(d.staff_id)}</strong></td>
                      <td><span className="badge">{d.doc_type}</span></td>
                      <td>
                        {d.file_path ? (
                          <a href={d.file_path} target="_blank" rel="noopener noreferrer" style={{ color: "#4F7B8C", fontWeight: 600, textDecoration: "none" }}>{d.title}</a>
                        ) : d.title}
                      </td>
                      <td className="hide-sm">
                        {d.expiry_date ? (
                          <span style={{ color: isExpired ? "#9E3B2E" : isExpiring ? "#C77B4A" : undefined, fontWeight: isExpired || isExpiring ? 700 : 400 }}>
                            {fmtDate(d.expiry_date + "T00:00:00")}
                            {isExpired && " (scaduto)"}
                            {isExpiring && " (in scadenza)"}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="hide-sm muted">{d.notes || "—"}</td>
                      <td style={{ textAlign: "right" }}>
                        <button className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, color: "var(--danger)" }} onClick={() => deleteDoc(d.id)}>Elimina</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
