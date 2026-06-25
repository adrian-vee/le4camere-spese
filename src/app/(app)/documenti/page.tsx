"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { fmtDate, isoToday } from "@/lib/format";
import DatePickerIT from "@/components/ui/DatePickerIT";
import { useRole } from "@/lib/useRole";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/Toast";

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
  "Assicurazioni": "#3b82f6",
  "Contratti": "#1F3326",
  "Permessi e licenze": "#7A6A8C",
  "HACCP": "#2d6a4f",
  "Sicurezza / Antincendio": "#A8552F",
  "Revisioni e manutenzioni": "#B68A3E",
  "Altro": "#888",
};

const CATEGORY_KEYS = Object.keys(DOC_CATEGORIES);

/* ── Category icons (SVG inline) ── */
function CategoryIcon({ category, size = 22 }: { category: string; size?: number }) {
  const color = DOC_CATEGORIES[category] ?? "#888";
  if (category === "HACCP") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    );
  }
  if (category === "Contratti") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      </svg>
    );
  }
  if (category.includes("Licenz") || category.includes("Permess") || category.includes("Certificaz")) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="6" />
        <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
      </svg>
    );
  }
  if (category.includes("Assicuraz")) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <path d="M12 12h.01" />
        <path d="M17 12h.01" />
        <path d="M7 12h.01" />
      </svg>
    );
  }
  if (category.includes("Sicurezza") || category.includes("Antincendio")) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 13h4" />
      <path d="M10 17h4" />
      <path d="M10 9h1" />
    </svg>
  );
}

/* ── Helpers ── */
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
}

