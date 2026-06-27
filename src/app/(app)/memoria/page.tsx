"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRole } from "@/lib/useRole";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/Toast";
import { Modal } from "@/components/ui/Modal";

/* ── Types ── */
type Attachment = {
  id: string;
  knowledge_id: string;
  file_url: string;
  file_name: string;
  file_type: string;
};

type Note = {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  importance: "normale" | "importante" | "critico";
  is_pinned: boolean;
  room_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  author: { full_name: string | null } | null;
  room: { number: number; name: string | null } | null;
  hotel_knowledge_attachments: Attachment[];
};

type Room = { id: string; number: number; name: string | null };

/* ── Constants ── */
const CATEGORIES = ["Procedure", "Attrezzature", "Camere", "Fornitori", "Ospiti", "Sicurezza", "Generale"] as const;
const ALL_CATEGORIES = ["Tutte", ...CATEGORIES] as const;
const IMPORTANCE_OPTIONS = ["Tutte", "Critico", "Importante"] as const;

const IMPORTANCE_COLORS: Record<string, { bg: string; fg: string }> = {
  critico: { bg: "#FDECEA", fg: "#B3261E" },
  importante: { bg: "#FDF6E8", fg: "#956A15" },
};

const SELECT_COLS = `id, title, content, category, tags, importance, is_pinned, room_id, created_by, updated_by, created_at, updated_at, author:profiles!created_by(full_name), room:rooms!room_id(number, name), hotel_knowledge_attachments(id, file_url, file_name, file_type, knowledge_id)`;

const emptyForm = {
  title: "",
  content: "",
  category: "Generale" as string,
  importance: "normale" as "normale" | "importante" | "critico",
  tags: [] as string[],
  room_id: "",
  is_pinned: false,
};

function extractStoragePath(url: string): string | null {
  const parts = url.split("/knowledge-attachments/");
  return parts.length > 1 ? decodeURIComponent(parts[1]) : null;
}

function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
}

function isImageType(type: string): boolean {
  return type.startsWith("image/");
}

