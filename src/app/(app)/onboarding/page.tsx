"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Modal } from "@/components/ui/Modal";
import { useRole } from "@/lib/useRole";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/Toast";
import { generateSummaryPdf } from "@/lib/recruitment-pdf";
import type { RecruitmentCandidate } from "@/lib/recruitment-pdf";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type CandidateRow = {
  id: string; first_name: string; last_name: string;
  position_applied: string | null; outcome: string; rating: number | null;
  current_phase: number; completed_phases: number[];
  created_at: string; converted: boolean; converted_to: string | null;
  signature_url: string | null; signed_document_url: string | null;
  evaluation_score: number | null;
  can_start_date: string | null; has_car: boolean;
};

const OUTCOME_KEYS = ["in_valutazione", "da_richiamare", "idoneo", "non_idoneo"] as const;
const OUTCOME_LABELS: Record<string, string> = {
  da_richiamare: "Da richiamare", in_valutazione: "In valutazione",
  idoneo: "Idoneo", non_idoneo: "Non idoneo",
};
const OUTCOME_COLORS: Record<string, { bg: string; text: string }> = {
  da_richiamare: { bg: "#F3EBDD", text: "#6C6B5D" },
  in_valutazione: { bg: "#FFF8E1", text: "#BFA762" },
  idoneo: { bg: "#E8F5E9", text: "#2D5A3D" },
  non_idoneo: { bg: "#FDECEB", text: "#B3261E" },
};
const PHASE_LABELS = ["", "Anagrafici", "Esperienza", "Valutazione", "Documenti", "Privacy", "Esito"];

const SORT_OPTIONS = [
  { value: "score_desc", label: "Punteggio (alto → basso)" },
  { value: "date_desc", label: "Data colloquio (recenti)" },
  { value: "date_asc", label: "Data colloquio (meno recenti)" },
  { value: "rating_desc", label: "Rating (alto → basso)" },
  { value: "name_asc", label: "Nome (A → Z)" },
];

type SortKey = typeof SORT_OPTIONS[number]["value"];