function getDocStatus(doc: Doc, today: string): "scaduto" | "in_scadenza" | "attivo" {
  if (!doc.expiry_date) return "attivo";
  const daysLeft = daysBetween(doc.expiry_date, today);
  if (daysLeft < 0) return "scaduto";
  if (daysLeft <= 30) return "in_scadenza";
  return "attivo";
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
  const { isAdmin, isManager, loading: roleLoading } = useRole();
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    if (!roleLoading && !isManager) {
      router.replace("/");
    }
  }, [roleLoading, isManager, router]);

  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast, showToast } = useToast();

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

  /* ── View toggle ── */
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  /* ── Collapsed categories ── */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  /* ── Dropdown menu ── */
  const [openMenu, setOpenMenu] = useState<string | null>(null);

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

  useEffect(() => {
    if (!openMenu) return;
    function handleClick() { setOpenMenu(null); }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [openMenu]);

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

      const file = fileRef.current?.files?.[0];
      if (file && docId) {
        const path = `documents/${docId}/${file.name}`;
        const { error: upErr } = await supabase.storage.from("documenti").upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        const { error: pathErr } = await supabase.from("documents").update({ file_path: path }).eq("id", docId);
        if (pathErr) throw pathErr;
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
      const { error: storageErr } = await supabase.storage.from("documenti").remove([doc.file_path]);
      if (storageErr) { showToast("Errore rimozione file", "error"); return; }
    }
    const { error } = await supabase.from("documents").delete().eq("id", id);
    if (error) { showToast("Errore eliminazione documento", "error"); return; }
    setDocs((prev) => prev.filter((d) => d.id !== id));
    showToast("Documento eliminato");
  }

  /* ── Download ── */
  async function download(filePath: string) {
    const { data, error } = await supabase.storage.from("documenti").createSignedUrl(filePath, 300);
    if (error || !data?.signedUrl) {
      showToast("Errore nel download del file", "error");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
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
    const rows = filtered.map((d) =>
      [
        `"${d.title.replace(/"/g, '""')}"`,
        `"${d.category}"`,
        d.expiry_date ? fmtDate(d.expiry_date) : "",
        d.status,
        `"${(d.notes ?? "").replace(/"/g, '""')}"`,
      ].join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
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

  function toggleCategory(cat: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  /* ── Derived data ── */
  const today = isoToday();
  const totalDocs = docs.length;
  const expiringSoon = docs.filter((d) => d.expiry_date && daysBetween(d.expiry_date, today) >= 0 && daysBetween(d.expiry_date, today) <= 30).length;
  const expired = docs.filter((d) => d.expiry_date && daysBetween(d.expiry_date, today) < 0).length;
  const activeCategories = new Set(docs.map((d) => d.category)).size;

  /* ── Filtered archive ── */
  const filtered = docs.filter((d) => {
    if (search && !d.title.toLowerCase().includes(search.toLowerCase()) && !d.category.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCat !== "Tutte" && d.category !== filterCat) return false;
    if (filterStatus === "Attivi" && d.status !== "attivo") return false;
    if (filterStatus === "Archiviati" && d.status !== "archiviato") return false;
    if (filterStatus === "In scadenza" && !(d.expiry_date && daysBetween(d.expiry_date, today) >= 0 && daysBetween(d.expiry_date, today) <= 30)) return false;
    if (filterStatus === "Scaduti" && !(d.expiry_date && daysBetween(d.expiry_date, today) < 0)) return false;
    return true;
  });

  /* ── Group by category ── */
  const grouped: Record<string, Doc[]> = {};
  for (const d of filtered) {
    if (!grouped[d.category]) grouped[d.category] = [];
    grouped[d.category].push(d);
  }
  const sortedCategories = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

  /* ── Expired docs for alert ── */
  const expiredDocs = docs.filter((d) => d.expiry_date && daysBetween(d.expiry_date, today) < 0);
  const expiringDocs = docs.filter((d) => d.expiry_date && daysBetween(d.expiry_date, today) >= 0 && daysBetween(d.expiry_date, today) <= 30);

  if (roleLoading || !isManager) {
    return <div style={{ padding: 40, textAlign: "center", color: "#6C6B5D", fontFamily: "'Albert Sans', sans-serif" }}>Caricamento...</div>;
  }

  /* ── Render ── */
  return (
    <>
      {/* ── Header ── */}
      <div className="ad-header">
        <div className="ad-header-top">
          <div>
            <h1 className="ad-title">Archivio Documenti</h1>
            <p className="ad-subtitle">Archivio digitale e scadenze aziendali</p>
          </div>
          <div className="ad-header-actions">
            <button className="ad-btn ad-btn-primary" onClick={openNew}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              Nuovo documento
            </button>
            <button className="ad-btn ad-btn-outline" onClick={exportCSV}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Esporta lista
            </button>
          </div>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="ad-kpi-row">
        <div className="ad-kpi ad-kpi-total">
          <div className="ad-kpi-icon-wrap" style={{ background: "rgba(31,51,38,0.08)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div className="ad-kpi-num">{totalDocs}</div>
          <div className="ad-kpi-label">Documenti totali</div>
        </div>
        <div className="ad-kpi ad-kpi-expiring">
          <div className="ad-kpi-icon-wrap" style={{ background: "rgba(191,167,98,0.12)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#BFA762" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div className="ad-kpi-num" style={{ color: expiringSoon > 0 ? "#BFA762" : undefined }}>{expiringSoon}</div>
          <div className="ad-kpi-label">In scadenza</div>
        </div>
        <div className="ad-kpi ad-kpi-expired">
          <div className="ad-kpi-icon-wrap" style={{ background: "rgba(196,69,60,0.10)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C4453C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div className="ad-kpi-num" style={{ color: expired > 0 ? "#C4453C" : undefined }}>{expired}</div>
          <div className="ad-kpi-label">Scaduti</div>
          {expired > 0 && (
            <button className="ad-kpi-action" onClick={() => { setFilterStatus("Scaduti"); }}>
              Gestisci
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
            </button>
          )}
        </div>
        <div className="ad-kpi ad-kpi-categories">
          <div className="ad-kpi-icon-wrap" style={{ background: "rgba(45,106,79,0.10)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2d6a4f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
          </div>
          <div className="ad-kpi-num">{activeCategories}</div>
          <div className="ad-kpi-label">Categorie</div>
        </div>
      </div>

      {/* ── Alert Scadenze ── */}
      {expiredDocs.length > 0 && (
        <div className="ad-alert ad-alert-expired">
          <div className="ad-alert-content">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C4453C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span><strong>{expiredDocs.length} document{expiredDocs.length > 1 ? "i" : "o"} scadut{expiredDocs.length > 1 ? "i" : "o"}</strong> richied{expiredDocs.length > 1 ? "ono" : "e"} attenzione</span>
          </div>
          <button className="ad-alert-link" onClick={() => setFilterStatus("Scaduti")}>
            Vedi tutti
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
          </button>
        </div>
      )}
      {expiringDocs.length > 0 && (
        <div className="ad-alert ad-alert-warning">
          <div className="ad-alert-content">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#BFA762" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <span><strong>{expiringDocs.length} document{expiringDocs.length > 1 ? "i" : "o"}</strong> in scadenza entro 30 giorni</span>
          </div>
          <button className="ad-alert-link" onClick={() => setFilterStatus("In scadenza")}>
            Vedi tutti
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
          </button>
        </div>
      )}

      {/* ── Search & Filters ── */}
      <div className="ad-filters-bar">
        <div className="ad-search-wrap">
          <svg className="ad-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6C6B5D" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input
            className="ad-search"
            type="text"
            placeholder="Cerca per nome, categoria..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="ad-select" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
          <option value="Tutte">Tutte le categorie</option>
          {CATEGORY_KEYS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="ad-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          {["Tutti", "Attivi", "In scadenza", "Scaduti", "Archiviati"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* ── Archive Header + View Toggle ── */}
      <div className="ad-archive-header">
        <div className="ad-archive-title-wrap">
          <h2 className="ad-archive-title">Archivio</h2>
          <span className="ad-archive-count">{filtered.length} document{filtered.length !== 1 ? "i" : "o"}</span>
        </div>
        <div className="ad-view-toggle">
          <button
            className={`ad-view-btn ${viewMode === "grid" ? "active" : ""}`}
            onClick={() => setViewMode("grid")}
            title="Vista griglia"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          </button>
          <button
            className={`ad-view-btn ${viewMode === "list" ? "active" : ""}`}
            onClick={() => setViewMode("list")}
            title="Vista lista"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          </button>
        </div>
      </div>

      {/* ── Archive Content ── */}
      {loading ? (
        <div className="ad-empty">Caricamento documenti...</div>
      ) : filtered.length === 0 ? (
        <div className="ad-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#D8CCB8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>
          </svg>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, color: "#1F3326", marginTop: 12 }}>Nessun documento trovato</div>
          <div style={{ fontSize: 13, color: "#6C6B5D", marginTop: 4 }}>Prova a modificare i filtri di ricerca</div>
        </div>
      ) : viewMode === "grid" ? (
        <div className="ad-categories">
          {sortedCategories.map((cat) => {
            const catDocs = grouped[cat];
            const catColor = DOC_CATEGORIES[cat] ?? "#888";
            const isCollapsed = collapsed.has(cat);
            const hasExpired = catDocs.some((d) => getDocStatus(d, today) === "scaduto");
            return (
              <div key={cat} className={`ad-cat-section ${hasExpired ? "ad-cat-has-expired" : ""}`}>
                <button className="ad-cat-header" onClick={() => toggleCategory(cat)}>
                  <div className="ad-cat-header-left">
                    <span className="ad-cat-dot" style={{ background: catColor }} />
                    <span className="ad-cat-name">{cat}</span>
                  </div>
                  <div className="ad-cat-header-right">
                    <span className="ad-cat-count">{catDocs.length} document{catDocs.length !== 1 ? "i" : "o"}</span>
                    <svg className={`ad-cat-chevron ${isCollapsed ? "collapsed" : ""}`} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6C6B5D" strokeWidth="2" strokeLinecap="round"><path d="m6 9 6 6 6-6"/></svg>
                  </div>
                </button>
                <div className={`ad-cat-body ${isCollapsed ? "collapsed" : ""}`}>
                  <div className="ad-doc-grid">
                    {catDocs.map((d) => {
                      const docSt = getDocStatus(d, today);
                      const daysLeft = d.expiry_date ? daysBetween(d.expiry_date, today) : null;
                      return (
                        <div key={d.id} className="ad-doc-card">
                          <div className="ad-doc-card-top">
                            <div className="ad-doc-icon-wrap">
                              <CategoryIcon category={d.category} size={20} />
                            </div>
                            <div className="ad-doc-menu-wrap">
                              <button className="ad-doc-menu-btn" onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === d.id ? null : d.id); }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6C6B5D" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                              </button>
                              {openMenu === d.id && (
                                <div className="ad-doc-dropdown" onClick={(e) => e.stopPropagation()}>
                                  <button onClick={() => { openEdit(d); setOpenMenu(null); }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                                    Modifica
                                  </button>
                                  {d.expiry_date && (
                                    <button onClick={() => { setRenewId(d.id); setRenewDate(""); setOpenMenu(null); }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                                      Rinnova
                                    </button>
                                  )}
                                  {(isAdmin || isManager) && (
                                    <button className="ad-dropdown-danger" onClick={() => { del(d.id); setOpenMenu(null); }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                      Elimina
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="ad-doc-card-body">
                            <div className="ad-doc-card-title">{d.title}</div>
                            {d.expiry_date && (
                              <div className={`ad-doc-card-expiry ${docSt === "scaduto" ? "expired" : docSt === "in_scadenza" ? "warning" : ""}`}>
                                {docSt === "scaduto"
                                  ? `Scaduto da ${Math.abs(daysLeft!)}g`
                                  : `Scade il ${fmtDate(d.expiry_date)}`}
                              </div>
                            )}
                          </div>
                          <div className="ad-doc-card-footer">
                            <span className={`ad-doc-badge ad-doc-badge-${docSt}`}>
                              {docSt === "scaduto" ? "Scaduto" : docSt === "in_scadenza" ? "In scadenza" : d.status === "rinnovato" ? "Rinnovato" : "Attivo"}
                            </span>
                            {d.file_path && (
                              <button className="ad-doc-download" onClick={() => download(d.file_path!)} title="Scarica file">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── List View ── */
        <div className="ad-list-section">
          <table className="ad-list-table">
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
                const docSt = getDocStatus(d, today);
                return (
                  <tr key={d.id}>
                    <td><strong style={{ color: "#1F3326" }}>{d.title}</strong></td>
                    <td>
                      <span className="ad-cat-pill" style={{ background: `${DOC_CATEGORIES[d.category] ?? "#888"}18`, color: DOC_CATEGORIES[d.category] ?? "#888" }}>
                        {d.category}
                      </span>
                    </td>
                    <td className="hide-sm">
                      {d.expiry_date ? (
                        <span style={{ color: docSt === "scaduto" ? "#C4453C" : docSt === "in_scadenza" ? "#BFA762" : undefined }}>
                          {fmtDate(d.expiry_date)}
                        </span>
                      ) : "—"}
                    </td>
                    <td>
                      <span className={`ad-doc-badge ad-doc-badge-${docSt}`}>
                        {docSt === "scaduto" ? "Scaduto" : docSt === "in_scadenza" ? "In scadenza" : d.status === "rinnovato" ? "Rinnovato" : "Attivo"}
                      </span>
                    </td>
                    <td className="hide-sm">
                      {d.file_path ? (
                        <button className="ad-doc-download" onClick={() => download(d.file_path!)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          Scarica
                        </button>
                      ) : (
                        <span style={{ color: "#6C6B5D", fontSize: 13 }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="ad-tbl-action" onClick={() => openEdit(d)}>Modifica</button>
                      {(isAdmin || isManager) && (
                        <button className="ad-tbl-action ad-tbl-action-danger" onClick={() => del(d.id)}>Elimina</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── New / Edit modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ borderRadius: 16 }}>
            <div className="section-head" style={{ padding: "20px 24px", borderBottom: "1px solid #D8CCB8" }}>
              <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 20, color: "#1F3326" }}>{editId ? "Modifica documento" : "Nuovo documento"}</h2>
              <button className="ad-btn ad-btn-outline" style={{ padding: "6px 14px", fontSize: 13 }} onClick={closeModal}>Chiudi</button>
            </div>
            <div style={{ padding: 24 }}>
              <div className="grid2">
                <div className="field">
                  <label style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "#1F3326" }}>Titolo *</label>
                  <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Es. Licenza SCIA..." style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, border: "1px solid #D8CCB8", borderRadius: 8, padding: "10px 12px" }} />
                </div>
                <div className="field">
                  <label style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "#1F3326" }}>Categoria</label>
                  <select value={form.category} onChange={(e) => set("category", e.target.value)} style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, border: "1px solid #D8CCB8", borderRadius: 8, padding: "10px 12px" }}>
                    {CATEGORY_KEYS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "#1F3326" }}>Scadenza</label>
                  <DatePickerIT value={form.expiry_date} onChange={v => set("expiry_date", v)} />
                </div>
                <div className="field">
                  <label style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "#1F3326" }}>Giorni promemoria</label>
                  <input type="number" min="0" value={form.reminder_days} onChange={(e) => set("reminder_days", e.target.value)} style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, border: "1px solid #D8CCB8", borderRadius: 8, padding: "10px 12px" }} />
                </div>
                <div className="field" style={{ gridColumn: "1/-1" }}>
                  <label style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "#1F3326" }}>Note</label>
                  <textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Note aggiuntive..." style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, border: "1px solid #D8CCB8", borderRadius: 8, padding: "10px 12px" }} />
                </div>
                <div className="field">
                  <label style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "#1F3326" }}>Stato</label>
                  <select value={form.status} onChange={(e) => set("status", e.target.value)} style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, border: "1px solid #D8CCB8", borderRadius: 8, padding: "10px 12px" }}>
                    <option value="attivo">Attivo</option>
                    <option value="rinnovato">Rinnovato</option>
                    <option value="archiviato">Archiviato</option>
                  </select>
                </div>
                <div className="field">
                  <label style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "#1F3326" }}>File allegato</label>
                  <input type="file" ref={fileRef} style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14 }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button className="ad-btn ad-btn-primary" onClick={save} disabled={saving} style={{ padding: "12px 28px" }}>
                  {saving ? "Salvataggio..." : editId ? "Aggiorna" : "Salva documento"}
                </button>
                <button className="ad-btn ad-btn-outline" onClick={closeModal} style={{ padding: "12px 28px" }}>Annulla</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Renew modal ── */}
      {renewId && (
        <div className="modal-overlay" onClick={() => setRenewId(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400, borderRadius: 16 }}>
            <div className="section-head" style={{ padding: "20px 24px", borderBottom: "1px solid #D8CCB8" }}>
              <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 20, color: "#1F3326" }}>Rinnova documento</h2>
              <button className="ad-btn ad-btn-outline" style={{ padding: "6px 14px", fontSize: 13 }} onClick={() => setRenewId(null)}>Chiudi</button>
            </div>
            <div style={{ padding: 24 }}>
              <div className="field">
                <label style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "#1F3326" }}>Nuova data di scadenza</label>
                <DatePickerIT value={renewDate} onChange={v => setRenewDate(v)} />
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button className="ad-btn ad-btn-primary" onClick={renew} style={{ padding: "12px 28px" }}>Conferma rinnovo</button>
                <button className="ad-btn ad-btn-outline" onClick={() => setRenewId(null)} style={{ padding: "12px 28px" }}>Annulla</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} />

      {/* ── Styles ── */}
      <style>{`
        /* ── Full width override ── */
        .wrap:has(.ad-header){max-width:none;padding-left:24px;padding-right:24px}
        @media(min-width:1024px){.wrap:has(.ad-header){padding-left:32px;padding-right:32px}}

        /* ── Header ── */
        .ad-header{margin-bottom:28px}
        .ad-header-top{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:16px}
        .ad-title{font-family:'Fraunces',serif;font-size:26px;font-weight:500;color:#1F3326;margin:0;letter-spacing:-0.3px}
        .ad-subtitle{font-size:14px;color:#888;margin:6px 0 0;font-family:'Albert Sans',sans-serif;font-weight:400}
        .ad-header-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}

        /* ── Buttons ── */
        .ad-btn{display:inline-flex;align-items:center;gap:7px;font-family:'Albert Sans',sans-serif;font-size:13px;
          font-weight:600;border-radius:8px;padding:9px 16px;cursor:pointer;transition:all .2s;border:none}
        .ad-btn-primary{background:#1F3326;color:#fff}
        .ad-btn-primary:hover{background:#2a4535;transform:translateY(-1px);box-shadow:0 4px 12px rgba(31,51,38,0.18)}
        .ad-btn-primary:disabled{opacity:.6;cursor:not-allowed;transform:none;box-shadow:none}
        .ad-btn-outline{background:#fff;color:#1F3326;border:1px solid #D8CCB8}
        .ad-btn-outline:hover{background:#F3EBDD;border-color:#BFA762}

        /* ── KPI Row ── */
        .ad-kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
        .ad-kpi{position:relative;background:#fff;border-radius:16px;padding:20px;
          border-top:3px solid #1F3326;
          box-shadow:0 1px 3px rgba(31,51,38,0.04),0 4px 12px rgba(31,51,38,0.03);
          transition:transform .25s cubic-bezier(.4,0,.2,1),box-shadow .25s cubic-bezier(.4,0,.2,1)}
        .ad-kpi:hover{transform:translateY(-3px);box-shadow:0 4px 8px rgba(31,51,38,0.06),0 12px 28px rgba(31,51,38,0.08)}
        .ad-kpi-total{border-top-color:#1F3326}
        .ad-kpi-expiring{border-top-color:#BFA762}
        .ad-kpi-expired{border-top-color:#C4453C}
        .ad-kpi-categories{border-top-color:#2d6a4f}
        .ad-kpi-icon-wrap{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:10px;margin-bottom:10px}
        .ad-kpi-num{font-family:'Fraunces',serif;font-size:28px;font-weight:600;color:#1F3326;line-height:1.1}
        .ad-kpi-label{font-family:'Albert Sans',sans-serif;font-size:12px;font-weight:600;color:#6C6B5D;
          margin-top:4px;text-transform:uppercase;letter-spacing:.5px}
        .ad-kpi-action{display:inline-flex;align-items:center;gap:4px;margin-top:8px;padding:0;border:none;background:none;
          font-family:'Albert Sans',sans-serif;font-size:11px;font-weight:700;color:#C4453C;cursor:pointer;
          text-transform:uppercase;letter-spacing:.4px}
        .ad-kpi-action:hover{text-decoration:underline}

        /* ── Alert Banners ── */
        .ad-alert{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;
          border-radius:10px;margin-bottom:10px;border-left:4px solid}
        .ad-alert-expired{background:#FDF2F2;border-left-color:#C4453C}
        .ad-alert-warning{background:#FDF8EC;border-left-color:#BFA762}
        .ad-alert-content{display:flex;align-items:center;gap:10px;font-family:'Albert Sans',sans-serif;font-size:13px;color:#1F3326}
        .ad-alert-link{display:inline-flex;align-items:center;gap:4px;border:none;background:none;
          font-family:'Albert Sans',sans-serif;font-size:12px;font-weight:700;color:#1F3326;cursor:pointer;
          white-space:nowrap;text-transform:uppercase;letter-spacing:.3px}
        .ad-alert-link:hover{text-decoration:underline}

        /* ── Search & Filters ── */
        .ad-filters-bar{display:flex;align-items:center;gap:10px;background:#F3EBDD;border-radius:14px;
          padding:14px;margin-bottom:20px;flex-wrap:wrap}
        .ad-search-wrap{position:relative;flex:1;min-width:200px}
        .ad-search-icon{position:absolute;left:12px;top:50%;transform:translateY(-50%);pointer-events:none}
        .ad-search{width:100%;padding:10px 12px 10px 36px;border:1px solid #D8CCB8;border-radius:10px;
          background:#fff;font-family:'Albert Sans',sans-serif;font-size:14px;color:#1F3326;transition:border-color .2s}
        .ad-search:focus{outline:none;border-color:#BFA762;box-shadow:0 0 0 3px rgba(191,167,98,0.12)}
        .ad-select{padding:10px 14px;border:1px solid #D8CCB8;border-radius:10px;background:#fff;
          font-family:'Albert Sans',sans-serif;font-size:14px;color:#1F3326;cursor:pointer;transition:border-color .2s;
          -webkit-appearance:none;appearance:none;
          background-image:url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236C6B5D' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
          background-repeat:no-repeat;background-position:right 12px center;padding-right:32px}
        .ad-select:focus{outline:none;border-color:#BFA762;box-shadow:0 0 0 3px rgba(191,167,98,0.12)}

        /* ── Archive Header ── */
        .ad-archive-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
        .ad-archive-title-wrap{display:flex;align-items:baseline;gap:12px}
        .ad-archive-title{font-family:'Fraunces',serif;font-size:20px;font-weight:500;color:#1F3326;margin:0}
        .ad-archive-count{font-family:'Albert Sans',sans-serif;font-size:13px;color:#6C6B5D;font-weight:600}
        .ad-view-toggle{display:flex;gap:2px;background:#F3EBDD;border-radius:8px;padding:3px}
        .ad-view-btn{display:flex;align-items:center;justify-content:center;width:32px;height:28px;border:none;
          background:transparent;border-radius:6px;cursor:pointer;color:#6C6B5D;transition:all .15s}
        .ad-view-btn.active{background:#fff;color:#1F3326;box-shadow:0 1px 3px rgba(0,0,0,0.08)}
        .ad-view-btn:hover:not(.active){color:#1F3326}

        /* ── Empty State ── */
        .ad-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;
          text-align:center;font-family:'Albert Sans',sans-serif}

        /* ── Category Sections (Grid View) ── */
        .ad-categories{display:flex;flex-direction:column;gap:16px}
        .ad-cat-section{border-radius:14px;overflow:hidden;background:#fff;
          box-shadow:0 1px 3px rgba(31,51,38,0.04),0 4px 12px rgba(31,51,38,0.03)}
        .ad-cat-section.ad-cat-has-expired{border-left:3px solid #C4453C}
        .ad-cat-header{display:flex;align-items:center;justify-content:space-between;width:100%;padding:14px 18px;
          background:#F3EBDD;border:none;cursor:pointer;font-family:'Albert Sans',sans-serif;transition:background .15s}
        .ad-cat-header:hover{background:#EDE5D5}
        .ad-cat-header-left{display:flex;align-items:center;gap:10px}
        .ad-cat-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
        .ad-cat-name{font-size:15px;font-weight:700;color:#1F3326}
        .ad-cat-header-right{display:flex;align-items:center;gap:10px}
        .ad-cat-count{font-size:12px;font-weight:600;color:#6C6B5D}
        .ad-cat-chevron{transition:transform .25s ease}
        .ad-cat-chevron.collapsed{transform:rotate(-90deg)}
        .ad-cat-body{overflow:hidden;transition:max-height .35s cubic-bezier(.4,0,.2,1),opacity .25s;max-height:2000px;opacity:1}
        .ad-cat-body.collapsed{max-height:0;opacity:0}

        /* ── Document Grid ── */
        .ad-doc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;padding:16px 18px}

        /* ── Document Card ── */
        .ad-doc-card{background:#fff;border:1px solid #eee;border-radius:12px;padding:16px;
          display:flex;flex-direction:column;gap:8px;
          box-shadow:0 2px 8px rgba(31,51,38,0.04);
          transition:transform .2s cubic-bezier(.4,0,.2,1),box-shadow .2s}
        .ad-doc-card:hover{transform:translateY(-2px);box-shadow:0 4px 16px rgba(31,51,38,0.08)}
        .ad-doc-card-top{display:flex;align-items:flex-start;justify-content:space-between}
        .ad-doc-icon-wrap{display:flex;align-items:center;justify-content:center;width:36px;height:36px;
          background:#F3EBDD;border-radius:10px}
        .ad-doc-menu-wrap{position:relative}
        .ad-doc-menu-btn{display:flex;align-items:center;justify-content:center;width:28px;height:28px;
          border:none;background:transparent;border-radius:6px;cursor:pointer;transition:background .15s}
        .ad-doc-menu-btn:hover{background:#F3EBDD}
        .ad-doc-dropdown{position:absolute;right:0;top:100%;margin-top:4px;background:#fff;
          border:1px solid #D8CCB8;border-radius:10px;padding:6px;min-width:140px;z-index:10;
          box-shadow:0 8px 24px rgba(31,51,38,0.12)}
        .ad-doc-dropdown button{display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;
          border:none;background:none;border-radius:6px;font-family:'Albert Sans',sans-serif;font-size:13px;
          color:#1F3326;cursor:pointer;text-align:left;transition:background .12s}
        .ad-doc-dropdown button:hover{background:#F3EBDD}
        .ad-dropdown-danger{color:#C4453C !important}
        .ad-dropdown-danger:hover{background:#FDF2F2 !important}

        .ad-doc-card-body{flex:1;min-height:0}
        .ad-doc-card-title{font-family:'Albert Sans',sans-serif;font-size:14px;font-weight:500;color:#1F3326;
          line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .ad-doc-card-expiry{font-family:'Albert Sans',sans-serif;font-size:11px;color:#6C6B5D;margin-top:4px}
        .ad-doc-card-expiry.expired{color:#C4453C;font-weight:600}
        .ad-doc-card-expiry.warning{color:#BFA762;font-weight:600}

        .ad-doc-card-footer{display:flex;align-items:center;justify-content:space-between;margin-top:4px}

        /* ── Status Badges ── */
        .ad-doc-badge{display:inline-block;font-family:'Albert Sans',sans-serif;font-size:11px;font-weight:700;
          padding:3px 10px;border-radius:20px;text-transform:capitalize;letter-spacing:.3px}
        .ad-doc-badge-attivo{background:#EAF3DE;color:#27500A}
        .ad-doc-badge-in_scadenza{background:#FDF8EC;color:#8B6E14}
        .ad-doc-badge-scaduto{background:#FDF2F2;color:#9E3B2E}

        /* ── Download button ── */
        .ad-doc-download{display:inline-flex;align-items:center;gap:5px;border:none;background:#F3EBDD;
          border-radius:6px;padding:5px 8px;cursor:pointer;color:#1F3326;font-family:'Albert Sans',sans-serif;
          font-size:12px;font-weight:600;transition:all .15s}
        .ad-doc-download:hover{background:#E8DFD0}

        /* ── Category pill (list view) ── */
        .ad-cat-pill{display:inline-block;font-family:'Albert Sans',sans-serif;font-size:11px;font-weight:700;
          padding:3px 10px;border-radius:20px;white-space:nowrap;letter-spacing:.3px}

        /* ── List View Table ── */
        .ad-list-section{background:#fff;border-radius:14px;overflow:hidden;
          box-shadow:0 1px 3px rgba(31,51,38,0.04),0 4px 12px rgba(31,51,38,0.03)}
        .ad-list-table{width:100%;border-collapse:collapse;font-family:'Albert Sans',sans-serif;font-size:14px}
        .ad-list-table thead{background:#F3EBDD}
        .ad-list-table th{padding:12px 16px;text-align:left;font-size:12px;font-weight:700;color:#6C6B5D;
          text-transform:uppercase;letter-spacing:.5px}
        .ad-list-table td{padding:12px 16px;border-bottom:1px solid #f0ede8}
        .ad-list-table tbody tr:last-child td{border-bottom:none}
        .ad-list-table tbody tr{transition:background .12s}
        .ad-list-table tbody tr:hover{background:#FAFAF7}

        .ad-tbl-action{border:none;background:none;padding:6px 10px;border-radius:8px;font-family:'Albert Sans',sans-serif;
          font-size:12px;font-weight:600;color:#1F3326;cursor:pointer;transition:background .12s}
        .ad-tbl-action:hover{background:#F3EBDD}
        .ad-tbl-action-danger{color:#C4453C}
        .ad-tbl-action-danger:hover{background:#FDF2F2}

        /* ── Responsive ── */
        @media(max-width:1023px){
          .ad-kpi-row{grid-template-columns:repeat(2,1fr)}
          .ad-doc-grid{grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}
        }
        @media(max-width:600px){
          .ad-kpi-row{grid-template-columns:repeat(2,1fr);gap:10px}
          .ad-kpi{padding:16px 14px}
          .ad-kpi-num{font-size:24px}
          .ad-header-top{flex-direction:column}
          .ad-header-actions{width:100%}
          .ad-header-actions .ad-btn{flex:1;justify-content:center}
          .ad-filters-bar{flex-direction:column}
          .ad-search-wrap{min-width:auto}
          .ad-doc-grid{grid-template-columns:1fr;gap:10px;padding:12px}
          .ad-alert{flex-direction:column;align-items:flex-start;gap:8px}
          .ad-archive-header{flex-direction:column;align-items:flex-start;gap:10px}
        }

        /* ── Animations ── */
        @keyframes adFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .ad-kpi,.ad-cat-section,.ad-alert{animation:adFadeIn .4s ease both}
        .ad-kpi:nth-child(2){animation-delay:.05s}
        .ad-kpi:nth-child(3){animation-delay:.1s}
        .ad-kpi:nth-child(4){animation-delay:.15s}
        .ad-cat-section:nth-child(2){animation-delay:.05s}
        .ad-cat-section:nth-child(3){animation-delay:.1s}
        .ad-cat-section:nth-child(4){animation-delay:.15s}
        .ad-cat-section:nth-child(5){animation-delay:.2s}
      `}</style>
    </>
  );
}