/* ── Main Component ── */
export default function MemoriaPage() {
  const supabase = createClient();
  const { isAdmin, userId, loading: roleLoading } = useRole();
  const { toast, showToast } = useToast();

  const [notes, setNotes] = useState<Note[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [saving, setSaving] = useState(false);

  /* Search */
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  /* Filters */
  const [filterCategory, setFilterCategory] = useState("Tutte");
  const [filterImportance, setFilterImportance] = useState("Tutte");

  /* Modals */
  const [showForm, setShowForm] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [viewingNote, setViewingNote] = useState<Note | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  /* Form */
  const [form, setForm] = useState({ ...emptyForm });
  const [tagInput, setTagInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [removedAttIds, setRemovedAttIds] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  /* ── Debounced search ── */
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  /* ── Load rooms once ── */
  useEffect(() => {
    supabase
      .from("rooms")
      .select("id, number, name")
      .eq("active", true)
      .order("number")
      .then(({ data }) => setRooms((data ?? []) as Room[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Load notes ── */
  const loadNotes = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("hotel_knowledge")
      .select(SELECT_COLS)
      .order("is_pinned", { ascending: false })
      .order("updated_at", { ascending: false });

    if (searchQuery.trim()) {
      query = query.textSearch("search_vector", searchQuery, { type: "websearch", config: "italian" });
    }

    const { data } = await query;
    const result = (data ?? []) as unknown as Note[];
    setNotes(result);
    if (!searchQuery.trim()) setTotalCount(result.length);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  /* ── Separate total count ── */
  useEffect(() => {
    supabase
      .from("hotel_knowledge")
      .select("id", { count: "exact", head: true })
      .then(({ count }) => setTotalCount(count ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Intersection Observer for stagger ── */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).classList.add("mk-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.05, rootMargin: "50px" },
    );
    document.querySelectorAll(".mk-card:not(.mk-visible)").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [notes, filterCategory, filterImportance]);

  /* ── Filtered data ── */
  const filteredNotes = notes.filter((n) => {
    if (filterCategory !== "Tutte" && n.category !== filterCategory) return false;
    if (filterImportance === "Critico" && n.importance !== "critico") return false;
    if (filterImportance === "Importante" && n.importance !== "importante") return false;
    return true;
  });

  const pinnedNotes = filteredNotes.filter((n) => n.is_pinned);
  const unpinnedNotes = filteredNotes.filter((n) => !n.is_pinned);

  const categoryCounts: Record<string, number> = {};
  notes.forEach((n) => {
    categoryCounts[n.category] = (categoryCounts[n.category] ?? 0) + 1;
  });

  /* ── CRUD: Save ── */
  async function save() {
    if (!form.title.trim()) {
      showToast("Il titolo è obbligatorio", "warn");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content,
        category: form.category,
        importance: form.importance,
        tags: form.tags,
        room_id: form.room_id || null,
        is_pinned: form.is_pinned,
      };

      let noteId: string;

      if (editingNote) {
        const { error } = await supabase
          .from("hotel_knowledge")
          .update({ ...payload, updated_by: userId })
          .eq("id", editingNote.id);
        if (error) throw error;
        noteId = editingNote.id;
      } else {
        const { data, error } = await supabase
          .from("hotel_knowledge")
          .insert({ ...payload, created_by: userId })
          .select("id")
          .single();
        if (error) throw error;
        noteId = data.id;
      }

      for (const attId of removedAttIds) {
        const att = editingNote?.hotel_knowledge_attachments.find((a) => a.id === attId);
        if (att) {
          const sp = extractStoragePath(att.file_url);
          if (sp) await supabase.storage.from("knowledge-attachments").remove([sp]);
          await supabase.from("hotel_knowledge_attachments").delete().eq("id", attId);
        }
      }

      for (const file of pendingFiles) {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
        const path = `knowledge/${noteId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("knowledge-attachments").upload(path, file);
        if (!upErr) {
          const {
            data: { publicUrl },
          } = supabase.storage.from("knowledge-attachments").getPublicUrl(path);
          await supabase.from("hotel_knowledge_attachments").insert({
            knowledge_id: noteId,
            file_url: publicUrl,
            file_name: file.name,
            file_type: file.type,
          });
        }
      }

      showToast(editingNote ? "Nota aggiornata" : "Nota creata");
      closeForm();
      loadNotes();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Errore imprevisto", "error");
    } finally {
      setSaving(false);
    }
  }

  /* ── CRUD: Delete ── */
  async function deleteNote(id: string) {
    try {
      const note = notes.find((n) => n.id === id);
      if (note) {
        for (const att of note.hotel_knowledge_attachments) {
          const sp = extractStoragePath(att.file_url);
          if (sp) await supabase.storage.from("knowledge-attachments").remove([sp]);
        }
      }
      const { error } = await supabase.from("hotel_knowledge").delete().eq("id", id);
      if (error) throw error;
      showToast("Nota eliminata");
      setDeleteId(null);
      setViewingNote(null);
      loadNotes();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Errore eliminazione", "error");
    }
  }

  /* ── CRUD: Toggle pin ── */
  async function togglePin(note: Note) {
    const { error } = await supabase
      .from("hotel_knowledge")
      .update({ is_pinned: !note.is_pinned, updated_by: userId })
      .eq("id", note.id);
    if (error) {
      showToast("Errore aggiornamento", "error");
      return;
    }
    showToast(note.is_pinned ? "Rimossa dai fissati" : "Fissata in alto");
    loadNotes();
  }

  /* ── Modal helpers ── */
  function openCreate() {
    setEditingNote(null);
    setForm({ ...emptyForm });
    setTagInput("");
    setPendingFiles([]);
    setRemovedAttIds([]);
    setShowForm(true);
  }

  function openEdit(note: Note) {
    setEditingNote(note);
    setForm({
      title: note.title,
      content: note.content,
      category: note.category,
      importance: note.importance,
      tags: [...note.tags],
      room_id: note.room_id ?? "",
      is_pinned: note.is_pinned,
    });
    setTagInput("");
    setPendingFiles([]);
    setRemovedAttIds([]);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingNote(null);
  }

  function canEdit(note: Note) {
    return isAdmin || note.created_by === userId;
  }

  /* ── Tag handling ── */
  function addTag() {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag)) {
      set("tags", [...form.tags, tag]);
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    set("tags", form.tags.filter((t) => t !== tag));
  }

  /* ── File handling ── */
  function handleFiles(files: FileList | null) {
    if (!files) return;
    setPendingFiles((prev) => [...prev, ...Array.from(files)]);
  }

  function removePendingFile(idx: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  /* ── Loading state ── */
  if (roleLoading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#6C6B5D", fontFamily: "'Albert Sans', sans-serif" }}>
        Caricamento...
      </div>
    );
  }

  /* ── Render card ── */
  function renderCard(note: Note, idx: number, isPinnedSection = false) {
    const hasImages = note.hotel_knowledge_attachments.some((a) => isImageType(a.file_type));
    return (
      <div
        key={note.id}
        className={`mk-card${isPinnedSection ? " mk-card-pinned" : ""}`}
        style={{ transitionDelay: `${idx * 60}ms` }}
        onClick={() => setViewingNote(note)}
      >
        {/* Header: category + pin */}
        <div className="mk-card-top">
          <span className="mk-badge-cat">{note.category}</span>
          <div className="mk-card-top-right">
            {note.importance !== "normale" && (
              <span
                className="mk-badge-imp"
                style={{
                  background: IMPORTANCE_COLORS[note.importance]?.bg,
                  color: IMPORTANCE_COLORS[note.importance]?.fg,
                }}
              >
                {note.importance === "critico" ? "Critico" : "Importante"}
              </span>
            )}
            {canEdit(note) && (
              <button
                className={`mk-pin-btn${note.is_pinned ? " pinned" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  togglePin(note);
                }}
                title={note.is_pinned ? "Rimuovi dai fissati" : "Fissa in alto"}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill={note.is_pinned ? "#BFA762" : "none"} stroke={note.is_pinned ? "#BFA762" : "#6C6B5D"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 17v5M9 2h6l-1 7h4l-7 8V9H7l2-7z" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Title */}
        <h3 className="mk-card-title">{note.title}</h3>

        {/* Content snippet */}
        {note.content && <p className="mk-card-content">{note.content}</p>}

        {/* Tags */}
        {note.tags.length > 0 && (
          <div className="mk-card-tags">
            {note.tags.slice(0, 3).map((t) => (
              <span key={t} className="mk-tag">{t}</span>
            ))}
            {note.tags.length > 3 && <span className="mk-tag mk-tag-more">+{note.tags.length - 3}</span>}
          </div>
        )}

        {/* Room + attachments */}
        <div className="mk-card-meta">
          <div className="mk-card-meta-left">
            {note.room && (
              <span className="mk-card-room">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 4v16" /><path d="M2 8h18a2 2 0 012 2v10" /><path d="M2 17h20" /></svg>
                Camera {note.room.number}
              </span>
            )}
            {hasImages && (
              <span className="mk-card-attach">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 00-2.828 0L6 21" /></svg>
                {note.hotel_knowledge_attachments.length}
              </span>
            )}
          </div>
          <div className="mk-card-meta-right">
            <span className="mk-card-author">{note.author?.full_name ?? "—"}</span>
            <span className="mk-card-date">{fmtDateShort(note.updated_at)}</span>
          </div>
        </div>
      </div>
    );
  }

  /* ── Existing attachments (for edit modal) ── */
  const existingAtts = editingNote
    ? editingNote.hotel_knowledge_attachments.filter((a) => !removedAttIds.includes(a.id))
    : [];

  return (
    <>
      {/* ═══ HERO ═══ */}
      <div className="mk-hero">
        <div className="mk-hero-left">
          <h1 className="mk-hero-title">Memoria dell&apos;Hotel</h1>
          <p className="mk-hero-subtitle">Il sapere del tuo hotel, sempre a portata di mano</p>
          <span className="mk-hero-count">{totalCount} {totalCount === 1 ? "nota" : "note"}</span>
        </div>
        <button className="mk-hero-cta" onClick={openCreate}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          Aggiungi conoscenza
        </button>
      </div>

      {/* ═══ SEARCH ═══ */}
      <div className="mk-search-container">
        <div className="mk-search-wrap">
          <svg className="mk-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6C6B5D" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
          <input
            className="mk-search-input"
            type="text"
            placeholder="Cerca nella memoria dell'hotel..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {searchQuery && (
            <span className="mk-search-count">
              {filteredNotes.length} risultat{filteredNotes.length === 1 ? "o" : "i"}
            </span>
          )}
        </div>
      </div>

      {/* ═══ FILTERS ═══ */}
      <div className="mk-filter-bar">
        <div className="mk-category-scroll">
          {ALL_CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={`mk-cat-pill${filterCategory === cat ? " active" : ""}`}
              onClick={() => setFilterCategory(cat)}
            >
              {cat}
              {cat !== "Tutte" && categoryCounts[cat] ? (
                <span className="mk-cat-count">{categoryCounts[cat]}</span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="mk-importance-row">
          {IMPORTANCE_OPTIONS.map((opt) => (
            <button
              key={opt}
              className={`mk-imp-pill${filterImportance === opt ? " active" : ""}`}
              onClick={() => setFilterImportance(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ PINNED SECTION ═══ */}
      {pinnedNotes.length > 0 && !loading && (
        <div className="mk-pinned-section">
          <h2 className="mk-section-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#BFA762" stroke="#BFA762" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5M9 2h6l-1 7h4l-7 8V9H7l2-7z" /></svg>
            Fissate
          </h2>
          <div className="mk-grid">
            {pinnedNotes.map((n, i) => renderCard(n, i, true))}
          </div>
        </div>
      )}

      {/* ═══ MAIN GRID ═══ */}
      {loading ? (
        <div className="mk-skeleton-grid">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="mk-skeleton-card">
              <div className="mk-skel mk-skel-badge" />
              <div className="mk-skel mk-skel-title" />
              <div className="mk-skel mk-skel-text" />
              <div className="mk-skel mk-skel-text mk-skel-short" />
              <div className="mk-skel mk-skel-meta" />
            </div>
          ))}
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="mk-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#D8CCB8" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" /><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
          </svg>
          <div className="mk-empty-title">
            {searchQuery ? "Nessun risultato" : "Nessuna conoscenza ancora"}
          </div>
          <div className="mk-empty-text">
            {searchQuery
              ? "Prova con termini di ricerca diversi"
              : "Inizia a costruire la memoria del tuo hotel."}
          </div>
          {!searchQuery && (
            <button className="mk-hero-cta" style={{ marginTop: 16 }} onClick={openCreate}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              Aggiungi la prima nota
            </button>
          )}
        </div>
      ) : (
        <>
          {unpinnedNotes.length > 0 && pinnedNotes.length > 0 && (
            <h2 className="mk-section-title" style={{ marginTop: 8 }}>
              Tutte le note
              <span className="mk-section-count">{unpinnedNotes.length}</span>
            </h2>
          )}
          <div className="mk-grid">
            {(pinnedNotes.length > 0 ? unpinnedNotes : filteredNotes).map((n, i) => renderCard(n, i))}
          </div>
        </>
      )}

      {/* ═══ CREATE / EDIT MODAL ═══ */}
      <Modal isOpen={showForm} onClose={closeForm} title={editingNote ? "Modifica nota" : "Nuova conoscenza"} maxWidth={640}>
        <div className="mk-form">
          {/* Title */}
          <div className="mk-field">
            <label className="mk-label">Titolo *</label>
            <input className="mk-input" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Es. Procedura check-in ospiti VIP" />
          </div>

          {/* Content */}
          <div className="mk-field">
            <label className="mk-label">Contenuto</label>
            <textarea className="mk-textarea" rows={6} value={form.content} onChange={(e) => set("content", e.target.value)} placeholder="Descrivi la procedura, il sapere, la nota..." />
          </div>

          {/* Category + Importance */}
          <div className="mk-form-row">
            <div className="mk-field" style={{ flex: 1 }}>
              <label className="mk-label">Categoria</label>
              <select className="mk-select" value={form.category} onChange={(e) => set("category", e.target.value)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="mk-field" style={{ flex: 1 }}>
              <label className="mk-label">Importanza</label>
              <select className="mk-select" value={form.importance} onChange={(e) => set("importance", e.target.value)}>
                <option value="normale">Normale</option>
                <option value="importante">Importante</option>
                <option value="critico">Critico</option>
              </select>
            </div>
          </div>

          {/* Tags */}
          <div className="mk-field">
            <label className="mk-label">Tag</label>
            <div className="mk-tags-input-wrap">
              {form.tags.map((t) => (
                <span key={t} className="mk-tag-pill">
                  {t}
                  <button type="button" onClick={() => removeTag(t)} className="mk-tag-remove">&times;</button>
                </span>
              ))}
              <input
                className="mk-tag-input"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder={form.tags.length === 0 ? "Aggiungi tag e premi Invio" : ""}
              />
            </div>
          </div>

          {/* Room + Pin */}
          <div className="mk-form-row">
            <div className="mk-field" style={{ flex: 1 }}>
              <label className="mk-label">Camera collegata</label>
              <select className="mk-select" value={form.room_id} onChange={(e) => set("room_id", e.target.value)}>
                <option value="">Nessuna</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>Camera {r.number}{r.name ? ` — ${r.name}` : ""}</option>
                ))}
              </select>
            </div>
            <div className="mk-field" style={{ flex: 0, minWidth: 140 }}>
              <label className="mk-label">&nbsp;</label>
              <label className="mk-toggle-wrap">
                <input type="checkbox" checked={form.is_pinned} onChange={(e) => set("is_pinned", e.target.checked)} />
                <span className="mk-toggle-label">Fissa in alto</span>
              </label>
            </div>
          </div>

          {/* Attachments */}
          <div className="mk-field">
            <label className="mk-label">Allegati</label>
            <div
              className={`mk-dropzone${dragOver ? " active" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6C6B5D" strokeWidth="1.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              <span>Trascina file qui o clicca per selezionare</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={(e) => handleFiles(e.target.files)}
            />

            {/* Existing attachments */}
            {existingAtts.length > 0 && (
              <div className="mk-att-grid">
                {existingAtts.map((a) => (
                  <div key={a.id} className="mk-att-item">
                    {isImageType(a.file_type) ? (
                      <img src={a.file_url} alt={a.file_name} className="mk-att-thumb" />
                    ) : (
                      <div className="mk-att-file">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6C6B5D" strokeWidth="1.5" strokeLinecap="round"><path d="M15 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7z" /><path d="M14 2v4a2 2 0 002 2h4" /></svg>
                      </div>
                    )}
                    <span className="mk-att-name">{a.file_name}</span>
                    <button
                      type="button"
                      className="mk-att-remove"
                      onClick={() => setRemovedAttIds((p) => [...p, a.id])}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Pending files */}
            {pendingFiles.length > 0 && (
              <div className="mk-att-grid">
                {pendingFiles.map((f, i) => (
                  <div key={i} className="mk-att-item mk-att-pending">
                    {isImageType(f.type) ? (
                      <img src={URL.createObjectURL(f)} alt={f.name} className="mk-att-thumb" />
                    ) : (
                      <div className="mk-att-file">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6C6B5D" strokeWidth="1.5" strokeLinecap="round"><path d="M15 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7z" /><path d="M14 2v4a2 2 0 002 2h4" /></svg>
                      </div>
                    )}
                    <span className="mk-att-name">{f.name}</span>
                    <button type="button" className="mk-att-remove" onClick={() => removePendingFile(i)}>&times;</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mk-form-actions">
            <button className="mk-btn-primary" onClick={save} disabled={saving}>
              {saving ? "Salvataggio..." : editingNote ? "Aggiorna" : "Salva nota"}
            </button>
            <button className="mk-btn-secondary" onClick={closeForm}>Annulla</button>
          </div>
        </div>
      </Modal>

      {/* ═══ DETAIL MODAL ═══ */}
      <Modal isOpen={!!viewingNote} onClose={() => setViewingNote(null)} title="" maxWidth={700}>
        {viewingNote && (
          <div className="mk-detail">
            {/* Badges */}
            <div className="mk-detail-badges">
              <span className="mk-badge-cat">{viewingNote.category}</span>
              {viewingNote.importance !== "normale" && (
                <span
                  className="mk-badge-imp"
                  style={{
                    background: IMPORTANCE_COLORS[viewingNote.importance]?.bg,
                    color: IMPORTANCE_COLORS[viewingNote.importance]?.fg,
                  }}
                >
                  {viewingNote.importance === "critico" ? "Critico" : "Importante"}
                </span>
              )}
              {viewingNote.is_pinned && (
                <span className="mk-badge-pinned">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="#BFA762" stroke="#BFA762" strokeWidth="2"><path d="M12 17v5M9 2h6l-1 7h4l-7 8V9H7l2-7z" /></svg>
                  Fissata
                </span>
              )}
            </div>

            {/* Title */}
            <h2 className="mk-detail-title">{viewingNote.title}</h2>

            {/* Content */}
            {viewingNote.content && (
              <div className="mk-detail-content">{viewingNote.content}</div>
            )}

            {/* Tags */}
            {viewingNote.tags.length > 0 && (
              <div className="mk-detail-tags">
                {viewingNote.tags.map((t) => <span key={t} className="mk-tag">{t}</span>)}
              </div>
            )}

            {/* Room */}
            {viewingNote.room && (
              <div className="mk-detail-room">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6C6B5D" strokeWidth="2" strokeLinecap="round"><path d="M2 4v16" /><path d="M2 8h18a2 2 0 012 2v10" /><path d="M2 17h20" /></svg>
                Camera {viewingNote.room.number}{viewingNote.room.name ? ` — ${viewingNote.room.name}` : ""}
              </div>
            )}

            {/* Attachments gallery */}
            {viewingNote.hotel_knowledge_attachments.length > 0 && (
              <div className="mk-detail-gallery">
                <h4 className="mk-detail-gallery-title">Allegati</h4>
                <div className="mk-gallery-grid">
                  {viewingNote.hotel_knowledge_attachments.map((a) => (
                    <div key={a.id} className="mk-gallery-item">
                      {isImageType(a.file_type) ? (
                        <img
                          src={a.file_url}
                          alt={a.file_name}
                          className="mk-gallery-img"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLightboxUrl(a.file_url);
                          }}
                        />
                      ) : (
                        <a href={a.file_url} target="_blank" rel="noopener noreferrer" className="mk-gallery-file" onClick={(e) => e.stopPropagation()}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="1.5" strokeLinecap="round"><path d="M15 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7z" /><path d="M14 2v4a2 2 0 002 2h4" /></svg>
                          <span>{a.file_name}</span>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Meta */}
            <div className="mk-detail-meta">
              <span>Creata da <strong>{viewingNote.author?.full_name ?? "—"}</strong></span>
              <span>il {fmtDateShort(viewingNote.created_at)}</span>
              {viewingNote.updated_at !== viewingNote.created_at && (
                <span> · Aggiornata il {fmtDateShort(viewingNote.updated_at)}</span>
              )}
            </div>

            {/* Actions */}
            {canEdit(viewingNote) && (
              <div className="mk-detail-actions">
                <button
                  className="mk-btn-primary"
                  onClick={() => {
                    setViewingNote(null);
                    openEdit(viewingNote);
                  }}
                >
                  Modifica
                </button>
                <button
                  className="mk-btn-danger"
                  onClick={() => setDeleteId(viewingNote.id)}
                >
                  Elimina
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ═══ DELETE CONFIRMATION ═══ */}
      <Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)} title="Conferma eliminazione" maxWidth={420}>
        <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#6C6B5D", margin: "0 0 20px" }}>
          Questa azione è irreversibile. La nota e tutti i suoi allegati verranno eliminati definitivamente.
        </p>
        <div className="mk-form-actions">
          <button className="mk-btn-danger" onClick={() => deleteId && deleteNote(deleteId)}>Elimina definitivamente</button>
          <button className="mk-btn-secondary" onClick={() => setDeleteId(null)}>Annulla</button>
        </div>
      </Modal>

      {/* ═══ LIGHTBOX ═══ */}
      {lightboxUrl && (
        <div className="mk-lightbox" onClick={() => setLightboxUrl(null)}>
          <button className="mk-lightbox-close" onClick={() => setLightboxUrl(null)}>&times;</button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxUrl} alt="" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      <Toast toast={toast} />

      {/* ═══ STYLES ═══ */}
      <style>{`
        /* ── Full width ── */
        .wrap:has(.mk-hero){max-width:none;padding-left:24px;padding-right:24px}
        @media(min-width:1024px){.wrap:has(.mk-hero){padding-left:32px;padding-right:32px}}

        /* ── Hero ── */
        .mk-hero{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:24px;flex-wrap:wrap}
        .mk-hero-title{font-family:'Fraunces',serif;font-size:clamp(24px,4vw,32px);font-weight:500;color:#1F3326;margin:0;
          background:linear-gradient(135deg,#1F3326 60%,#BFA762);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .mk-hero-subtitle{font-family:'Albert Sans',sans-serif;font-size:14px;color:#6C6B5D;margin:6px 0 0}
        .mk-hero-count{display:inline-block;margin-top:10px;font-family:'Albert Sans',sans-serif;font-size:12px;font-weight:700;
          color:#BFA762;background:rgba(191,167,98,0.1);padding:4px 12px;border-radius:20px;letter-spacing:.5px}
        .mk-hero-cta{display:inline-flex;align-items:center;gap:8px;background:#1F3326;color:#FAF9F5;border:none;
          border-radius:10px;padding:12px 24px;font-family:'Albert Sans',sans-serif;font-size:14px;font-weight:600;
          cursor:pointer;transition:all .25s;white-space:nowrap}
        .mk-hero-cta:hover{background:#2a4535;transform:translateY(-2px);box-shadow:0 6px 20px rgba(31,51,38,0.2)}

        /* ── Search ── */
        .mk-search-container{background:rgba(255,255,255,0.65);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
          border:1px solid rgba(216,204,184,0.5);border-radius:16px;padding:16px;margin-bottom:16px}
        .mk-search-wrap{position:relative;display:flex;align-items:center}
        .mk-search-icon{position:absolute;left:14px;top:50%;transform:translateY(-50%);pointer-events:none}
        .mk-search-input{width:100%;padding:12px 14px 12px 44px;border:1px solid #D8CCB8;border-radius:12px;
          background:rgba(255,255,255,0.8);font-family:'Albert Sans',sans-serif;font-size:15px;color:#1F3326;transition:all .2s}
        .mk-search-input:focus{outline:none;border-color:#BFA762;box-shadow:0 0 0 3px rgba(191,167,98,0.15)}
        .mk-search-input::placeholder{color:#9c9a90}
        .mk-search-count{position:absolute;right:14px;top:50%;transform:translateY(-50%);font-family:'Albert Sans',sans-serif;
          font-size:12px;color:#6C6B5D;font-weight:600;white-space:nowrap}

        /* ── Filters ── */
        .mk-filter-bar{display:flex;flex-direction:column;gap:12px;margin-bottom:24px}
        .mk-category-scroll{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch}
        .mk-category-scroll::-webkit-scrollbar{height:0}
        .mk-cat-pill{display:inline-flex;align-items:center;gap:5px;padding:8px 16px;border:1px solid #D8CCB8;
          border-radius:24px;background:#fff;font-family:'Albert Sans',sans-serif;font-size:13px;font-weight:600;
          color:#6C6B5D;cursor:pointer;white-space:nowrap;transition:all .2s}
        .mk-cat-pill:hover{border-color:#BFA762;color:#1F3326}
        .mk-cat-pill.active{background:#1F3326;color:#FAF9F5;border-color:#1F3326;
          box-shadow:0 0 16px rgba(191,167,98,0.35)}
        .mk-cat-count{font-size:11px;opacity:.7}
        .mk-importance-row{display:flex;gap:6px}
        .mk-imp-pill{padding:6px 14px;border:1px solid #D8CCB8;border-radius:20px;background:#fff;
          font-family:'Albert Sans',sans-serif;font-size:12px;font-weight:600;color:#6C6B5D;cursor:pointer;transition:all .2s}
        .mk-imp-pill:hover{border-color:#BFA762}
        .mk-imp-pill.active{background:#BFA762;color:#fff;border-color:#BFA762}

        /* ── Section titles ── */
        .mk-section-title{display:flex;align-items:center;gap:8px;font-family:'Fraunces',serif;font-size:18px;
          font-weight:500;color:#1F3326;margin:0 0 16px}
        .mk-section-count{font-family:'Albert Sans',sans-serif;font-size:12px;color:#6C6B5D;font-weight:600}
        .mk-pinned-section{margin-bottom:28px}

        /* ── Grid ── */
        .mk-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
        @media(max-width:1200px){.mk-grid{grid-template-columns:repeat(2,1fr)}}
        @media(max-width:700px){.mk-grid{grid-template-columns:1fr}}

        /* ── Card ── */
        .mk-card{background:#fff;border:1px solid #D8CCB8;border-radius:12px;padding:20px;cursor:pointer;
          display:flex;flex-direction:column;gap:10px;
          box-shadow:0 1px 3px rgba(31,51,38,0.04),0 4px 12px rgba(31,51,38,0.03);
          opacity:0;transform:translateY(20px);
          transition:opacity .5s ease,transform .5s ease,box-shadow .3s ease}
        .mk-card.mk-visible{opacity:1;transform:translateY(0)}
        .mk-card:hover{box-shadow:0 8px 24px rgba(31,51,38,0.08),0 2px 8px rgba(31,51,38,0.05);transform:translateY(-4px)}
        .mk-card.mk-visible:hover{transform:translateY(-4px)}
        .mk-card-pinned{border:2px solid #BFA762;background:linear-gradient(135deg,#fff 0%,#FDF9F0 100%)}

        .mk-card-top{display:flex;align-items:center;justify-content:space-between;gap:6px}
        .mk-card-top-right{display:flex;align-items:center;gap:6px}
        .mk-badge-cat{display:inline-block;font-family:'Albert Sans',sans-serif;font-size:11px;font-weight:700;
          color:#1F3326;padding:3px 10px;border-radius:20px;border:1px solid rgba(191,167,98,0.4);
          background:rgba(191,167,98,0.08);white-space:nowrap}
        .mk-badge-imp{display:inline-block;font-family:'Albert Sans',sans-serif;font-size:10px;font-weight:700;
          padding:3px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:.5px}
        .mk-badge-pinned{display:inline-flex;align-items:center;gap:4px;font-family:'Albert Sans',sans-serif;
          font-size:11px;font-weight:700;color:#BFA762;padding:3px 10px;border-radius:20px;
          background:rgba(191,167,98,0.1)}

        .mk-pin-btn{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;
          background:transparent;border-radius:6px;cursor:pointer;transition:all .15s}
        .mk-pin-btn:hover{background:#F3EBDD}

        .mk-card-title{font-family:'Fraunces',serif;font-size:16px;font-weight:500;color:#1F3326;margin:0;line-height:1.3}
        .mk-card-content{font-family:'Albert Sans',sans-serif;font-size:13px;color:#6C6B5D;line-height:1.5;margin:0;
          display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .mk-card-tags{display:flex;flex-wrap:wrap;gap:4px}
        .mk-tag{display:inline-block;font-family:'Albert Sans',sans-serif;font-size:11px;font-weight:600;
          color:#5C7363;padding:2px 8px;border-radius:12px;background:rgba(92,115,99,0.08)}
        .mk-tag-more{color:#BFA762;background:rgba(191,167,98,0.1)}
        .mk-card-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto;padding-top:8px;
          border-top:1px solid #f0ede8}
        .mk-card-meta-left{display:flex;align-items:center;gap:8px}
        .mk-card-meta-right{display:flex;flex-direction:column;align-items:flex-end;gap:1px}
        .mk-card-room,.mk-card-attach{display:inline-flex;align-items:center;gap:4px;font-family:'Albert Sans',sans-serif;
          font-size:11px;color:#6C6B5D}
        .mk-card-author{font-family:'Albert Sans',sans-serif;font-size:11px;font-weight:600;color:#1F3326}
        .mk-card-date{font-family:'Albert Sans',sans-serif;font-size:10px;color:#9c9a90}

        /* ── Skeleton ── */
        .mk-skeleton-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
        @media(max-width:1200px){.mk-skeleton-grid{grid-template-columns:repeat(2,1fr)}}
        @media(max-width:700px){.mk-skeleton-grid{grid-template-columns:1fr}}
        .mk-skeleton-card{background:#fff;border:1px solid #D8CCB8;border-radius:12px;padding:20px;
          display:flex;flex-direction:column;gap:12px}
        .mk-skel{border-radius:6px;background:linear-gradient(90deg,#f0ede8 25%,#e8e4de 50%,#f0ede8 75%);
          background-size:200% 100%;animation:mkShimmer 1.5s infinite}
        .mk-skel-badge{width:80px;height:22px;border-radius:20px}
        .mk-skel-title{width:85%;height:20px}
        .mk-skel-text{width:100%;height:14px}
        .mk-skel-short{width:60%}
        .mk-skel-meta{width:40%;height:12px;margin-top:auto}
        @keyframes mkShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}

        /* ── Empty ── */
        .mk-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;
          text-align:center}
        .mk-empty-title{font-family:'Fraunces',serif;font-size:20px;color:#1F3326;margin-top:16px}
        .mk-empty-text{font-family:'Albert Sans',sans-serif;font-size:14px;color:#6C6B5D;margin-top:6px}

        /* ── Form ── */
        .mk-form{display:flex;flex-direction:column;gap:16px}
        .mk-form-row{display:flex;gap:12px}
        @media(max-width:500px){.mk-form-row{flex-direction:column}}
        .mk-field{display:flex;flex-direction:column;gap:4px}
        .mk-label{font-family:'Albert Sans',sans-serif;font-size:13px;font-weight:600;color:#1F3326}
        .mk-input,.mk-select,.mk-textarea{font-family:'Albert Sans',sans-serif;font-size:14px;color:#1F3326;
          border:1px solid #D8CCB8;border-radius:8px;padding:10px 12px;background:#fff;transition:border-color .2s}
        .mk-input:focus,.mk-select:focus,.mk-textarea:focus{outline:none;border-color:#BFA762;box-shadow:0 0 0 3px rgba(191,167,98,0.12)}
        .mk-textarea{resize:vertical;min-height:100px;line-height:1.6}
        .mk-select{-webkit-appearance:none;appearance:none;
          background-image:url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236C6B5D' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
          background-repeat:no-repeat;background-position:right 12px center;padding-right:32px}

        /* Tags input */
        .mk-tags-input-wrap{display:flex;flex-wrap:wrap;gap:6px;padding:8px 10px;border:1px solid #D8CCB8;
          border-radius:8px;min-height:42px;align-items:center;cursor:text;transition:border-color .2s}
        .mk-tags-input-wrap:focus-within{border-color:#BFA762;box-shadow:0 0 0 3px rgba(191,167,98,0.12)}
        .mk-tag-pill{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:16px;
          background:#F3EBDD;font-family:'Albert Sans',sans-serif;font-size:12px;font-weight:600;color:#1F3326}
        .mk-tag-remove{display:flex;align-items:center;justify-content:center;width:16px;height:16px;border:none;
          background:rgba(31,51,38,0.1);border-radius:50%;cursor:pointer;font-size:12px;line-height:1;color:#1F3326;padding:0}
        .mk-tag-remove:hover{background:rgba(31,51,38,0.2)}
        .mk-tag-input{flex:1;min-width:80px;border:none;outline:none;font-family:'Albert Sans',sans-serif;
          font-size:13px;padding:2px 0;background:transparent;color:#1F3326}

        /* Toggle */
        .mk-toggle-wrap{display:flex;align-items:center;gap:8px;padding:10px 0;cursor:pointer;
          font-family:'Albert Sans',sans-serif;font-size:14px;color:#1F3326}
        .mk-toggle-wrap input{width:18px;height:18px;accent-color:#BFA762;cursor:pointer}
        .mk-toggle-label{font-weight:500}

        /* Dropzone */
        .mk-dropzone{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;
          padding:24px;border:2px dashed #D8CCB8;border-radius:12px;cursor:pointer;transition:all .2s;
          font-family:'Albert Sans',sans-serif;font-size:13px;color:#6C6B5D}
        .mk-dropzone:hover,.mk-dropzone.active{border-color:#BFA762;background:rgba(191,167,98,0.05)}

        /* Attachment grid */
        .mk-att-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-top:10px}
        .mk-att-item{position:relative;border:1px solid #D8CCB8;border-radius:8px;overflow:hidden;
          display:flex;flex-direction:column;align-items:center;padding:8px}
        .mk-att-pending{border-style:dashed;background:#FAFAF5}
        .mk-att-thumb{width:100%;height:80px;object-fit:cover;border-radius:4px}
        .mk-att-file{display:flex;align-items:center;justify-content:center;width:100%;height:80px;
          background:#F3EBDD;border-radius:4px}
        .mk-att-name{font-family:'Albert Sans',sans-serif;font-size:10px;color:#6C6B5D;margin-top:4px;
          text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%}
        .mk-att-remove{position:absolute;top:4px;right:4px;width:20px;height:20px;border:none;
          background:rgba(0,0,0,0.5);color:#fff;border-radius:50%;cursor:pointer;font-size:14px;
          display:flex;align-items:center;justify-content:center;line-height:1;padding:0}
        .mk-att-remove:hover{background:rgba(0,0,0,0.7)}

        /* Buttons */
        .mk-form-actions{display:flex;gap:10px;margin-top:4px}
        .mk-btn-primary{display:inline-flex;align-items:center;gap:6px;background:#1F3326;color:#FAF9F5;border:none;
          border-radius:8px;padding:12px 24px;font-family:'Albert Sans',sans-serif;font-size:14px;font-weight:600;
          cursor:pointer;transition:all .2s}
        .mk-btn-primary:hover{background:#2a4535}
        .mk-btn-primary:disabled{opacity:.6;cursor:not-allowed}
        .mk-btn-secondary{display:inline-flex;align-items:center;gap:6px;background:#fff;color:#1F3326;
          border:1px solid #D8CCB8;border-radius:8px;padding:12px 24px;font-family:'Albert Sans',sans-serif;
          font-size:14px;font-weight:600;cursor:pointer;transition:all .2s}
        .mk-btn-secondary:hover{background:#F3EBDD;border-color:#BFA762}
        .mk-btn-danger{display:inline-flex;align-items:center;gap:6px;background:#9E3B2E;color:#fff;border:none;
          border-radius:8px;padding:12px 24px;font-family:'Albert Sans',sans-serif;font-size:14px;font-weight:600;
          cursor:pointer;transition:all .2s}
        .mk-btn-danger:hover{background:#832e23}

        /* ── Detail modal ── */
        .mk-detail{display:flex;flex-direction:column;gap:16px}
        .mk-detail-badges{display:flex;flex-wrap:wrap;gap:6px}
        .mk-detail-title{font-family:'Fraunces',serif;font-size:24px;font-weight:500;color:#1F3326;margin:0;line-height:1.3}
        .mk-detail-content{font-family:'Albert Sans',sans-serif;font-size:14px;color:#3a3a3a;line-height:1.7;
          white-space:pre-wrap;word-break:break-word}
        .mk-detail-tags{display:flex;flex-wrap:wrap;gap:6px}
        .mk-detail-room{display:flex;align-items:center;gap:8px;font-family:'Albert Sans',sans-serif;font-size:13px;
          color:#6C6B5D;padding:8px 12px;background:#F3EBDD;border-radius:8px}
        .mk-detail-gallery{margin-top:4px}
        .mk-detail-gallery-title{font-family:'Albert Sans',sans-serif;font-size:13px;font-weight:700;
          color:#1F3326;margin:0 0 8px;text-transform:uppercase;letter-spacing:.5px}
        .mk-gallery-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}
        .mk-gallery-img{width:100%;height:120px;object-fit:cover;border-radius:8px;cursor:pointer;
          transition:transform .2s}
        .mk-gallery-img:hover{transform:scale(1.03)}
        .mk-gallery-file{display:flex;flex-direction:column;align-items:center;gap:6px;padding:16px;
          background:#F3EBDD;border-radius:8px;text-decoration:none;font-family:'Albert Sans',sans-serif;
          font-size:12px;color:#1F3326;font-weight:600;transition:background .2s}
        .mk-gallery-file:hover{background:#EDE5D5}
        .mk-detail-meta{display:flex;flex-wrap:wrap;gap:4px;font-family:'Albert Sans',sans-serif;font-size:12px;
          color:#6C6B5D;padding-top:12px;border-top:1px solid #f0ede8}
        .mk-detail-actions{display:flex;gap:10px;padding-top:8px}

        /* ── Lightbox ── */
        .mk-lightbox{position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:300;display:flex;
          align-items:center;justify-content:center;cursor:pointer;padding:20px}
        .mk-lightbox img{max-width:90vw;max-height:90vh;object-fit:contain;border-radius:8px;cursor:default}
        .mk-lightbox-close{position:absolute;top:20px;right:20px;width:40px;height:40px;border:none;
          background:rgba(255,255,255,0.15);color:#fff;font-size:24px;border-radius:50%;cursor:pointer;
          display:flex;align-items:center;justify-content:center;transition:background .2s}
        .mk-lightbox-close:hover{background:rgba(255,255,255,0.3)}

        /* ── Responsive ── */
        @media(max-width:600px){
          .mk-hero{flex-direction:column;align-items:stretch}
          .mk-hero-cta{justify-content:center}
          .mk-filter-bar{gap:10px}
          .mk-form-actions{flex-direction:column}
          .mk-form-actions button{justify-content:center}
          .mk-detail-actions{flex-direction:column}
          .mk-detail-actions button{justify-content:center}
        }

        /* ── Animations ── */
        @keyframes mkFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .mk-hero,.mk-search-container,.mk-filter-bar,.mk-pinned-section{animation:mkFadeIn .4s ease both}
        .mk-search-container{animation-delay:.05s}
        .mk-filter-bar{animation-delay:.1s}
        .mk-pinned-section{animation-delay:.15s}
      `}</style>
    </>
  );
}
