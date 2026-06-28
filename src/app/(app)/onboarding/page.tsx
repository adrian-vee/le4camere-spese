"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Modal } from "@/components/ui/Modal";
import { useRole } from "@/lib/useRole";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/Toast";

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
};

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

export default function OnboardingPage() {
  const router = useRouter();
  const { isAdmin, isManager, loading: roleLoading, userId } = useRole();
  const { toast, showToast } = useToast();

  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterOutcome, setFilterOutcome] = useState("");
  const [filterPosition, setFilterPosition] = useState("");

  const [showNew, setShowNew] = useState(false);
  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");
  const [newPos, setNewPos] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);

  const loadCandidates = useCallback(async () => {
    const { data } = await supabase.from("recruitment_candidates")
      .select("id, first_name, last_name, position_applied, outcome, rating, current_phase, completed_phases, created_at, converted, converted_to, signature_url, signed_document_url")
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
  }, [loading, candidates]);

  async function createCandidate() {
    if (!newFirst.trim() || !newLast.trim()) { showToast("Nome e cognome obbligatori", "warn"); return; }
    setSaving(true);
    const { data, error } = await supabase.from("recruitment_candidates").insert({
      first_name: newFirst.trim(), last_name: newLast.trim(),
      position_applied: newPos.trim() || null, created_by: userId,
    }).select("id").single();
    if (error || !data) {
      console.error("recruitment_candidates insert error:", { message: error?.message, code: error?.code, details: error?.details, hint: error?.hint });
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
    loadCandidates();
  }

  const positions = Array.from(new Set(candidates.map(c => c.position_applied).filter(Boolean))) as string[];
  const filtered = candidates.filter(c => {
    if (search) { const s = search.toLowerCase(); if (!(c.first_name + " " + c.last_name).toLowerCase().includes(s)) return false; }
    if (filterOutcome && c.outcome !== filterOutcome) return false;
    if (filterPosition && c.position_applied !== filterPosition) return false;
    return true;
  });

  const inVal = candidates.filter(c => c.outcome === "in_valutazione").length;
  const idonei = candidates.filter(c => c.outcome === "idoneo" && !c.converted).length;
  const convertiti = candidates.filter(c => c.converted).length;
  const daRich = candidates.filter(c => c.outcome === "da_richiamare").length;

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

      {/* Stats */}
      <div className="rc-stats">
        <div className="rc-stat" style={{ borderTop: "3px solid #BFA762" }}><span className="rc-stat-num">{inVal}</span><span className="rc-stat-label">In valutazione</span></div>
        <div className="rc-stat" style={{ borderTop: "3px solid #2D5A3D" }}><span className="rc-stat-num">{idonei}</span><span className="rc-stat-label">Idonei</span></div>
        <div className="rc-stat" style={{ borderTop: "3px solid #4F7B8C" }}><span className="rc-stat-num">{convertiti}</span><span className="rc-stat-label">Convertiti</span></div>
        <div className="rc-stat" style={{ borderTop: "3px solid #6C6B5D" }}><span className="rc-stat-num">{daRich}</span><span className="rc-stat-label">Da richiamare</span></div>
      </div>

      {/* Filters */}
      <div className="rc-filters">
        <input className="rc-input rc-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca per nome..." />
        <select className="rc-input rc-filter-sel" value={filterOutcome} onChange={e => setFilterOutcome(e.target.value)}>
          <option value="">Tutti gli esiti</option>
          {Object.entries(OUTCOME_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {positions.length > 0 && (
          <select className="rc-input rc-filter-sel" value={filterPosition} onChange={e => setFilterPosition(e.target.value)}>
            <option value="">Tutte le posizioni</option>
            {positions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="rc-empty">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#D8CCB8" strokeWidth="1.5" strokeLinecap="round">
            <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
          </svg>
          <p className="rc-empty-title">Nessun colloquio registrato</p>
          <p className="rc-empty-sub">Avvia il primo colloquio con il bottone in alto</p>
        </div>
      ) : (
        <div className="rc-grid" ref={gridRef}>
          {filtered.map((c, idx) => {
            const oc = OUTCOME_COLORS[c.outcome] ?? OUTCOME_COLORS.in_valutazione;
            return (
              <div key={c.id} className="rc-card" style={{ transitionDelay: `${idx * 50}ms` }}
                onClick={() => router.push(`/onboarding/${c.id}`)}>
                <div className="rc-card-top">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 className="rc-card-name">{c.first_name} {c.last_name}</h3>
                    <span className="rc-card-pos">{c.position_applied || "Posizione non specificata"}</span>
                  </div>
                  <span className="rc-badge" style={{ background: oc.bg, color: oc.text }}>
                    {c.converted ? `Convertito → ${c.converted_to === "dipendente" ? "Dipendente" : "A chiamata"}` : OUTCOME_LABELS[c.outcome]}
                  </span>
                </div>
                <div className="rc-card-mid">
                  <PhaseDots current={c.current_phase} completed={c.completed_phases} />
                  <span className="rc-card-phase">Fase {c.current_phase}/6</span>
                </div>
                <div className="rc-card-bottom">
                  {c.rating != null && c.rating > 0 ? <Stars value={c.rating} /> : <span className="rc-card-norating">—</span>}
                  <span className="rc-card-date">{new Date(c.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}</span>
                </div>
                {(isAdmin || isManager) && (
                  <button className="rc-card-del" title="Elimina" onClick={e => { e.stopPropagation(); setDeleteId(c.id); }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                  </button>
                )}
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

.rc-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 28px; }
.rc-stat { background: #fff; border: 1px solid #D8CCB8; border-radius: 12px; padding: 20px; text-align: center; }
.rc-stat-num { display: block; font-family: 'Bebas Neue', sans-serif; font-size: 42px; color: #1F3326; line-height: 1; }
.rc-stat-label { font-family: 'Albert Sans', sans-serif; font-size: 14px; color: #6C6B5D; margin-top: 4px; display: block; }

.rc-filters { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
.rc-input { font-family: 'Albert Sans', sans-serif; font-size: 15px; border: 1px solid #D8CCB8; border-radius: 8px; padding: 10px 14px; color: #1F3326; background: #fff; outline: none; transition: border-color 0.2s; }
.rc-input:focus { border-color: #BFA762; }
.rc-search { flex: 1; min-width: 200px; }
.rc-filter-sel { min-width: 160px; }

.rc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; }
.rc-card { position: relative; background: #fff; border: 1px solid #D8CCB8; border-radius: 12px; padding: 22px; cursor: pointer; transition: transform 0.25s ease, box-shadow 0.25s ease, opacity 0.4s ease; opacity: 0; transform: translateY(14px); }
.rc-card.rc-visible { opacity: 1; transform: translateY(0); }
.rc-card:hover { transform: translateY(-4px); box-shadow: 0 10px 28px rgba(31,51,38,0.09); }
.rc-card-top { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
.rc-card-name { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 600; color: #1F3326; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rc-card-pos { font-family: 'Albert Sans', sans-serif; font-size: 15px; color: #6C6B5D; display: block; margin-top: 2px; }
.rc-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-family: 'Albert Sans', sans-serif; font-size: 13px; font-weight: 600; white-space: nowrap; flex-shrink: 0; }
.rc-card-mid { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.rc-dots { display: flex; gap: 6px; }
.rc-dot { width: 10px; height: 10px; border-radius: 50%; background: #D8CCB8; transition: background 0.2s; }
.rc-dot-done { background: #2D5A3D; }
.rc-dot-current { background: #BFA762; box-shadow: 0 0 0 3px rgba(191,167,98,0.25); }
.rc-card-phase { font-family: 'Albert Sans', sans-serif; font-size: 13px; color: #6C6B5D; }
.rc-card-bottom { display: flex; align-items: center; justify-content: space-between; }
.rc-stars-ro { display: flex; gap: 2px; }
.rc-card-norating { font-family: 'Albert Sans', sans-serif; font-size: 14px; color: #D8CCB8; }
.rc-card-date { font-family: 'Albert Sans', sans-serif; font-size: 13px; color: #6C6B5D; }
.rc-card-del { position: absolute; top: 12px; right: 12px; background: none; border: none; padding: 6px; cursor: pointer; color: #6C6B5D; border-radius: 6px; opacity: 0; transition: opacity 0.2s, color 0.2s; }
.rc-card:hover .rc-card-del { opacity: 1; }
.rc-card-del:hover { color: #B3261E; background: #FDECEB; }

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
.rc-skel-card { height: 180px; }

@media (max-width: 768px) {
  .rc-page { padding: 16px; }
  .rc-title { font-size: 28px; }
  .rc-stats { grid-template-columns: repeat(2, 1fr); }
  .rc-grid { grid-template-columns: 1fr; }
  .rc-hero { flex-direction: column; }
  .rc-card-name { font-size: 20px; }
}
`;