function sortCandidates(list: CandidateRow[], key: SortKey): CandidateRow[] {
  const sorted = [...list];
  switch (key) {
    case "score_desc": return sorted.sort((a, b) => (b.evaluation_score ?? -1) - (a.evaluation_score ?? -1));
    case "date_desc": return sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
    case "date_asc": return sorted.sort((a, b) => a.created_at.localeCompare(b.created_at));
    case "rating_desc": return sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    case "name_asc": return sorted.sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`));
    default: return sorted;
  }
}

function scoreColor(score: number | null): string {
  if (score == null) return "#D8CCB8";
  if (score >= 85) return "#2D5A3D";
  if (score >= 70) return "#BFA762";
  if (score >= 55) return "#6C6B5D";
  return "#9E3B2E";
}

function PhaseDots({ current, completed }: { current: number; completed: number[] }) {
  return (
    <div className="rc-dots">
      {[1, 2, 3, 4, 5, 6].map(p => (
        <span key={p} className={`rc-dot${completed.includes(p) ? " rc-dot-done" : p === current ? " rc-dot-current" : ""}`}
          title={`Fase ${p}: ${PHASE_LABELS[p]}`} />
      ))}
    </div>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <div className="rc-stars-ro">
      {[1, 2, 3, 4, 5].map(s => (
        <svg key={s} width="16" height="16" viewBox="0 0 24 24" fill={s <= value ? "#BFA762" : "none"} stroke="#BFA762" strokeWidth="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}

function storagePathFromUrl(url: string): string {
  const idx = url.indexOf("/recruitment-files/");
  return idx >= 0 ? decodeURIComponent(url.substring(idx + "/recruitment-files/".length)) : "";
}

function CarIcon({ hasCar }: { hasCar: boolean }) {
  if (!hasCar) return null;
  return (
    <span className="rc-car-badge" title="Automunito">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 17h14v-5l-2-6H7L5 12v5z" /><circle cx="7.5" cy="17.5" r="1.5" /><circle cx="16.5" cy="17.5" r="1.5" />
      </svg>
    </span>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { isAdmin, isManager, loading: roleLoading, userId } = useRole();
  const { toast, showToast } = useToast();

  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterOutcome, setFilterOutcome] = useState("");
  const [filterPosition, setFilterPosition] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("score_desc");
  const [view, setView] = useState<"active" | "archive">("active");

  const [showNew, setShowNew] = useState(false);
  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");
  const [newPos, setNewPos] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const loadCandidates = useCallback(async () => {
    const { data } = await supabase.from("recruitment_candidates")
      .select("id, first_name, last_name, position_applied, outcome, rating, current_phase, completed_phases, created_at, converted, converted_to, signature_url, signed_document_url, evaluation_score, can_start_date, has_car")
      .order("created_at", { ascending: false });
    setCandidates((data ?? []) as CandidateRow[]);
  }, []);

  useEffect(() => {
    if (roleLoading) return;
    loadCandidates().then(() => setLoading(false));
  }, [roleLoading, loadCandidates]);

  useEffect(() => {
    if (loading || !gridRef.current) return;
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { (e.target as HTMLElement).classList.add("rc-visible"); obs.unobserve(e.target); } });
    }, { threshold: 0.1 });
    gridRef.current.querySelectorAll(".rc-card").forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [loading, candidates, view, filterOutcome, filterPosition, sortKey, search]);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(null);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  async function createCandidate() {
    if (!newFirst.trim() || !newLast.trim()) { showToast("Nome e cognome obbligatori", "warn"); return; }
    setSaving(true);
    const { data, error } = await supabase.from("recruitment_candidates").insert({
      first_name: newFirst.trim(), last_name: newLast.trim(),
      position_applied: newPos.trim() || null, created_by: userId,
    }).select("id").single();
    if (error || !data) {
      showToast(error?.message || "Errore creazione candidato", "error");
      setSaving(false);
      return;
    }
    router.push(`/onboarding/${data.id}`);
  }

  async function deleteCandidate(id: string) {
    const [{ data: docs }, { data: cand }] = await Promise.all([
      supabase.from("recruitment_documents").select("file_url").eq("candidate_id", id),
      supabase.from("recruitment_candidates").select("signature_url, signed_document_url").eq("id", id).single(),
    ]);
    const urls: string[] = [];
    docs?.forEach(d => { if (d.file_url) urls.push(d.file_url); });
    if (cand?.signature_url) urls.push(cand.signature_url);
    if (cand?.signed_document_url) urls.push(cand.signed_document_url);
    const paths = urls.map(storagePathFromUrl).filter(Boolean);
    if (paths.length) await supabase.storage.from("recruitment-files").remove(paths);
    await supabase.from("recruitment_candidates").delete().eq("id", id);
    showToast("Candidato eliminato", "ok");
    setDeleteId(null);
    setMenuOpen(null);
    loadCandidates();
  }

  async function changeOutcome(id: string, newOutcome: string) {
    const { error } = await supabase.from("recruitment_candidates").update({ outcome: newOutcome }).eq("id", id);
    if (error) { showToast("Errore aggiornamento esito", "error"); return; }
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, outcome: newOutcome } : c));
    showToast(`Esito aggiornato: ${OUTCOME_LABELS[newOutcome]}`, "ok");
  }

  async function downloadPdf(id: string) {
    setPdfLoading(id);
    try {
      const { data, error } = await supabase.from("recruitment_candidates").select("*").eq("id", id).single();
      if (error || !data) { showToast("Errore caricamento dati candidato", "error"); return; }
      const cand = data as unknown as RecruitmentCandidate;
      if (!cand.documents_checklist) cand.documents_checklist = [];
      if (!cand.follow_up_interviews) cand.follow_up_interviews = [];
      await generateSummaryPdf(cand);
      showToast("PDF generato", "ok");
    } catch {
      showToast("Errore generazione PDF", "error");
    } finally {
      setPdfLoading(null);
      setMenuOpen(null);
    }
  }

  const positions = Array.from(new Set(candidates.map(c => c.position_applied).filter(Boolean))) as string[];

  const isArchived = (c: CandidateRow) => c.converted || c.outcome === "non_idoneo";

  const viewFiltered = candidates.filter(c => view === "active" ? !isArchived(c) : isArchived(c));

  const filtered = viewFiltered.filter(c => {
    if (search) { const s = search.toLowerCase(); if (!(c.first_name + " " + c.last_name).toLowerCase().includes(s)) return false; }
    if (filterOutcome) {
      if (filterOutcome === "convertiti") { if (!c.converted) return false; }
      else if (c.outcome !== filterOutcome) return false;
    }
    if (filterPosition && c.position_applied !== filterPosition) return false;
    return true;
  });

  const sorted = sortCandidates(filtered, sortKey);

  const inVal = candidates.filter(c => c.outcome === "in_valutazione").length;
  const idonei = candidates.filter(c => c.outcome === "idoneo" && !c.converted).length;
  const convertiti = candidates.filter(c => c.converted).length;
  const daRich = candidates.filter(c => c.outcome === "da_richiamare").length;

  const archiveOutcomes = view === "archive"
    ? [{ value: "", label: "Tutti" }, { value: "convertiti", label: "Convertiti" }, { value: "non_idoneo", label: "Non idonei" }]
    : Object.entries(OUTCOME_LABELS).filter(([k]) => k !== "non_idoneo").map(([k, v]) => ({ value: k, label: v }));

  if (loading) return (
    <div className="rc-page">
      <div className="rc-hero"><div className="rc-skel rc-skel-title" /><div className="rc-skel rc-skel-sub" /></div>
      <div className="rc-stats">{[1, 2, 3, 4].map(i => <div key={i} className="rc-skel rc-skel-stat" />)}</div>
      <div className="rc-grid">{[1, 2, 3].map(i => <div key={i} className="rc-skel rc-skel-card" />)}</div>
      <style>{CSS}</style>
    </div>
  );

  return (
    <div className="rc-page">
      {/* Hero */}
      <div className="rc-hero">
        <div>
          <h1 className="rc-title">Recruiting</h1>
          <p className="rc-subtitle">Selezione e inserimento nuovo personale</p>
        </div>
        <button className="rc-btn-primary rc-btn-lg" onClick={() => { setNewFirst(""); setNewLast(""); setNewPos(""); setSaving(false); setShowNew(true); }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Nuovo colloquio
        </button>
      </div>

      {/* Stats — always from full dataset */}
      <div className="rc-stats">
        <div className="rc-stat" style={{ borderTop: "3px solid #BFA762" }}><span className="rc-stat-num">{inVal}</span><span className="rc-stat-label">In valutazione</span></div>
        <div className="rc-stat" style={{ borderTop: "3px solid #2D5A3D" }}><span className="rc-stat-num">{idonei}</span><span className="rc-stat-label">Idonei</span></div>
        <div className="rc-stat" style={{ borderTop: "3px solid #4F7B8C" }}><span className="rc-stat-num">{convertiti}</span><span className="rc-stat-label">Convertiti</span></div>
        <div className="rc-stat" style={{ borderTop: "3px solid #6C6B5D" }}><span className="rc-stat-num">{daRich}</span><span className="rc-stat-label">Da richiamare</span></div>
      </div>

      {/* View tabs */}
      <div className="rc-tabs">
        <button className={`rc-tab${view === "active" ? " rc-tab-on" : ""}`} onClick={() => { setView("active"); setFilterOutcome(""); }}>
          Candidati attivi
          <span className="rc-tab-count">{candidates.filter(c => !isArchived(c)).length}</span>
        </button>
        <button className={`rc-tab${view === "archive" ? " rc-tab-on" : ""}`} onClick={() => { setView("archive"); setFilterOutcome(""); }}>
          Archivio
          <span className="rc-tab-count">{candidates.filter(c => isArchived(c)).length}</span>
        </button>
      </div>

      {/* Filters + Sort */}
      <div className="rc-filters">
        <input className="rc-input rc-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca per nome..." />
        <select className="rc-input rc-filter-sel" value={filterOutcome} onChange={e => setFilterOutcome(e.target.value)}>
          <option value="">{view === "active" ? "Tutti gli esiti" : "Tutti"}</option>
          {archiveOutcomes.filter(o => o.value).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {positions.length > 0 && (
          <select className="rc-input rc-filter-sel" value={filterPosition} onChange={e => setFilterPosition(e.target.value)}>
            <option value="">Tutte le posizioni</option>
            {positions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        <select className="rc-input rc-filter-sel" value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}>
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Grid */}
      {sorted.length === 0 ? (
        <div className="rc-empty">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#D8CCB8" strokeWidth="1.5" strokeLinecap="round">
            <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
          </svg>
          <p className="rc-empty-title">{view === "active" ? "Nessun candidato attivo" : "Nessun candidato in archivio"}</p>
          <p className="rc-empty-sub">{view === "active" ? "Avvia il primo colloquio con il bottone in alto" : "I candidati convertiti e non idonei appariranno qui"}</p>
        </div>
      ) : (
        <div className="rc-grid" ref={gridRef}>
          {sorted.map((c, idx) => {
            const oc = OUTCOME_COLORS[c.outcome] ?? OUTCOME_COLORS.in_valutazione;
            const sc = scoreColor(c.evaluation_score);
            return (
              <div key={c.id} className="rc-card" style={{ transitionDelay: `${Math.min(idx, 8) * 50}ms` }}
                onClick={() => router.push(`/onboarding/${c.id}`)}>

                {/* Top: name + badge + actions */}
                <div className="rc-card-top">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 className="rc-card-name">{c.first_name} {c.last_name}</h3>
                    <span className="rc-card-pos">{c.position_applied || "Posizione non specificata"}</span>
                  </div>
                  <div className="rc-card-top-right">
                    {c.evaluation_score != null && (
                      <span className="rc-score-pill" style={{ background: sc, color: "#fff" }} title={`Punteggio valutazione: ${c.evaluation_score}/100`}>
                        {c.evaluation_score}
                      </span>
                    )}
                    <span className="rc-badge" style={{ background: oc.bg, color: oc.text }}>
                      {c.converted ? `Convertito → ${c.converted_to === "dipendente" ? "Dip." : "A chiam."}` : OUTCOME_LABELS[c.outcome]}
                    </span>
                  </div>
                </div>

                {/* Mid: phase dots + meta badges */}
                <div className="rc-card-mid">
                  <PhaseDots current={c.current_phase} completed={c.completed_phases} />
                  <span className="rc-card-phase">Fase {c.current_phase}/6</span>
                  <CarIcon hasCar={c.has_car} />
                </div>

                {/* Info row: rating, start date, created date */}
                <div className="rc-card-bottom">
                  <div className="rc-card-bottom-left">
                    {c.rating != null && c.rating > 0 ? <Stars value={c.rating} /> : <span className="rc-card-norating">—</span>}
                    {c.can_start_date && (
                      <span className="rc-card-start" title="Disponibile dal">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        {new Date(c.can_start_date).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}
                      </span>
                    )}
                  </div>
                  <span className="rc-card-date">{new Date(c.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}</span>
                </div>

                {/* Actions row: quick outcome + menu */}
                <div className="rc-card-actions" onClick={e => e.stopPropagation()}>
                  {!c.converted && (
                    <select
                      className="rc-outcome-sel"
                      value={c.outcome}
                      onChange={e => changeOutcome(c.id, e.target.value)}
                    >
                      {OUTCOME_KEYS.map(k => <option key={k} value={k}>{OUTCOME_LABELS[k]}</option>)}
                    </select>
                  )}
                  <div className="rc-menu-wrap" ref={menuOpen === c.id ? menuRef : undefined}>
                    <button className="rc-menu-btn" title="Azioni" onClick={() => setMenuOpen(menuOpen === c.id ? null : c.id)}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
                    </button>
                    {menuOpen === c.id && (
                      <div className="rc-menu-drop">
                        <button className="rc-menu-item" onClick={() => { setMenuOpen(null); router.push(`/onboarding/${c.id}`); }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                          Apri
                        </button>
                        <button className="rc-menu-item" onClick={() => downloadPdf(c.id)} disabled={pdfLoading === c.id}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                          {pdfLoading === c.id ? "Generazione..." : "Scarica PDF"}
                        </button>
                        {(isAdmin || isManager) && (
                          <button className="rc-menu-item rc-menu-item-danger" onClick={() => { setMenuOpen(null); setDeleteId(c.id); }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                            Elimina
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Modal */}
      <Modal isOpen={showNew} onClose={() => setShowNew(false)} title="Nuovo colloquio" maxWidth={480}>
        <div className="rc-form">
          <label className="rc-label">Nome *</label>
          <input className="rc-input" value={newFirst} onChange={e => setNewFirst(e.target.value)} placeholder="Mario" autoFocus />
          <label className="rc-label">Cognome *</label>
          <input className="rc-input" value={newLast} onChange={e => setNewLast(e.target.value)} placeholder="Rossi" />
          <label className="rc-label">Posizione</label>
          <input className="rc-input" value={newPos} onChange={e => setNewPos(e.target.value)} placeholder="es. Receptionist" />
          <div className="rc-form-actions">
            <button className="rc-btn-secondary" onClick={() => setShowNew(false)}>Annulla</button>
            <button className="rc-btn-primary" onClick={createCandidate} disabled={saving}>{saving ? "Creazione..." : "Avvia colloquio"}</button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)} title="Conferma eliminazione" maxWidth={420}>
        <div className="rc-form">
          <p style={{ fontFamily: "'Albert Sans',sans-serif", fontSize: 15, color: "#1F3326" }}>
            Eliminare questo candidato e tutti i file collegati? L&apos;azione è irreversibile.
          </p>
          <div className="rc-form-actions">
            <button className="rc-btn-secondary" onClick={() => setDeleteId(null)}>Annulla</button>
            <button className="rc-btn-danger" onClick={() => deleteId && deleteCandidate(deleteId)}>Elimina</button>
          </div>
        </div>
      </Modal>

      <Toast toast={toast} />
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.rc-page { padding: 24px 32px; min-height: 100vh; }
.rc-hero { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 28px; flex-wrap: wrap; }
.rc-title { font-family: 'Fraunces', serif; font-size: 34px; font-weight: 600; color: #1F3326; margin: 0; }
.rc-subtitle { font-family: 'Albert Sans', sans-serif; font-size: 16px; color: #6C6B5D; margin: 6px 0 0; }

.rc-btn-primary { display: inline-flex; align-items: center; gap: 8px; padding: 12px 22px; background: #1F3326; color: #FAF9F5; border: none; border-radius: 8px; font-family: 'Albert Sans', sans-serif; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
.rc-btn-primary:hover { background: #2a4a35; }
.rc-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.rc-btn-lg { padding: 14px 28px; font-size: 16px; }
.rc-btn-secondary { display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px; background: #fff; color: #1F3326; border: 1px solid #D8CCB8; border-radius: 8px; font-family: 'Albert Sans', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; }
.rc-btn-secondary:hover { background: #F3EBDD; }
.rc-btn-danger { display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px; background: #B3261E; color: #fff; border: none; border-radius: 8px; font-family: 'Albert Sans', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; }
.rc-btn-danger:hover { background: #8c1d17; }

.rc-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px; }
.rc-stat { background: #fff; border: 1px solid #D8CCB8; border-radius: 12px; padding: 20px; text-align: center; }
.rc-stat-num { display: block; font-family: 'Bebas Neue', sans-serif; font-size: 42px; color: #1F3326; line-height: 1; }
.rc-stat-label { font-family: 'Albert Sans', sans-serif; font-size: 14px; color: #6C6B5D; margin-top: 4px; display: block; }

/* Tabs */
.rc-tabs { display: flex; gap: 0; margin-bottom: 20px; border-bottom: 2px solid #F3EBDD; }
.rc-tab { display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px; background: none; border: none; border-bottom: 3px solid transparent; margin-bottom: -2px; font-family: 'Albert Sans', sans-serif; font-size: 15px; font-weight: 600; color: #6C6B5D; cursor: pointer; transition: color 0.2s, border-color 0.2s; }
.rc-tab:hover { color: #1F3326; }
.rc-tab-on { color: #1F3326; border-bottom-color: #BFA762; }
.rc-tab-count { background: #F3EBDD; color: #6C6B5D; font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 10px; }
.rc-tab-on .rc-tab-count { background: #BFA762; color: #fff; }

.rc-filters { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
.rc-input { font-family: 'Albert Sans', sans-serif; font-size: 15px; border: 1px solid #D8CCB8; border-radius: 8px; padding: 10px 14px; color: #1F3326; background: #fff; outline: none; transition: border-color 0.2s; }
.rc-input:focus { border-color: #BFA762; }
.rc-search { flex: 1; min-width: 200px; }
.rc-filter-sel { min-width: 160px; }

.rc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 16px; }
.rc-card { position: relative; background: #fff; border: 1px solid #D8CCB8; border-radius: 12px; padding: 20px; cursor: pointer; transition: transform 0.25s ease, box-shadow 0.25s ease, opacity 0.4s ease; opacity: 0; transform: translateY(14px); display: flex; flex-direction: column; gap: 10px; }
.rc-card.rc-visible { opacity: 1; transform: translateY(0); }
.rc-card:hover { transform: translateY(-4px); box-shadow: 0 10px 28px rgba(31,51,38,0.09); }

.rc-card-top { display: flex; align-items: flex-start; gap: 12px; }
.rc-card-top-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.rc-card-name { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 600; color: #1F3326; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rc-card-pos { font-family: 'Albert Sans', sans-serif; font-size: 15px; color: #6C6B5D; display: block; margin-top: 2px; }

.rc-score-pill { display: inline-flex; align-items: center; justify-content: center; min-width: 36px; height: 28px; border-radius: 8px; font-family: 'Bebas Neue', sans-serif; font-size: 18px; padding: 0 6px; letter-spacing: 0.5px; }

.rc-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-family: 'Albert Sans', sans-serif; font-size: 13px; font-weight: 600; white-space: nowrap; flex-shrink: 0; }

.rc-card-mid { display: flex; align-items: center; gap: 10px; }
.rc-dots { display: flex; gap: 6px; }
.rc-dot { width: 10px; height: 10px; border-radius: 50%; background: #D8CCB8; transition: background 0.2s; }
.rc-dot-done { background: #2D5A3D; }
.rc-dot-current { background: #BFA762; box-shadow: 0 0 0 3px rgba(191,167,98,0.25); }
.rc-card-phase { font-family: 'Albert Sans', sans-serif; font-size: 13px; color: #6C6B5D; }
.rc-car-badge { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 6px; background: #E8F5E9; color: #2D5A3D; margin-left: auto; flex-shrink: 0; }

.rc-card-bottom { display: flex; align-items: center; justify-content: space-between; }
.rc-card-bottom-left { display: flex; align-items: center; gap: 12px; }
.rc-stars-ro { display: flex; gap: 2px; }
.rc-card-norating { font-family: 'Albert Sans', sans-serif; font-size: 14px; color: #D8CCB8; }
.rc-card-start { display: inline-flex; align-items: center; gap: 4px; font-family: 'Albert Sans', sans-serif; font-size: 12px; color: #4F7B8C; background: #EDF4F7; padding: 3px 8px; border-radius: 6px; white-space: nowrap; }
.rc-card-date { font-family: 'Albert Sans', sans-serif; font-size: 13px; color: #6C6B5D; }

/* Actions row */
.rc-card-actions { display: flex; align-items: center; gap: 8px; padding-top: 8px; border-top: 1px solid #F3EBDD; }
.rc-outcome-sel { font-family: 'Albert Sans', sans-serif; font-size: 13px; padding: 6px 10px; border: 1px solid #D8CCB8; border-radius: 6px; background: #FAF9F5; color: #1F3326; cursor: pointer; outline: none; flex: 1; min-width: 0; }
.rc-outcome-sel:focus { border-color: #BFA762; }

.rc-menu-wrap { position: relative; margin-left: auto; }
.rc-menu-btn { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 8px; border: 1px solid #D8CCB8; background: #fff; cursor: pointer; color: #6C6B5D; transition: background 0.15s, color 0.15s; }
.rc-menu-btn:hover { background: #F3EBDD; color: #1F3326; }
.rc-menu-drop { position: absolute; right: 0; top: calc(100% + 4px); z-index: 50; min-width: 180px; background: #fff; border: 1px solid #D8CCB8; border-radius: 10px; box-shadow: 0 8px 24px rgba(31,51,38,0.12); overflow: hidden; }
.rc-menu-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 12px 16px; border: none; background: none; font-family: 'Albert Sans', sans-serif; font-size: 14px; color: #1F3326; cursor: pointer; text-align: left; transition: background 0.15s; }
.rc-menu-item:hover { background: #F3EBDD; }
.rc-menu-item:disabled { opacity: 0.5; cursor: not-allowed; }
.rc-menu-item-danger { color: #B3261E; }
.rc-menu-item-danger:hover { background: #FDECEB; }

.rc-empty { text-align: center; padding: 56px 24px; }
.rc-empty-title { font-family: 'Fraunces', serif; font-size: 20px; color: #1F3326; margin: 16px 0 6px; }
.rc-empty-sub { font-family: 'Albert Sans', sans-serif; font-size: 15px; color: #6C6B5D; margin: 0; }

.rc-form { display: flex; flex-direction: column; gap: 14px; }
.rc-label { font-family: 'Albert Sans', sans-serif; font-size: 14px; font-weight: 600; color: #1F3326; margin-bottom: -6px; }
.rc-form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 8px; }

.rc-skel { background: linear-gradient(90deg, #F3EBDD 25%, #FAF9F5 50%, #F3EBDD 75%); background-size: 200% 100%; animation: rc-shimmer 1.5s ease-in-out infinite; border-radius: 8px; }
@keyframes rc-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.rc-skel-title { width: 220px; height: 40px; margin-bottom: 8px; }
.rc-skel-sub { width: 320px; height: 20px; }
.rc-skel-stat { height: 100px; }
.rc-skel-card { height: 220px; }

@media (max-width: 768px) {
  .rc-page { padding: 16px; }
  .rc-title { font-size: 28px; }
  .rc-stats { grid-template-columns: repeat(2, 1fr); }
  .rc-grid { grid-template-columns: 1fr; }
  .rc-hero { flex-direction: column; }
  .rc-card-name { font-size: 20px; }
  .rc-card-top { flex-direction: column; gap: 8px; }
  .rc-card-top-right { align-self: flex-start; }
  .rc-tabs { overflow-x: auto; }
  .rc-tab { padding: 10px 16px; font-size: 14px; white-space: nowrap; }
  .rc-filters { flex-direction: column; }
  .rc-filter-sel { min-width: 0; width: 100%; }
  .rc-search { min-width: 0; width: 100%; }
  .rc-menu-drop { right: 0; left: auto; }
}
`;
