"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { fmtDate } from "@/lib/format";

/* ── Types ── */
type Doc = {
  id: string;
  title: string;
  category: string;
  expiry_date: string | null;
  reminder_days: number;
  status: "attivo" | "rinnovato" | "archiviato";
  notes: string | null;
  file_path: string | null;
  created_at: string;
};

/* ── Category colours ── */
const DOC_CATEGORIES: Record<string, string> = {
  "Regolamento interno": "#1F3326",
  "Allergeni": "#C77B4A",
  "CIN / Codice identificativo": "#4F7B8C",
  "Certificazioni": "#5C7363",
  "Assicurazioni": "#9E3B2E",
  "Contratti": "#8A7355",
  "Permessi e licenze": "#7A6A8C",
  "HACCP": "#2D5A3D",
  "Sicurezza / Antincendio": "#A8552F",
  "Revisioni e manutenzioni": "#B68A3E",
  "Altro": "#6C6B5D",
};

const CATEGORY_KEYS = Object.keys(DOC_CATEGORIES);

/* ── Status badges ── */
const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  attivo: { bg: "#EAF3DE", color: "#27500A" },
  rinnovato: { bg: "#E6F1FB", color: "#0C447C" },
  archiviato: { bg: "var(--surface-2)", color: "var(--ink-soft)" },
};

/* ── Helpers ── */
const isoToday = () => new Date().toISOString().slice(0, 10);

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
}

function urgencyColor(daysLeft: number): string {
  if (daysLeft < 0) return "#9E3B2E";
  if (daysLeft < 30) return "#C77B4A";
  if (daysLeft <= 60) return "#B68A3E";
  return "#2D5A3D";
}

const emptyForm = {
  title: "",
  category: CATEGORY_KEYS[0],
  expiry_date: "",
  reminder_days: "30",
  notes: "",
  status: "attivo" as "attivo" | "rinnovato" | "archiviato",
};

export default function DocumentiPage() {
  const supabase = createClient();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "warn" | "error" } | null>(null);

  /* ── Modal state ── */
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const fileRef = useRef<HTMLInputElement>(null);

  /* ── Renew modal ── */
  const [renewId, setRenewId] = useState<string | null>(null);
  const [renewDate, setRenewDate] = useState("");

  /* ── Filters ── */
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("Tutte");
  const [filterStatus, setFilterStatus] = useState("Tutti");

  function showToast(msg: string, type: "ok" | "warn" | "error" = "ok") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  /* ── Data loading ── */
  async function load() {
    const { data } = await supabase
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false });
    setDocs((data ?? []) as Doc[]);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  /* ── Save (create / update) ── */
  async function save() {
    if (!form.title.trim()) {
      showToast("Il titolo è obbligatorio", "warn");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        category: form.category,
        expiry_date: form.expiry_date || null,
        reminder_days: parseInt(form.reminder_days) || 30,
        notes: form.notes.trim() || null,
        status: form.status,
      };

      let docId = editId;

      if (editId) {
        const { error } = await supabase.from("documents").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("documents").insert(payload).select("id").single();
        if (error) throw error;
        docId = data.id;
      }

      /* File upload */
      const file = fileRef.current?.files?.[0];
      if (file && docId) {
        const path = `documents/${docId}/${file.name}`;
        const { error: upErr } = await supabase.storage.from("documenti").upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        await supabase.from("documents").update({ file_path: path }).eq("id", docId);
      }

      showToast(editId ? "Documento aggiornato" : "Documento creato");
      closeModal();
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Errore imprevisto", "error");
    } finally {
      setSaving(false);
    }
  }

  /* ── Delete ── */
  async function del(id: string) {
    if (!confirm("Eliminare questo documento?")) return;
    const doc = docs.find((d) => d.id === id);
    if (doc?.file_path) {
      await supabase.storage.from("documenti").remove([doc.file_path]);
    }
    await supabase.from("documents").delete().eq("id", id);
    setDocs((prev) => prev.filter((d) => d.id !== id));
    showToast("Documento eliminato");
  }

  /* ── Download ── */
  async function download(filePath: string) {
    const { data, error } = await supabase.storage.from("documenti").createSignedUrl(filePath, 60);
    if (error || !data?.signedUrl) {
      showToast("Errore nel download del file", "error");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  /* ── Renew ── */
  async function renew() {
    if (!renewId || !renewDate) {
      showToast("Seleziona una nuova data di scadenza", "warn");
      return;
    }
    const { error } = await supabase
      .from("documents")
      .update({ expiry_date: renewDate, status: "rinnovato" })
      .eq("id", renewId);
    if (error) {
      showToast("Errore nel rinnovo", "error");
      return;
    }
    showToast("Documento rinnovato");
    setRenewId(null);
    setRenewDate("");
    load();
  }

  /* ── CSV export ── */
  function exportCSV() {
    const header = "Titolo,Categoria,Scadenza,Stato,Note";
    const rows = docs.map((d) =>
      [
        `"${d.title.replace(/"/g, '""')}"`,
        `"${d.category}"`,
        d.expiry_date ? fmtDate(d.expiry_date) : "",
        d.status,
        `"${(d.notes ?? "").replace(/"/g, '""')}"`,
      ].join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `documenti_${isoToday()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("CSV esportato");
  }

  /* ── Modal helpers ── */
  function openNew() {
    setEditId(null);
    setForm({ ...emptyForm });
    if (fileRef.current) fileRef.current.value = "";
    setShowModal(true);
  }

  function openEdit(doc: Doc) {
    setEditId(doc.id);
    setForm({
      title: doc.title,
      category: doc.category,
      expiry_date: doc.expiry_date ?? "",
      reminder_days: String(doc.reminder_days),
      notes: doc.notes ?? "",
      status: doc.status,
    });
    if (fileRef.current) fileRef.current.value = "";
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditId(null);
    setForm({ ...emptyForm });
  }

  /* ── Derived data ── */
  const today = isoToday();
  const totalDocs = docs.length;
  const expiringSoon = docs.filter((d) => d.expiry_date && daysBetween(d.expiry_date, today) >= 0 && daysBetween(d.expiry_date, today) <= 30).length;
  const expired = docs.filter((d) => d.expiry_date && daysBetween(d.expiry_date, today) < 0).length;
  const activeCategories = new Set(docs.map((d) => d.category)).size;

  /* ── Scadenzario list ── */
  const scadenzario = docs
    .filter((d) => d.expiry_date !== null)
    .sort((a, b) => (a.expiry_date! > b.expiry_date! ? 1 : -1));

  /* ── Filtered archive ── */
  const filtered = docs.filter((d) => {
    if (search && !d.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCat !== "Tutte" && d.category !== filterCat) return false;
    if (filterStatus === "Attivi" && d.status !== "attivo") return false;
    if (filterStatus === "Archiviati" && d.status !== "archiviato") return false;
    if (filterStatus === "In scadenza" && !(d.expiry_date && daysBetween(d.expiry_date, today) >= 0 && daysBetween(d.expiry_date, today) <= 30)) return false;
    if (filterStatus === "Scaduti" && !(d.expiry_date && daysBetween(d.expiry_date, today) < 0)) return false;
    return true;
  });

  /* ── Render ── */
  return (
    <>
      {/* ── Header ── */}
      <div className="doc-header">
        <div className="doc-header-top">
          <div>
            <h1 className="doc-title serif">Documenti &amp; Scadenzario</h1>
            <p className="doc-subtitle">Gestisci documenti, scadenze e rinnovi</p>
          </div>
          <div className="doc-header-actions">
            <button className="btn btn-primary doc-btn-sm" onClick={openNew}>+ Nuovo documento</button>
            <button className="btn btn-ghost doc-btn-sm" onClick={exportCSV}>Esporta lista</button>
          </div>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="doc-kpi-row">
        <div className="doc-kpi" style={{ borderTopColor: "var(--ink)" }}>
          <div className="doc-kpi-num">{totalDocs}</div>
          <div className="doc-kpi-label">Documenti totali</div>
        </div>
        <div className="doc-kpi" style={{ borderTopColor: expiringSoon > 0 ? "#B68A3E" : "var(--ink)" }}>
          <div className="doc-kpi-num" style={{ color: expiringSoon > 0 ? "#B68A3E" : undefined }}>{expiringSoon}</div>
          <div className="doc-kpi-label">In scadenza</div>
        </div>
        <div className="doc-kpi" style={{ borderTopColor: expired > 0 ? "#9E3B2E" : "var(--ink)" }}>
          <div className="doc-kpi-num" style={{ color: expired > 0 ? "#9E3B2E" : undefined }}>{expired}</div>
          <div className="doc-kpi-label">Scaduti</div>
        </div>
        <div className="doc-kpi" style={{ borderTopColor: "var(--accent)" }}>
          <div className="doc-kpi-num">{activeCategories}</div>
          <div className="doc-kpi-label">Categorie attive</div>
        </div>
      </div>

      {/* ── Scadenzario ── */}
      <div className="section">
        <div className="section-head">
          <h2 className="serif">Scadenzario</h2>
        </div>
        <div className="section-body" style={{ padding: scadenzario.length ? 0 : undefined }}>
          {loading ? (
            <div className="empty">Caricamento...</div>
          ) : scadenzario.length === 0 ? (
            <div className="empty">
              <div className="serif">Nessuna scadenza registrata</div>
              <div>Aggiungi una data di scadenza ai documenti per vederli qui.</div>
            </div>
          ) : (
            <div className="doc-scad-list">
              {scadenzario.map((d) => {
                const daysLeft = daysBetween(d.expiry_date!, today);
                const color = urgencyColor(daysLeft);
                const isExpired = daysLeft < 0;
                return (
                  <div key={d.id} className="doc-scad-item" style={{ borderLeftColor: color }}>
                    <div className="doc-scad-body">
                      <div className="doc-scad-title">{d.title}</div>
                      <div className="doc-scad-meta">
                        <span className="doc-cat-badge" style={{ background: DOC_CATEGORIES[d.category] ?? "#6C6B5D" }}>
                          {d.category}
                        </span>
                        <span className="doc-scad-date" style={{ color }}>
                          {isExpired
                            ? `SCADUTO da ${Math.abs(daysLeft)} giorni`
                            : `scade il ${fmtDate(d.expiry_date)} — ${daysLeft} giorni`}
                        </span>
                      </div>
                    </div>
                    <button
                      className="btn btn-ghost doc-btn-renew"
                      onClick={() => { setRenewId(d.id); setRenewDate(""); }}
                    >
                      Rinnova
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="doc-filters">
        <input
          className="doc-search"
          type="text"
          placeholder="Cerca documento..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="doc-select" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
          <option value="Tutte">Tutte le categorie</option>
          {CATEGORY_KEYS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="doc-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          {["Tutti", "Attivi", "In scadenza", "Scaduti", "Archiviati"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* ── Archivio table ── */}
      <div className="section">
        <div className="section-head">
          <h2 className="serif">Archivio</h2>
          <span style={{ fontSize: 13, color: "var(--ink-soft)", fontWeight: 600 }}>{filtered.length} documenti</span>
        </div>
        <div className="section-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="empty">Caricamento...</div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              <div className="serif">Nessun documento trovato</div>
              <div>Prova a modificare i filtri.</div>
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Titolo</th>
                  <th>Categoria</th>
                  <th className="hide-sm">Scadenza</th>
                  <th>Stato</th>
                  <th className="hide-sm">File</th>
                  <th style={{ textAlign: "right" }}>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const sts = STATUS_STYLE[d.status] ?? STATUS_STYLE.attivo;
                  return (
                    <tr key={d.id}>
                      <td><strong>{d.title}</strong></td>
                      <td>
                        <span className="doc-cat-badge" style={{ background: DOC_CATEGORIES[d.category] ?? "#6C6B5D" }}>
                          {d.category}
                        </span>
                      </td>
                      <td className="hide-sm">
                        {d.expiry_date ? fmtDate(d.expiry_date) : "—"}
                      </td>
                      <td>
                        <span className="doc-status-badge" style={{ background: sts.bg, color: sts.color }}>
                          {d.status}
                        </span>
                      </td>
                      <td className="hide-sm">
                        {d.file_path ? (
                          <button className="btn-ghost" style={{ padding: "4px 10px", borderRadius: 8, fontSize: 12 }} onClick={() => download(d.file_path!)}>
                            Scarica
                          </button>
                        ) : (
                          <span style={{ color: "var(--ink-soft)", fontSize: 13 }}>—</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button className="btn-ghost" style={{ padding: "6px 10px", borderRadius: 8, fontSize: 12 }} onClick={() => openEdit(d)}>
                          Modifica
                        </button>
                        <button className="btn-ghost" style={{ padding: "6px 10px", borderRadius: 8, fontSize: 12, color: "#9E3B2E" }} onClick={() => del(d.id)}>
                          Elimina
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── New / Edit modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="section-head" style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
              <h2>{editId ? "Modifica documento" : "Nuovo documento"}</h2>
              <button className="btn-ghost" style={{ padding: "4px 10px", borderRadius: 8 }} onClick={closeModal}>Chiudi</button>
            </div>
            <div style={{ padding: 24 }}>
              <div className="grid2">
                <div className="field">
                  <label>Titolo *</label>
                  <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Es. Licenza SCIA..." />
                </div>
                <div className="field">
                  <label>Categoria</label>
                  <select value={form.category} onChange={(e) => set("category", e.target.value)}>
                    {CATEGORY_KEYS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Scadenza</label>
                  <input type="date" value={form.expiry_date} onChange={(e) => set("expiry_date", e.target.value)} />
                </div>
                <div className="field">
                  <label>Giorni promemoria</label>
                  <input type="number" min="0" value={form.reminder_days} onChange={(e) => set("reminder_days", e.target.value)} />
                </div>
                <div className="field" style={{ gridColumn: "1/-1" }}>
                  <label>Note</label>
                  <textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Note aggiuntive..." />
                </div>
                <div className="field">
                  <label>Stato</label>
                  <select value={form.status} onChange={(e) => set("status", e.target.value)}>
                    <option value="attivo">Attivo</option>
                    <option value="rinnovato">Rinnovato</option>
                    <option value="archiviato">Archiviato</option>
                  </select>
                </div>
                <div className="field">
                  <label>File allegato</label>
                  <input type="file" ref={fileRef} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button className="btn btn-primary" onClick={save} disabled={saving} style={{ padding: "12px 28px" }}>
                  {saving ? "Salvataggio..." : editId ? "Aggiorna" : "Salva documento"}
                </button>
                <button className="btn btn-ghost" onClick={closeModal} style={{ padding: "12px 28px" }}>Annulla</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Renew modal ── */}
      {renewId && (
        <div className="modal-overlay" onClick={() => setRenewId(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="section-head" style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
              <h2>Rinnova documento</h2>
              <button className="btn-ghost" style={{ padding: "4px 10px", borderRadius: 8 }} onClick={() => setRenewId(null)}>Chiudi</button>
            </div>
            <div style={{ padding: 24 }}>
              <div className="field">
                <label>Nuova data di scadenza</label>
                <input type="date" value={renewDate} onChange={(e) => setRenewDate(e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button className="btn btn-primary" onClick={renew} style={{ padding: "12px 28px" }}>Conferma rinnovo</button>
                <button className="btn btn-ghost" onClick={() => setRenewId(null)} style={{ padding: "12px 28px" }}>Annulla</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: toast.type === "ok" ? "#2D5A3D" : toast.type === "warn" ? "#B68A3E" : "#9E3B2E",
          color: "#FAF9F5", padding: "12px 24px", borderRadius: 10, fontSize: 14, fontWeight: 600,
          zIndex: 200, boxShadow: "0 4px 20px rgba(0,0,0,.25)", animation: "docToastIn .2s ease",
        }}>
          {toast.msg}
        </div>
      )}

      {/* ── Styles ── */}
      <style>{`
        /* ── Full width override ── */
        .wrap:has(.doc-header){max-width:none;padding-left:24px;padding-right:24px}
        @media(min-width:1024px){.wrap:has(.doc-header){padding-left:32px;padding-right:32px}}

        /* ── Header ── */
        .doc-header{margin-bottom:24px}
        .doc-header-top{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:14px}
        .doc-title{font-size:24px;font-weight:500;margin:0}
        .doc-subtitle{font-size:14px;color:var(--ink-soft);margin:4px 0 0;font-weight:500}
        .doc-header-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
        .doc-btn-sm{padding:8px 14px !important;font-size:13px !important;gap:6px;display:inline-flex;align-items:center}

        /* ── KPI row ── */
        .doc-kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
        .doc-kpi{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);
          padding:16px 18px;border-top:3px solid;text-align:center;box-shadow:var(--shadow)}
        .doc-kpi-num{font-size:28px;font-weight:800;font-family:'Bebas Neue',sans-serif;line-height:1.1}
        .doc-kpi-label{font-size:12px;font-weight:600;color:var(--ink-soft);margin-top:4px;text-transform:uppercase;letter-spacing:.5px}

        /* ── Scadenzario list ── */
        .doc-scad-list{display:flex;flex-direction:column}
        .doc-scad-item{display:flex;align-items:center;justify-content:space-between;gap:12px;
          padding:14px 20px;border-left:4px solid;border-bottom:1px solid var(--line);
          transition:background .12s}
        .doc-scad-item:last-child{border-bottom:none}
        .doc-scad-item:hover{background:var(--surface-2)}
        .doc-scad-body{flex:1;min-width:0}
        .doc-scad-title{font-size:15px;font-weight:700;color:var(--ink);margin-bottom:6px;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .doc-scad-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
        .doc-scad-date{font-size:13px;font-weight:600}
        .doc-btn-renew{padding:6px 14px !important;font-size:12px !important;white-space:nowrap}

        /* ── Category badge ── */
        .doc-cat-badge{display:inline-block;font-size:11px;font-weight:700;color:#FAF9F5;
          padding:3px 10px;border-radius:20px;white-space:nowrap;letter-spacing:.3px}

        /* ── Status badge ── */
        .doc-status-badge{display:inline-block;font-size:11px;font-weight:700;
          padding:3px 10px;border-radius:20px;text-transform:capitalize;letter-spacing:.3px}

        /* ── Filters ── */
        .doc-filters{display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap}
        .doc-search{flex:1;min-width:200px;padding:10px 14px;border:1px solid var(--line);border-radius:var(--radius);
          font-family:inherit;font-size:14px;background:var(--surface);color:var(--ink);
          transition:border-color .15s}
        .doc-search:focus{outline:none;border-color:var(--accent)}
        .doc-select{padding:10px 14px;border:1px solid var(--line);border-radius:var(--radius);
          font-family:inherit;font-size:14px;background:var(--surface);color:var(--ink);
          cursor:pointer;transition:border-color .15s}
        .doc-select:focus{outline:none;border-color:var(--accent)}

        /* ── Toast animation ── */
        @keyframes docToastIn{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}

        /* ── Responsive ── */
        @media(max-width:1023px){
          .doc-kpi-row{grid-template-columns:repeat(2,1fr)}
        }
        @media(max-width:600px){
          .doc-kpi-row{grid-template-columns:repeat(2,1fr)}
          .doc-header-top{flex-direction:column}
          .doc-header-actions{width:100%}
          .doc-header-actions .btn{flex:1;justify-content:center}
          .doc-scad-item{flex-direction:column;align-items:flex-start}
          .doc-btn-renew{align-self:flex-end}
          .doc-filters{flex-direction:column}
          .doc-search{min-width:auto}
        }
      `}</style>
    </>
  );
}
