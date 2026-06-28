"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Modal } from "@/components/ui/Modal";
import { useRole } from "@/lib/useRole";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/Toast";
import { generatePrivacyFormPdf, generateSummaryPdf, computeScore } from "@/lib/recruitment-pdf";
import type { RecruitmentCandidate, ScoreBreakdown } from "@/lib/recruitment-pdf";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/* ── Types ── */
type RDoc = { id: string; candidate_id: string; doc_type: string | null; file_url: string; file_name: string; file_type: string; uploaded_at: string };
type DocCheck = { key: string; label: string; checked: boolean; notes: string };
type FollowUp = { date: string; notes: string };
type Candidate = RecruitmentCandidate & {
  privacy_consent_at: string | null;
  signature_url: string | null; signed_document_url: string | null;
  current_phase: number; completed_phases: number[];
  created_by: string | null; updated_at: string;
  recruitment_documents: RDoc[];
};
/* ── Constants ── */
const PHASES = [
  { num: 1, label: "Anagrafici" }, { num: 2, label: "Esperienza" },
  { num: 3, label: "Valutazione" }, { num: 4, label: "Documenti" },
  { num: 5, label: "Privacy" }, { num: 6, label: "Esito" },
];
const POSITIONS = ["Receptionist", "Cameriere ai piani", "Cucina", "Bar", "Manutenzione"];
const EXP_LEVELS = ["Nessuna", "1-2 anni", "3-5 anni", "5+ anni"];
const LANG_OPTS = ["Italiano", "Inglese", "Tedesco", "Francese", "Spagnolo"];
const CONTRACT_TYPES = ["Full-time", "Part-time", "Stagionale", "A chiamata", "Determinato", "Indeterminato"];
const SHIFT_OPTS = ["Mattina", "Pomeriggio", "Sera/Notte", "Weekend", "Festivi", "Flessibile"];
const DEFAULT_DOCS: DocCheck[] = [
  { key: "documento_identita", label: "Documento d'identità", checked: false, notes: "" },
  { key: "codice_fiscale", label: "Codice fiscale", checked: false, notes: "" },
  { key: "permesso_soggiorno", label: "Permesso di soggiorno", checked: false, notes: "" },
  { key: "cv", label: "CV", checked: false, notes: "" },
  { key: "haccp", label: "Attestato HACCP", checked: false, notes: "" },
  { key: "certificazioni", label: "Certificazioni varie", checked: false, notes: "" },
  { key: "referenze", label: "Referenze", checked: false, notes: "" },
];
const OUTCOME_OPTS = [
  { key: "in_valutazione", label: "In valutazione", color: "#BFA762", bg: "#FFF8E1" },
  { key: "da_richiamare", label: "Da richiamare", color: "#6C6B5D", bg: "#F3EBDD" },
  { key: "idoneo", label: "Idoneo", color: "#2D5A3D", bg: "#E8F5E9" },
  { key: "non_idoneo", label: "Non idoneo", color: "#B3261E", bg: "#FDECEB" },
];
const MONTHS_IT = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const DAYS_IT = ["L", "M", "M", "G", "V", "S", "D"];

function storagePathFromUrl(url: string): string {
  const idx = url.indexOf("/recruitment-files/");
  return idx >= 0 ? decodeURIComponent(url.substring(idx + "/recruitment-files/".length)) : "";
}

/* ── DatePicker ── */
function DatePicker({ value, onChange, label, birthMode }: { value: string; onChange: (v: string) => void; label: string; birthMode?: boolean }) {
  const [open, setOpen] = useState(false);
  const parsed = value ? { y: parseInt(value.split("-")[0]), m: parseInt(value.split("-")[1]) - 1, d: parseInt(value.split("-")[2]) } : null;
  const now = new Date();
  const [vy, setVy] = useState(parsed?.y ?? (birthMode ? 1990 : now.getFullYear()));
  const [vm, setVm] = useState(parsed?.m ?? now.getMonth());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const daysInMonth = new Date(vy, vm + 1, 0).getDate();
  const firstDow = (new Date(vy, vm, 1).getDay() + 6) % 7;
  const cells: (number | null)[] = Array(firstDow).fill(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);
  while (cells.length % 7 !== 0) cells.push(null);

  function select(d: number) {
    const ms = String(vm + 1).padStart(2, "0");
    const ds = String(d).padStart(2, "0");
    onChange(`${vy}-${ms}-${ds}`);
    setOpen(false);
  }

  const minY = birthMode ? 1940 : now.getFullYear() - 2;
  const maxY = birthMode ? now.getFullYear() - 14 : now.getFullYear() + 3;
  const years: number[] = [];
  for (let i = maxY; i >= minY; i--) years.push(i);

  const display = parsed ? `${String(parsed.d).padStart(2, "0")}/${String(parsed.m + 1).padStart(2, "0")}/${parsed.y}` : "";

  return (
    <div className="dp-wrap" ref={ref}>
      <label className="rd-label">{label}</label>
      <button type="button" className="dp-trigger" onClick={() => { setOpen(!open); if (parsed) { setVy(parsed.y); setVm(parsed.m); } }}>
        {display || <span className="dp-placeholder">gg/mm/aaaa</span>}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6C6B5D" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
      </button>
      {value && <button type="button" className="dp-clear" onClick={() => onChange("")} title="Cancella data">&times;</button>}
      {open && (
        <div className="dp-dropdown">
          <div className="dp-nav">
            <button type="button" className="dp-nav-btn" onClick={() => { if (vm === 0) { setVm(11); setVy(vy - 1); } else setVm(vm - 1); }}>&lsaquo;</button>
            <select className="dp-sel" value={vm} onChange={e => setVm(Number(e.target.value))}>
              {MONTHS_IT.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select className="dp-sel dp-sel-y" value={vy} onChange={e => setVy(Number(e.target.value))}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button type="button" className="dp-nav-btn" onClick={() => { if (vm === 11) { setVm(0); setVy(vy + 1); } else setVm(vm + 1); }}>&rsaquo;</button>
          </div>
          <div className="dp-grid">
            {DAYS_IT.map(d => <span key={d} className="dp-day-label">{d}</span>)}
            {cells.map((d, i) => d ? (
              <button key={i} type="button"
                className={`dp-day${parsed && parsed.y === vy && parsed.m === vm && parsed.d === d ? " dp-day-sel" : ""}${d === now.getDate() && vm === now.getMonth() && vy === now.getFullYear() ? " dp-day-today" : ""}`}
                onClick={() => select(d)}>{d}</button>
            ) : <span key={i} className="dp-day-empty" />)}
          </div>
          {!birthMode && (
            <button type="button" className="dp-today-btn" onClick={() => { const t = new Date(); select(t.getDate()); setVy(t.getFullYear()); setVm(t.getMonth()); }}>Oggi</button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Chips multi-select ── */
function ChipSelect({ options, selected, onChange, label }: { options: string[]; selected: string[]; onChange: (v: string[]) => void; label: string }) {
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v]);
  return (
    <div>
      <span className="rd-label">{label}</span>
      <div className="rd-chips">
        {options.map(o => (
          <button key={o} type="button" className={`rd-chip${selected.includes(o) ? " rd-chip-on" : ""}`} onClick={() => toggle(o)}>{o}</button>
        ))}
      </div>
    </div>
  );
}

/* ── Single-select chips ── */
function ChipSingle({ options, selected, onChange, label }: { options: string[]; selected: string; onChange: (v: string) => void; label: string }) {
  return (
    <div>
      <span className="rd-label">{label}</span>
      <div className="rd-chips">
        {options.map(o => (
          <button key={o} type="button" className={`rd-chip${selected === o ? " rd-chip-on" : ""}`} onClick={() => onChange(selected === o ? "" : o)}>{o}</button>
        ))}
      </div>
    </div>
  );
}

/* ── Stepper ── */
function Stepper({ current, onNav }: { current: number; onNav: (p: number) => void }) {
  return (
    <div className="rd-stepper">
      {PHASES.map((p, i) => {
        const isCur = current === p.num;
        return (
          <div key={p.num} className="rd-step-wrap">
            {i > 0 && <div className="rd-step-line rd-line-active" />}
            <button className={`rd-step${isCur ? " rd-step-cur" : ""}`} onClick={() => onNav(p.num)} type="button">
              <span className="rd-step-num">{p.num}</span>
              <span className="rd-step-label">{p.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ── Star Rating ── */
function StarSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="rd-stars">
      {[1, 2, 3, 4, 5].map(s => (
        <button key={s} type="button" onClick={() => onChange(value === s ? 0 : s)} className="rd-star-btn">
          <svg width="32" height="32" viewBox="0 0 24 24" fill={s <= value ? "#BFA762" : "none"} stroke="#BFA762" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
      ))}
      <span className="rd-star-val">{value}/5</span>
    </div>
  );
}

/* ── Signature Canvas ── */
function SignaturePad({ existingUrl, onSave }: { existingUrl: string | null; onSave: (blob: Blob) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#1F3326"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
  }, []);

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const t = "touches" in e ? e.touches[0] || e.changedTouches[0] : e;
    const pt = t as unknown as { clientX: number; clientY: number };
    return { x: pt.clientX - rect.left, y: pt.clientY - rect.top };
  }
  function start(e: React.MouseEvent | React.TouchEvent) { e.preventDefault(); const ctx = canvasRef.current?.getContext("2d"); if (!ctx) return; drawing.current = true; const { x, y } = getPos(e); ctx.beginPath(); ctx.moveTo(x, y); setHasDrawn(true); }
  function move(e: React.MouseEvent | React.TouchEvent) { if (!drawing.current) return; e.preventDefault(); const ctx = canvasRef.current?.getContext("2d"); if (!ctx) return; const { x, y } = getPos(e); ctx.lineTo(x, y); ctx.stroke(); }
  function end() { drawing.current = false; }
  function clear() { const c = canvasRef.current; if (!c) return; c.getContext("2d")?.clearRect(0, 0, c.width, c.height); setHasDrawn(false); }
  function save() { canvasRef.current?.toBlob(b => { if (b) onSave(b); }, "image/png"); }

  return (
    <div className="rd-sig">
      {existingUrl && <div className="rd-sig-existing"><img src={existingUrl} alt="Firma salvata" className="rd-sig-img" /><span className="rd-sig-saved">Firma già salvata</span></div>}
      <p className="rd-sig-label">Disegna la firma qui sotto:</p>
      <canvas ref={canvasRef} width={480} height={180} onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end} onTouchStart={start} onTouchMove={move} onTouchEnd={end} className="rd-sig-canvas" />
      <div className="rd-sig-btns">
        <button type="button" className="rd-btn-secondary rd-btn-sm" onClick={clear}>Cancella</button>
        <button type="button" className="rd-btn-primary rd-btn-sm" onClick={save} disabled={!hasDrawn}>Salva firma</button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════ */
export default function CandidateDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { isAdmin, loading: roleLoading } = useRole();
  const { toast, showToast } = useToast();

  const [cand, setCand] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState(1);
  const [saving, setSaving] = useState(false);

  const [f, setF] = useState<Record<string, unknown>>({});
  const upd = (k: string, v: unknown) => setF(prev => ({ ...prev, [k]: v }));

  const [privacyText, setPrivacyText] = useState("");
  const [privacyEditing, setPrivacyEditing] = useState(false);
  const [privacyDraft, setPrivacyDraft] = useState("");

  const [converting, setConverting] = useState(false);

  const [showDelete, setShowDelete] = useState(false);
  const [customPos, setCustomPos] = useState("");
  const [customDocLabel, setCustomDocLabel] = useState("");
  const [newFiDate, setNewFiDate] = useState("");
  const [newFiNotes, setNewFiNotes] = useState("");
  const [customLang, setCustomLang] = useState("");
  const [customContract, setCustomContract] = useState("");
  const [customShift, setCustomShift] = useState("");

  /* ── Load ── */
  const loadCandidate = useCallback(async () => {
    const { data, error } = await supabase.from("recruitment_candidates")
      .select("*, recruitment_documents(id, candidate_id, doc_type, file_url, file_name, file_type, uploaded_at)")
      .eq("id", id).single();
    if (error || !data) { showToast("Candidato non trovato", "error"); router.push("/onboarding"); return; }
    const c = data as unknown as Candidate;
    if (!c.documents_checklist || !Array.isArray(c.documents_checklist) || c.documents_checklist.length === 0) {
      c.documents_checklist = [...DEFAULT_DOCS];
    }
    if (!c.follow_up_interviews || !Array.isArray(c.follow_up_interviews)) {
      c.follow_up_interviews = [];
    }
    setCand(c);
    setPhase(c.current_phase);
    setF({
      first_name: c.first_name, last_name: c.last_name, birth_date: c.birth_date ?? "",
      residence: c.residence ?? "", phone: c.phone ?? "", email: c.email ?? "",
      has_car: c.has_car, distance_km: c.distance_km ?? "",
      position_applied: c.position_applied ?? "", experience: c.experience ?? "", experience_details: c.experience_details ?? "",
      languages: c.languages ?? "", availability: c.availability ?? "",
      employment_type_sought: c.employment_type_sought ?? "", can_start_date: c.can_start_date ?? "",
      interview_notes: c.interview_notes ?? "", strengths: c.strengths ?? "",
      weaknesses: c.weaknesses ?? "", rating: c.rating ?? 0,
      privacy_consent: c.privacy_consent, outcome: c.outcome,
      documents_checklist: c.documents_checklist,
      follow_up_interviews: c.follow_up_interviews,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (roleLoading) return;
    Promise.all([
      loadCandidate(),
      supabase.from("settings").select("value").eq("key", "recruitment_privacy_text").single().then(({ data }) => { setPrivacyText(typeof data?.value === "string" ? data.value : ""); }),
    ]).then(() => setLoading(false));
  }, [roleLoading, loadCandidate]);

  /* ── Build a RecruitmentCandidate from current form state for live scoring ── */
  function buildCandFromForm(): RecruitmentCandidate | null {
    if (!cand) return null;
    return {
      ...cand,
      rating: f.rating ? Number(f.rating) : null,
      experience: (f.experience as string) || null,
      experience_details: (f.experience_details as string) || null,
      availability: (f.availability as string) || null,
      has_car: !!f.has_car,
      distance_km: f.distance_km ? Number(f.distance_km) : null,
      employment_type_sought: (f.employment_type_sought as string) || null,
      outcome: (f.outcome as string) || cand.outcome,
    };
  }

  /* ── Save ── */
  async function saveCurrentPhase() {
    if (!cand) return;
    setSaving(true);
    const completed = cand.completed_phases.includes(phase) ? cand.completed_phases : [...cand.completed_phases, phase];
    const payload: Record<string, unknown> = { current_phase: phase, completed_phases: completed };

    if (phase === 1) Object.assign(payload, { first_name: f.first_name, last_name: f.last_name, birth_date: f.birth_date || null, residence: f.residence || null, phone: f.phone || null, email: f.email || null, has_car: f.has_car, distance_km: f.distance_km ? Number(f.distance_km) : null });
    if (phase === 2) Object.assign(payload, { position_applied: f.position_applied || null, experience: f.experience || null, experience_details: f.experience_details || null, languages: f.languages || null, availability: f.availability || null, employment_type_sought: f.employment_type_sought || null, can_start_date: f.can_start_date || null });
    if (phase === 3) Object.assign(payload, { interview_notes: f.interview_notes || null, strengths: f.strengths || null, weaknesses: f.weaknesses || null, rating: f.rating ? Number(f.rating) : null, follow_up_interviews: f.follow_up_interviews || [] });
    if (phase === 4) Object.assign(payload, { documents_checklist: f.documents_checklist || [] });
    if (phase === 5) Object.assign(payload, { privacy_consent: f.privacy_consent, privacy_consent_at: f.privacy_consent ? new Date().toISOString() : null });
    if (phase === 6) Object.assign(payload, { outcome: f.outcome });

    const liveCand = buildCandFromForm();
    if (liveCand) {
      const score = computeScore(liveCand);
      payload.evaluation_score = score.total;
      payload.evaluation_breakdown = score.breakdown;
    }

    const { error } = await supabase.from("recruitment_candidates").update(payload).eq("id", cand.id);
    if (error) { console.error("save error:", error); showToast(error.message || "Errore salvataggio", "error"); setSaving(false); return; }

    setCand(prev => prev ? { ...prev, ...payload as Partial<Candidate>, completed_phases: completed } : prev);
    showToast("Salvato", "ok");
    setSaving(false);

    if (phase < 6) setPhase(phase + 1);
  }

  /* ── Instant outcome save ── */
  async function setOutcomeImmediate(outcomeKey: string) {
    if (!cand) return;
    upd("outcome", outcomeKey);

    const liveCand = buildCandFromForm();
    if (liveCand) liveCand.outcome = outcomeKey;
    const score = liveCand ? computeScore(liveCand) : null;

    const payload: Record<string, unknown> = { outcome: outcomeKey };
    if (score) { payload.evaluation_score = score.total; payload.evaluation_breakdown = score.breakdown; }

    const { error } = await supabase.from("recruitment_candidates").update(payload).eq("id", cand.id);
    if (error) { console.error("outcome save error:", error); showToast(error.message || "Errore salvataggio esito", "error"); return; }

    setCand(prev => prev ? { ...prev, outcome: outcomeKey, evaluation_score: score?.total ?? prev.evaluation_score, evaluation_breakdown: score?.breakdown ?? prev.evaluation_breakdown } : prev);
    const label = OUTCOME_OPTS.find(o => o.key === outcomeKey)?.label ?? outcomeKey;
    showToast(`Esito aggiornato: ${label}`, "ok");
  }

  /* ── File upload (docs) ── */
  async function uploadDoc(docType: string, file: File) {
    if (!cand) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const path = `recruitment/${cand.id}/${docType}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("recruitment-files").upload(path, file);
    if (error) { console.error("uploadDoc error:", error); showToast(error.message || "Errore upload", "error"); return; }
    const { data: { publicUrl } } = supabase.storage.from("recruitment-files").getPublicUrl(path);
    const { error: insErr } = await supabase.from("recruitment_documents").insert({ candidate_id: cand.id, doc_type: docType, file_url: publicUrl, file_name: file.name, file_type: file.type });
    if (insErr) { console.error("doc insert error:", insErr); showToast(insErr.message || "Errore", "error"); return; }
    showToast("File caricato", "ok");
    loadCandidate();
  }

  async function deleteDoc(doc: RDoc) {
    const path = storagePathFromUrl(doc.file_url);
    if (path) await supabase.storage.from("recruitment-files").remove([path]);
    await supabase.from("recruitment_documents").delete().eq("id", doc.id);
    showToast("File rimosso", "ok");
    loadCandidate();
  }

  /* ── Signature ── */
  async function uploadSignature(blob: Blob) {
    if (!cand) return;
    const path = `recruitment/${cand.id}/signature/${Date.now()}.png`;
    const { error } = await supabase.storage.from("recruitment-files").upload(path, blob, { contentType: "image/png" });
    if (error) { console.error("sig error:", error); showToast(error.message || "Errore firma", "error"); return; }
    const { data: { publicUrl } } = supabase.storage.from("recruitment-files").getPublicUrl(path);
    await supabase.from("recruitment_candidates").update({ signature_url: publicUrl }).eq("id", cand.id);
    showToast("Firma salvata", "ok"); loadCandidate();
  }

  async function uploadSignedDoc(file: File) {
    if (!cand) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const path = `recruitment/${cand.id}/signed_doc/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("recruitment-files").upload(path, file);
    if (error) { console.error("signedDoc error:", error); showToast(error.message || "Errore upload", "error"); return; }
    const { data: { publicUrl } } = supabase.storage.from("recruitment-files").getPublicUrl(path);
    await supabase.from("recruitment_candidates").update({ signed_document_url: publicUrl }).eq("id", cand.id);
    showToast("Documento firmato caricato", "ok"); loadCandidate();
  }

  /* ── Privacy text (admin) ── */
  async function savePrivacyText() {
    await supabase.from("settings").upsert({ key: "recruitment_privacy_text", value: privacyDraft });
    setPrivacyText(privacyDraft); setPrivacyEditing(false);
    showToast("Testo informativa salvato", "ok");
  }

  /* ── Conversion ── */
  async function convertCandidate(type: "dipendente" | "a_chiamata") {
    if (!cand) return;
    setConverting(true);
    const now = new Date().toISOString();

    const { error } = await supabase.from("recruitment_candidates").update({
      converted: true, converted_to: type, converted_at: now, outcome: "idoneo",
    }).eq("id", cand.id);

    if (error) { showToast(error.message || "Errore conversione", "error"); setConverting(false); return; }

    setCand(prev => prev ? { ...prev, converted: true, converted_to: type, converted_at: now, outcome: "idoneo" } : prev);
    upd("outcome", "idoneo");
    showToast(`Convertito in ${type === "dipendente" ? "Dipendente" : "A chiamata"}`, "ok");
    setConverting(false);
  }

  async function undoConversion() {
    if (!cand) return;
    const { error } = await supabase.from("recruitment_candidates").update({
      converted: false, converted_to: null, converted_at: null,
    }).eq("id", cand.id);

    if (error) { showToast(error.message || "Errore annullamento", "error"); return; }

    setCand(prev => prev ? { ...prev, converted: false, converted_to: null, converted_at: null } : prev);
    showToast("Conversione annullata", "ok");
  }

  /* ── Delete ── */
  async function deleteCandidate() {
    if (!cand) return;
    const urls: string[] = cand.recruitment_documents.map(d => d.file_url);
    if (cand.signature_url) urls.push(cand.signature_url);
    if (cand.signed_document_url) urls.push(cand.signed_document_url);
    const paths = urls.map(storagePathFromUrl).filter(Boolean);
    if (paths.length) await supabase.storage.from("recruitment-files").remove(paths);
    await supabase.from("recruitment_candidates").delete().eq("id", cand.id);
    showToast("Candidato eliminato", "ok");
    router.push("/onboarding");
  }

  /* ── Checklist helpers ── */
  const checklist = (f.documents_checklist || []) as DocCheck[];
  function updCheck(key: string, field: "checked" | "notes", val: unknown) {
    upd("documents_checklist", checklist.map(d => d.key === key ? { ...d, [field]: val } : d));
  }
  function addCustomDoc() {
    if (!customDocLabel.trim()) return;
    const key = `custom_${Date.now()}`;
    upd("documents_checklist", [...checklist, { key, label: customDocLabel.trim(), checked: false, notes: "" }]);
    setCustomDocLabel("");
  }

  /* ── Follow-up helpers ── */
  const followUps = (f.follow_up_interviews || []) as FollowUp[];
  function addFollowUp() {
    if (!newFiDate || !newFiNotes.trim()) { showToast("Data e note obbligatorie", "warn"); return; }
    upd("follow_up_interviews", [...followUps, { date: newFiDate, notes: newFiNotes.trim() }]);
    setNewFiDate(""); setNewFiNotes("");
  }
  function removeFollowUp(idx: number) {
    upd("follow_up_interviews", followUps.filter((_, i) => i !== idx));
  }

  /* ── Languages helpers ── */
  const selectedLangs = (fStr("languages")).split(",").map(s => s.trim()).filter(Boolean);
  function toggleLang(lang: string) {
    const next = selectedLangs.includes(lang) ? selectedLangs.filter(l => l !== lang) : [...selectedLangs, lang];
    upd("languages", next.join(", "));
  }
  function addCustomLang() {
    if (!customLang.trim()) return;
    upd("languages", [...selectedLangs, customLang.trim()].join(", "));
    setCustomLang("");
  }

  /* ── Contract type helpers ── */
  const selectedContracts = (fStr("employment_type_sought")).split(",").map(s => s.trim()).filter(Boolean);
  function toggleContract(c: string) {
    const next = selectedContracts.includes(c) ? selectedContracts.filter(x => x !== c) : [...selectedContracts, c];
    upd("employment_type_sought", next.join(", "));
  }
  function addCustomContract() {
    if (!customContract.trim()) return;
    upd("employment_type_sought", [...selectedContracts, customContract.trim()].join(", "));
    setCustomContract("");
  }

  /* ── Shift availability helpers ── */
  const selectedShifts = (fStr("availability")).split(",").map(s => s.trim()).filter(Boolean);
  function toggleShift(s: string) {
    const next = selectedShifts.includes(s) ? selectedShifts.filter(x => x !== s) : [...selectedShifts, s];
    upd("availability", next.join(", "));
  }
  function addCustomShift() {
    if (!customShift.trim()) return;
    upd("availability", [...selectedShifts, customShift.trim()].join(", "));
    setCustomShift("");
  }

  /* ── Copy ID ── */
  function copyId(text: string) {
    navigator.clipboard.writeText(text).then(() => showToast("ID copiato", "ok"));
  }

  /* ── Render ── */
  if (loading || !cand) return (
    <div className="rd-page"><div className="rd-skel rd-skel-stepper" /><div className="rd-skel rd-skel-content" /><style>{CSS}</style></div>
  );

  function fStr(k: string) { return (f[k] as string) ?? ""; }
  const liveCand = buildCandFromForm();
  const score = liveCand ? computeScore(liveCand) : { total: 0, breakdown: [] as ScoreBreakdown[], summary: "" };
  const curOutcome = OUTCOME_OPTS.find(o => o.key === (f.outcome || cand.outcome));

  return (
    <div className="rd-page">
      <div className="rd-top-row">
        <button className="rd-back" onClick={() => router.push("/onboarding")} type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          Lista
        </button>
        <div className="rd-top-actions">
          <button type="button" className="rd-btn-secondary rd-btn-sm" onClick={() => { if (liveCand) generateSummaryPdf(liveCand); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            Stampa riepilogo
          </button>
          <button type="button" className="rd-btn-danger rd-btn-sm" onClick={() => setShowDelete(true)}>Elimina</button>
        </div>
      </div>

      <div className="rd-header">
        <div>
          <h1 className="rd-name">{cand.first_name} {cand.last_name}</h1>
          {cand.position_applied && <span className="rd-pos">{cand.position_applied}</span>}
        </div>
        {curOutcome && (
          <span className="rd-outcome-badge" style={{ background: curOutcome.bg, color: curOutcome.color }}>{curOutcome.label}</span>
        )}
        <div className="rd-score-mini">
          <span className="rd-score-label">Punteggio</span>
          <span className="rd-score-val">{score.total}/100</span>
        </div>
      </div>

      <Stepper current={phase} onNav={setPhase} />

      <div className="rd-content">
        {/* ── Phase 1: Anagrafici ── */}
        {phase === 1 && (
          <div className="rd-phase">
            <h2 className="rd-phase-title">Dati anagrafici</h2>
            <div className="rd-grid2">
              <div><label className="rd-label">Nome *</label><input className="rd-input" value={fStr("first_name")} onChange={e => upd("first_name", e.target.value)} /></div>
              <div><label className="rd-label">Cognome *</label><input className="rd-input" value={fStr("last_name")} onChange={e => upd("last_name", e.target.value)} /></div>
              <DatePicker value={fStr("birth_date")} onChange={v => upd("birth_date", v)} label="Data di nascita" birthMode />
              <div><label className="rd-label">Residenza</label><input className="rd-input" value={fStr("residence")} onChange={e => upd("residence", e.target.value)} placeholder="es. Verona" /></div>
              <div><label className="rd-label">Telefono</label><input className="rd-input" type="tel" value={fStr("phone")} onChange={e => upd("phone", e.target.value)} /></div>
              <div><label className="rd-label">Email</label><input className="rd-input" type="email" value={fStr("email")} onChange={e => upd("email", e.target.value)} /></div>
            </div>
            <div className="rd-grid2" style={{ marginTop: 16 }}>
              <div className="rd-toggle-wrap">
                <label className="rd-label">Automunito/a</label>
                <button type="button" className={`rd-toggle${f.has_car ? " rd-toggle-on" : ""}`} onClick={() => upd("has_car", !f.has_car)}>
                  <span className="rd-toggle-knob" /><span className="rd-toggle-text">{f.has_car ? "Sì" : "No"}</span>
                </button>
              </div>
              <div><label className="rd-label">Distanza km</label><input className="rd-input" type="number" min="0" value={fStr("distance_km")} onChange={e => upd("distance_km", e.target.value)} placeholder="km" /></div>
            </div>
          </div>
        )}

        {/* ── Phase 2: Esperienza (restructured) ── */}
        {phase === 2 && (
          <div className="rd-phase">
            <h2 className="rd-phase-title">Esperienza e profilo</h2>

            <label className="rd-label">Posizione</label>
            <div className="rd-chips">
              {POSITIONS.map(p => (
                <button key={p} type="button" className={`rd-chip${fStr("position_applied") === p ? " rd-chip-on" : ""}`}
                  onClick={() => { upd("position_applied", fStr("position_applied") === p ? "" : p); setCustomPos(""); }}>{p}</button>
              ))}
              <button type="button" className={`rd-chip${!POSITIONS.includes(fStr("position_applied")) && fStr("position_applied") ? " rd-chip-on" : ""}`}
                onClick={() => upd("position_applied", customPos || "Altro")}>Altro</button>
            </div>
            {(!POSITIONS.includes(fStr("position_applied")) && fStr("position_applied")) && (
              <input className="rd-input" value={fStr("position_applied")} onChange={e => { upd("position_applied", e.target.value); setCustomPos(e.target.value); }} placeholder="Ruolo personalizzato" style={{ maxWidth: 300, marginTop: 8 }} />
            )}

            <ChipSingle options={EXP_LEVELS} selected={fStr("experience")} onChange={v => upd("experience", v)} label="Esperienza (anni nel settore)" />
            <div>
              <span className="rd-label">Dettaglio esperienza</span>
              <input className="rd-input" value={fStr("experience_details")} onChange={e => upd("experience_details", e.target.value)} placeholder="Es. 2 anni Hotel Colomba, 1 anno Ristorante Da Mario..." />
              <p className="rd-chip-summary">Testo libero, non influisce sul punteggio automatico.</p>
            </div>

            <div>
              <span className="rd-label">Lingue</span>
              <div className="rd-chips">
                {LANG_OPTS.map(l => (
                  <button key={l} type="button" className={`rd-chip${selectedLangs.includes(l) ? " rd-chip-on" : ""}`} onClick={() => toggleLang(l)}>{l}</button>
                ))}
              </div>
              <div className="rd-inline-add">
                <input className="rd-input" value={customLang} onChange={e => setCustomLang(e.target.value)} placeholder="Altra lingua" style={{ maxWidth: 160 }} onKeyDown={e => e.key === "Enter" && addCustomLang()} />
                <button type="button" className="rd-btn-secondary rd-btn-sm" onClick={addCustomLang}>+</button>
              </div>
              {selectedLangs.length > 0 && <p className="rd-chip-summary">{selectedLangs.join(", ")}</p>}
            </div>

            <div>
              <span className="rd-label">Tipo di contratto/impiego</span>
              <div className="rd-chips">
                {CONTRACT_TYPES.map(ct => (
                  <button key={ct} type="button" className={`rd-chip${selectedContracts.includes(ct) ? " rd-chip-on" : ""}`} onClick={() => toggleContract(ct)}>{ct}</button>
                ))}
              </div>
              <div className="rd-inline-add">
                <input className="rd-input" value={customContract} onChange={e => setCustomContract(e.target.value)} placeholder="Altro tipo" style={{ maxWidth: 180 }} onKeyDown={e => e.key === "Enter" && addCustomContract()} />
                <button type="button" className="rd-btn-secondary rd-btn-sm" onClick={addCustomContract}>+</button>
              </div>
              {selectedContracts.length > 0 && <p className="rd-chip-summary">{selectedContracts.join(", ")}</p>}
            </div>

            <div>
              <span className="rd-label">Disponibilità oraria/turni</span>
              <div className="rd-chips">
                {SHIFT_OPTS.map(s => (
                  <button key={s} type="button" className={`rd-chip${selectedShifts.includes(s) ? " rd-chip-on" : ""}`} onClick={() => toggleShift(s)}>{s}</button>
                ))}
              </div>
              <div className="rd-inline-add">
                <input className="rd-input" value={customShift} onChange={e => setCustomShift(e.target.value)} placeholder="Altro turno" style={{ maxWidth: 180 }} onKeyDown={e => e.key === "Enter" && addCustomShift()} />
                <button type="button" className="rd-btn-secondary rd-btn-sm" onClick={addCustomShift}>+</button>
              </div>
              {selectedShifts.length > 0 && <p className="rd-chip-summary">{selectedShifts.join(", ")}</p>}
            </div>

            <DatePicker value={fStr("can_start_date")} onChange={v => upd("can_start_date", v)} label="Disponibile a partire da" />
          </div>
        )}

        {/* ── Phase 3: Valutazione + follow-up ── */}
        {phase === 3 && (
          <div className="rd-phase">
            <h2 className="rd-phase-title">Valutazione colloquio</h2>
            <label className="rd-label">Note del colloquio</label>
            <textarea className="rd-input rd-textarea" value={fStr("interview_notes")} onChange={e => upd("interview_notes", e.target.value)} rows={5} placeholder="Impressioni, dettagli discussi..." />
            <div className="rd-grid2">
              <div><label className="rd-label">Punti di forza</label><textarea className="rd-input rd-textarea" value={fStr("strengths")} onChange={e => upd("strengths", e.target.value)} rows={3} /></div>
              <div><label className="rd-label">Punti deboli</label><textarea className="rd-input rd-textarea" value={fStr("weaknesses")} onChange={e => upd("weaknesses", e.target.value)} rows={3} /></div>
            </div>
            <label className="rd-label">Valutazione complessiva</label>
            <StarSelect value={Number(f.rating) || 0} onChange={v => upd("rating", v)} />

            <h3 className="rd-phase-subtitle" style={{ marginTop: 20 }}>Colloqui successivi</h3>
            {followUps.length > 0 && (
              <div className="rd-fi-list">
                {followUps.map((fi, i) => (
                  <div key={i} className="rd-fi-item">
                    <div className="rd-fi-date">{new Date(fi.date).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}</div>
                    <div className="rd-fi-notes">{fi.notes}</div>
                    <button type="button" className="rd-doc-del" onClick={() => removeFollowUp(i)}>&times;</button>
                  </div>
                ))}
              </div>
            )}
            <div className="rd-fi-add">
              <DatePicker value={newFiDate} onChange={setNewFiDate} label="" />
              <input className="rd-input" value={newFiNotes} onChange={e => setNewFiNotes(e.target.value)} placeholder="Note secondo colloquio..." style={{ flex: 1 }} />
              <button type="button" className="rd-btn-secondary rd-btn-sm" onClick={addFollowUp}>Aggiungi</button>
            </div>
          </div>
        )}

        {/* ── Phase 4: Documenti (checklist) ── */}
        {phase === 4 && (
          <div className="rd-phase">
            <h2 className="rd-phase-title">Documenti</h2>
            <p className="rd-phase-desc">Spunta i documenti che il candidato ha portato o fornirà.</p>
            <div className="rd-check-list">
              {checklist.map(d => (
                <div key={d.key} className={`rd-check-item${d.checked ? " rd-check-on" : ""}`}>
                  <label className="rd-check-row">
                    <input type="checkbox" checked={d.checked} onChange={e => updCheck(d.key, "checked", e.target.checked)} className="rd-consent-check" />
                    <span className="rd-check-label">{d.label}</span>
                  </label>
                  <input className="rd-input rd-check-notes" value={d.notes} onChange={e => updCheck(d.key, "notes", e.target.value)} placeholder="Note (es. in scadenza, da consegnare entro...)" />
                </div>
              ))}
            </div>
            <div className="rd-inline-add" style={{ marginTop: 12 }}>
              <input className="rd-input" value={customDocLabel} onChange={e => setCustomDocLabel(e.target.value)} placeholder="Aggiungi documento extra..." onKeyDown={e => e.key === "Enter" && addCustomDoc()} />
              <button type="button" className="rd-btn-secondary rd-btn-sm" onClick={addCustomDoc}>+ Aggiungi</button>
            </div>

            <h3 className="rd-phase-subtitle" style={{ marginTop: 24 }}>Carica file (opzionale)</h3>
            <p className="rd-phase-desc">L&apos;upload dei file non è obbligatorio qui. Sarà possibile anche in fase di onboarding operativo.</p>
            {cand.recruitment_documents.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {cand.recruitment_documents.map(doc => (
                  <div key={doc.id} className="rd-doc-file">
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="rd-doc-link">{doc.file_name || "File"}</a>
                    <button type="button" className="rd-doc-del" onClick={() => deleteDoc(doc)}>&times;</button>
                  </div>
                ))}
              </div>
            )}
            <label className="rd-doc-upload" style={{ marginTop: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              Carica file
              <input type="file" className="rd-hidden" onChange={e => { if (e.target.files?.[0]) uploadDoc("allegato", e.target.files[0]); e.target.value = ""; }} />
            </label>
          </div>
        )}

        {/* ── Phase 5: Privacy ── */}
        {phase === 5 && (
          <div className="rd-phase">
            <h2 className="rd-phase-title">Privacy e consenso</h2>

            <button type="button" className="rd-btn-gold" onClick={() => generatePrivacyFormPdf(cand, privacyText)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              Scarica modulo privacy (PDF)
            </button>

            <div className="rd-privacy-box">
              <h3 className="rd-privacy-heading">Informativa sulla privacy</h3>
              {privacyText ? (
                <div className="rd-privacy-text">{privacyText}</div>
              ) : (
                <div className="rd-privacy-warn">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#BFA762" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                  <span>Testo informativa non configurato</span>
                </div>
              )}
              {isAdmin && (
                <div style={{ marginTop: 12 }}>
                  {privacyEditing ? (
                    <>
                      <textarea className="rd-input rd-textarea" value={privacyDraft} onChange={e => setPrivacyDraft(e.target.value)} rows={6} placeholder="Incolla qui il testo dell'informativa..." />
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button type="button" className="rd-btn-secondary rd-btn-sm" onClick={() => setPrivacyEditing(false)}>Annulla</button>
                        <button type="button" className="rd-btn-primary rd-btn-sm" onClick={savePrivacyText}>Salva testo</button>
                      </div>
                    </>
                  ) : (
                    <button type="button" className="rd-btn-secondary rd-btn-sm" onClick={() => { setPrivacyDraft(privacyText); setPrivacyEditing(true); }}>
                      {privacyText ? "Modifica informativa" : "Inserisci informativa"}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="rd-consent-row">
              <label className="rd-consent-label">
                <input type="checkbox" checked={!!f.privacy_consent} onChange={e => upd("privacy_consent", e.target.checked)} className="rd-consent-check" />
                <span>Il/La candidato/a ha letto e accettato l&apos;informativa sulla privacy</span>
              </label>
            </div>

            <h3 className="rd-phase-subtitle">Firma digitale (alternativa)</h3>
            <SignaturePad existingUrl={cand.signature_url} onSave={uploadSignature} />

            <h3 className="rd-phase-subtitle" style={{ marginTop: 20 }}>Carica modulo firmato a mano</h3>
            {cand.signed_document_url && (
              <div className="rd-doc-file" style={{ marginBottom: 8 }}>
                <a href={cand.signed_document_url} target="_blank" rel="noopener noreferrer" className="rd-doc-link">Modulo firmato caricato</a>
              </div>
            )}
            <label className="rd-doc-upload">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              Carica modulo firmato
              <input type="file" className="rd-hidden" onChange={e => { if (e.target.files?.[0]) uploadSignedDoc(e.target.files[0]); e.target.value = ""; }} />
            </label>
          </div>
        )}

        {/* ── Phase 6: Esito ── */}
        {phase === 6 && (
          <div className="rd-phase">
            <h2 className="rd-phase-title">Esito e conversione</h2>

            <p className="rd-phase-desc">Seleziona l&apos;esito del colloquio (si salva immediatamente):</p>
            <div className="rd-outcome-grid">
              {OUTCOME_OPTS.map(o => (
                <button key={o.key} type="button"
                  className={`rd-outcome-btn${(f.outcome || cand.outcome) === o.key ? " rd-outcome-active" : ""}`}
                  style={{ "--oc-bg": o.bg, "--oc-color": o.color } as React.CSSProperties}
                  onClick={() => setOutcomeImmediate(o.key)}>
                  {o.label}
                </button>
              ))}
            </div>

            {cand.converted && (
              <div className="rd-converted-box">
                <div className="rd-converted-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2D5A3D" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                </div>
                <h3 className="rd-converted-title">Candidato convertito</h3>
                <p className="rd-converted-detail">
                  Convertito in <strong>{cand.converted_to === "dipendente" ? "Dipendente" : "Personale a chiamata"}</strong>
                  {cand.converted_at && <> il {new Date(cand.converted_at).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" })}</>}
                </p>
                <div className="rd-id-row">
                  <span className="rd-id-label">Processo di Recruiting:</span>
                  <code className="rd-id-value">{cand.id}</code>
                  <button type="button" className="rd-btn-secondary rd-btn-sm" onClick={() => copyId(cand.id)}>Copia ID</button>
                </div>
                <button type="button" className="rd-btn-secondary" onClick={undoConversion} style={{ marginTop: 12 }}>Annulla conversione</button>
              </div>
            )}

            {(f.outcome || cand.outcome) === "idoneo" && !cand.converted && (
              <div className="rd-convert-section">
                <h3 className="rd-phase-subtitle">Converti in personale</h3>
                <div className="rd-convert-btns">
                  <button type="button" className="rd-convert-btn rd-convert-dip" onClick={() => convertCandidate("dipendente")} disabled={converting}>Converti in Dipendente</button>
                  <button type="button" className="rd-convert-btn rd-convert-ach" onClick={() => convertCandidate("a_chiamata")} disabled={converting}>Converti in A chiamata</button>
                </div>
              </div>
            )}

            {/* Evaluation preview */}
            <div className="rd-eval-preview" style={{ marginTop: 20 }}>
              <h3 className="rd-phase-subtitle">Valutazione di supporto</h3>
              <p className="rd-phase-desc">Punteggio calcolato automaticamente dai dati inseriti nelle fasi precedenti. Ogni criterio ha un peso percentuale; il totale va da 0 a 100. La decisione finale spetta sempre al responsabile.</p>
              <p className="rd-phase-desc" style={{ marginTop: 4, fontSize: 12, color: "#BFA762" }}>85-100 = Molto forte &middot; 70-84 = Buono &middot; 55-69 = Discreto &middot; &lt;55 = Da valutare</p>
              <div className="rd-eval-table">
                <div className="rd-eval-row rd-eval-header">
                  <span className="rd-eval-label">Criterio</span>
                  <span className="rd-eval-value">Valore rilevato</span>
                  <span className="rd-eval-pts">Punteggio</span>
                  <span className="rd-eval-weight">Peso</span>
                </div>
                {score.breakdown.map((b, i) => (
                  <div key={i} className="rd-eval-criterion">
                    <div className="rd-eval-row">
                      <span className="rd-eval-label">{b.label}</span>
                      <span className="rd-eval-value">{b.value}</span>
                      <span className="rd-eval-pts">{b.points}/{b.max}</span>
                      <span className="rd-eval-weight">{b.weight}</span>
                    </div>
                    <div className="rd-eval-hint">{b.hint}</div>
                  </div>
                ))}
                <div className="rd-eval-row rd-eval-total">
                  <span className="rd-eval-label">TOTALE</span>
                  <span className="rd-eval-value" />
                  <span className="rd-eval-pts">{score.total}/100</span>
                  <span className="rd-eval-weight">100%</span>
                </div>
              </div>
              <p className="rd-eval-summary">{score.summary}</p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="rd-nav">
        {phase > 1 && <button type="button" className="rd-btn-secondary" onClick={() => setPhase(phase - 1)}>&larr; Indietro</button>}
        <div style={{ flex: 1 }} />
        <button type="button" className="rd-btn-primary" onClick={saveCurrentPhase} disabled={saving}>
          {saving ? "Salvataggio..." : phase < 6 ? "Salva e continua" : "Salva"}
        </button>
      </div>

      <Modal isOpen={showDelete} onClose={() => setShowDelete(false)} title="Conferma eliminazione" maxWidth={420}>
        <div style={{ fontFamily: "'Albert Sans',sans-serif", fontSize: 15, color: "#1F3326", marginBottom: 20 }}>
          Eliminare il candidato <strong>{cand.first_name} {cand.last_name}</strong> e tutti i file collegati? L&apos;azione è irreversibile.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="rd-btn-secondary" onClick={() => setShowDelete(false)}>Annulla</button>
          <button type="button" className="rd-btn-danger" onClick={deleteCandidate}>Elimina</button>
        </div>
      </Modal>

      <Toast toast={toast} />
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.rd-page { padding: 24px 32px; min-height: 100vh; max-width: 960px; margin: 0 auto; }
.rd-top-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.rd-top-actions { display: flex; gap: 8px; }
.rd-back { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; font-family: 'Albert Sans', sans-serif; font-size: 14px; color: #6C6B5D; cursor: pointer; padding: 4px 0; }
.rd-back:hover { color: #1F3326; }
.rd-header { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
.rd-name { font-family: 'Fraunces', serif; font-size: 28px; font-weight: 600; color: #1F3326; margin: 0; }
.rd-pos { font-family: 'Albert Sans', sans-serif; font-size: 15px; color: #BFA762; margin-top: 4px; display: block; }
.rd-outcome-badge { display: inline-block; padding: 6px 16px; border-radius: 20px; font-family: 'Albert Sans', sans-serif; font-size: 14px; font-weight: 700; white-space: nowrap; margin-top: 4px; transition: all 0.3s; }
.rd-score-mini { margin-left: auto; text-align: center; background: #F3EBDD; border-radius: 10px; padding: 8px 16px; }
.rd-score-label { display: block; font-family: 'Albert Sans', sans-serif; font-size: 11px; color: #6C6B5D; text-transform: uppercase; letter-spacing: 1px; }
.rd-score-val { font-family: 'Bebas Neue', sans-serif; font-size: 24px; color: #BFA762; }

.rd-stepper { display: flex; align-items: flex-start; justify-content: center; gap: 0; margin-bottom: 28px; padding: 16px 0; overflow-x: auto; }
.rd-step-wrap { display: flex; align-items: center; }
.rd-step-line { width: 36px; height: 3px; background: #D8CCB8; border-radius: 2px; margin: 0 4px; flex-shrink: 0; margin-top: 16px; }
.rd-line-active { background: #BFA762; }
.rd-step { display: flex; flex-direction: column; align-items: center; gap: 5px; background: none; border: none; cursor: pointer; padding: 4px 8px; transition: opacity 0.2s; }
.rd-step-num { width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: 'Fraunces', serif; font-size: 15px; font-weight: 600; color: #6C6B5D; border: 2px solid #D8CCB8; background: #fff; transition: all 0.2s; }
.rd-step-cur .rd-step-num { border-color: #BFA762; color: #BFA762; background: #FFF8E1; box-shadow: 0 0 0 4px rgba(191,167,98,0.15); }
.rd-step-label { font-family: 'Albert Sans', sans-serif; font-size: 11px; color: #6C6B5D; white-space: nowrap; }
.rd-step-cur .rd-step-label { color: #BFA762; font-weight: 700; }

.rd-content { background: #fff; border: 1px solid #D8CCB8; border-radius: 14px; padding: 28px; margin-bottom: 16px; }
.rd-phase { display: flex; flex-direction: column; gap: 14px; }
.rd-phase-title { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 600; color: #1F3326; margin: 0 0 2px; }
.rd-phase-subtitle { font-family: 'Albert Sans', sans-serif; font-size: 15px; font-weight: 700; color: #1F3326; margin: 6px 0 0; }
.rd-phase-desc { font-family: 'Albert Sans', sans-serif; font-size: 14px; color: #6C6B5D; margin: 0; }

.rd-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.rd-label { display: block; font-family: 'Albert Sans', sans-serif; font-size: 13px; font-weight: 600; color: #1F3326; margin-bottom: 5px; }
.rd-input { font-family: 'Albert Sans', sans-serif; font-size: 15px; border: 1px solid #D8CCB8; border-radius: 8px; padding: 10px 12px; color: #1F3326; background: #fff; outline: none; transition: border-color 0.2s; width: 100%; box-sizing: border-box; }
.rd-input:focus { border-color: #BFA762; }
.rd-textarea { resize: vertical; min-height: 72px; }

/* Chips */
.rd-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 2px; }
.rd-chip { padding: 8px 16px; border: 1.5px solid #D8CCB8; border-radius: 20px; background: #fff; font-family: 'Albert Sans', sans-serif; font-size: 14px; font-weight: 600; color: #6C6B5D; cursor: pointer; transition: all 0.2s; }
.rd-chip:hover { border-color: #BFA762; color: #1F3326; }
.rd-chip-on { border-color: #1F3326; background: #1F3326; color: #FAF9F5; }
.rd-chip-summary { font-family: 'Albert Sans', sans-serif; font-size: 13px; color: #6C6B5D; margin: 4px 0 0; font-style: italic; }
.rd-inline-add { display: flex; gap: 8px; margin-top: 6px; align-items: center; }

/* Toggle */
.rd-toggle-wrap { display: flex; flex-direction: column; gap: 8px; }
.rd-toggle { display: flex; align-items: center; gap: 10px; width: 100px; height: 40px; border-radius: 20px; border: 2px solid #D8CCB8; background: #F3EBDD; cursor: pointer; padding: 3px; position: relative; transition: all 0.25s; }
.rd-toggle-on { background: #E8F5E9; border-color: #2D5A3D; }
.rd-toggle-knob { width: 32px; height: 32px; border-radius: 50%; background: #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.12); transition: transform 0.25s; }
.rd-toggle-on .rd-toggle-knob { transform: translateX(56px); }
.rd-toggle-text { position: absolute; left: 0; right: 0; text-align: center; font-family: 'Albert Sans', sans-serif; font-size: 14px; font-weight: 700; color: #6C6B5D; pointer-events: none; }
.rd-toggle-on .rd-toggle-text { color: #2D5A3D; }

/* Stars */
.rd-stars { display: flex; align-items: center; gap: 6px; }
.rd-star-btn { background: none; border: none; cursor: pointer; padding: 2px; transition: transform 0.15s; }
.rd-star-btn:hover { transform: scale(1.2); }
.rd-star-val { font-family: 'Fraunces', serif; font-size: 20px; color: #BFA762; margin-left: 8px; }

/* DatePicker */
.dp-wrap { position: relative; }
.dp-trigger { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 10px 12px; border: 1px solid #D8CCB8; border-radius: 8px; background: #fff; font-family: 'Albert Sans', sans-serif; font-size: 15px; color: #1F3326; cursor: pointer; text-align: left; transition: border-color 0.2s; }
.dp-trigger:focus { border-color: #BFA762; outline: none; }
.dp-placeholder { color: #6C6B5D; }
.dp-clear { position: absolute; right: 36px; top: 34px; background: none; border: none; font-size: 18px; color: #6C6B5D; cursor: pointer; padding: 2px 6px; }
.dp-clear:hover { color: #B3261E; }
.dp-dropdown { position: absolute; top: calc(100% + 4px); left: 0; z-index: 100; background: #fff; border: 1px solid #D8CCB8; border-radius: 12px; box-shadow: 0 8px 32px rgba(31,51,38,0.12); padding: 14px; min-width: 300px; }
.dp-nav { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 10px; }
.dp-nav-btn { background: none; border: 1px solid #D8CCB8; border-radius: 8px; width: 36px; height: 36px; font-size: 20px; cursor: pointer; color: #1F3326; display: flex; align-items: center; justify-content: center; }
.dp-nav-btn:hover { background: #F3EBDD; }
.dp-sel { font-family: 'Albert Sans', sans-serif; font-size: 15px; font-weight: 700; color: #1F3326; border: 1px solid #D8CCB8; border-radius: 8px; padding: 6px 8px; background: #fff; cursor: pointer; }
.dp-sel-y { width: 90px; }
.dp-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center; }
.dp-day-label { font-family: 'Albert Sans', sans-serif; font-size: 12px; font-weight: 700; color: #6C6B5D; padding: 6px 0; }
.dp-day, .dp-day-empty { font-family: 'Albert Sans', sans-serif; font-size: 15px; padding: 0; height: 40px; display: flex; align-items: center; justify-content: center; }
.dp-day { background: none; border: none; border-radius: 8px; cursor: pointer; color: #1F3326; font-weight: 600; transition: all 0.15s; }
.dp-day:hover { background: #F3EBDD; }
.dp-day-sel { background: #BFA762 !important; color: #fff !important; }
.dp-day-today { border: 2px solid #BFA762; }
.dp-today-btn { width: 100%; margin-top: 8px; padding: 8px; border: 1px solid #D8CCB8; border-radius: 8px; background: #F3EBDD; font-family: 'Albert Sans', sans-serif; font-size: 14px; font-weight: 600; color: #1F3326; cursor: pointer; }
.dp-today-btn:hover { background: #D8CCB8; }

/* Document checklist */
.rd-check-list { display: flex; flex-direction: column; gap: 8px; }
.rd-check-item { border: 1px solid #F3EBDD; border-radius: 10px; padding: 12px 14px; transition: background 0.2s; }
.rd-check-on { background: #E8F5E9; border-color: #2D5A3D40; }
.rd-check-row { display: flex; align-items: center; gap: 10px; cursor: pointer; }
.rd-check-label { font-family: 'Albert Sans', sans-serif; font-size: 15px; font-weight: 600; color: #1F3326; }
.rd-check-notes { margin-top: 8px; font-size: 13px; padding: 6px 10px; }

/* Follow-up interviews */
.rd-fi-list { display: flex; flex-direction: column; gap: 8px; }
.rd-fi-item { display: flex; align-items: flex-start; gap: 12px; padding: 10px 14px; background: #F3EBDD; border-radius: 8px; }
.rd-fi-date { font-family: 'Albert Sans', sans-serif; font-size: 13px; font-weight: 700; color: #BFA762; white-space: nowrap; min-width: 80px; }
.rd-fi-notes { font-family: 'Albert Sans', sans-serif; font-size: 14px; color: #1F3326; flex: 1; }
.rd-fi-add { display: flex; gap: 8px; align-items: flex-end; margin-top: 8px; flex-wrap: wrap; }

/* Docs uploaded */
.rd-doc-file { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; padding: 6px 10px; background: #F3EBDD; border-radius: 6px; }
.rd-doc-link { font-family: 'Albert Sans', sans-serif; font-size: 13px; color: #1F3326; text-decoration: none; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rd-doc-link:hover { text-decoration: underline; }
.rd-doc-del { background: none; border: none; color: #B3261E; cursor: pointer; font-size: 16px; padding: 0 4px; }
.rd-doc-upload { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px dashed #D8CCB8; border-radius: 8px; font-family: 'Albert Sans', sans-serif; font-size: 14px; color: #6C6B5D; cursor: pointer; transition: border-color 0.2s; }
.rd-doc-upload:hover { border-color: #BFA762; color: #1F3326; }
.rd-hidden { display: none; }

/* Privacy */
.rd-privacy-box { border: 1px solid #F3EBDD; border-radius: 12px; padding: 20px; background: #FAFAF7; }
.rd-privacy-heading { font-family: 'Albert Sans', sans-serif; font-size: 15px; font-weight: 700; color: #1F3326; margin: 0 0 10px; }
.rd-privacy-text { font-family: 'Albert Sans', sans-serif; font-size: 13px; color: #1F3326; line-height: 1.6; white-space: pre-wrap; max-height: 200px; overflow-y: auto; padding: 12px; background: #fff; border: 1px solid #D8CCB8; border-radius: 8px; }
.rd-privacy-warn { display: flex; align-items: center; gap: 8px; padding: 12px; background: #FFF8E1; border-radius: 8px; font-family: 'Albert Sans', sans-serif; font-size: 14px; color: #BFA762; }
.rd-consent-row { margin-top: 4px; }
.rd-consent-label { display: flex; align-items: center; gap: 12px; cursor: pointer; font-family: 'Albert Sans', sans-serif; font-size: 15px; color: #1F3326; padding: 12px 16px; border: 2px solid #D8CCB8; border-radius: 10px; transition: border-color 0.2s; }
.rd-consent-label:has(.rd-consent-check:checked) { border-color: #2D5A3D; background: #E8F5E9; }
.rd-consent-check { width: 20px; height: 20px; accent-color: #2D5A3D; cursor: pointer; flex-shrink: 0; }

/* Signature */
.rd-sig { margin-top: 8px; }
.rd-sig-existing { margin-bottom: 10px; padding: 10px; background: #E8F5E9; border-radius: 8px; display: flex; align-items: center; gap: 10px; }
.rd-sig-img { max-width: 180px; max-height: 70px; border-radius: 4px; border: 1px solid #D8CCB8; }
.rd-sig-saved { font-family: 'Albert Sans', sans-serif; font-size: 12px; color: #2D5A3D; font-weight: 600; }
.rd-sig-label { font-family: 'Albert Sans', sans-serif; font-size: 13px; color: #6C6B5D; margin: 0 0 6px; }
.rd-sig-canvas { border: 2px solid #D8CCB8; border-radius: 10px; cursor: crosshair; background: #fff; touch-action: none; display: block; max-width: 100%; }
.rd-sig-btns { display: flex; gap: 8px; margin-top: 8px; }

/* Outcome */
.rd-outcome-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.rd-outcome-btn { padding: 16px; border: 2px solid #D8CCB8; border-radius: 12px; background: #fff; font-family: 'Albert Sans', sans-serif; font-size: 17px; font-weight: 700; color: #6C6B5D; cursor: pointer; transition: all 0.2s; }
.rd-outcome-btn:hover { border-color: var(--oc-color); color: var(--oc-color); background: var(--oc-bg); }
.rd-outcome-active { border-color: var(--oc-color) !important; color: var(--oc-color) !important; background: var(--oc-bg) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--oc-color) 20%, transparent); }

/* Evaluation preview */
.rd-eval-preview { padding: 16px; border: 1px solid #F3EBDD; border-radius: 12px; background: #FAFAF7; }
.rd-eval-table { margin-top: 10px; }
.rd-eval-row { display: grid; grid-template-columns: 1fr 1fr 70px 50px; gap: 8px; padding: 8px 10px; border-bottom: 1px solid #F3EBDD; font-family: 'Albert Sans', sans-serif; font-size: 13px; align-items: center; }
.rd-eval-header { background: #1F3326; border-radius: 8px 8px 0 0; border-bottom: none; }
.rd-eval-header .rd-eval-label, .rd-eval-header .rd-eval-value, .rd-eval-header .rd-eval-pts, .rd-eval-header .rd-eval-weight { color: #FAF9F5; font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
.rd-eval-criterion { border-bottom: 1px solid #F3EBDD; }
.rd-eval-criterion:last-of-type { border-bottom: none; }
.rd-eval-criterion .rd-eval-row { border-bottom: none; padding-bottom: 2px; }
.rd-eval-hint { font-family: 'Albert Sans', sans-serif; font-size: 11px; color: #6C6B5D; padding: 0 10px 8px; font-style: italic; }
.rd-eval-total { background: #F3EBDD; border-radius: 0 0 8px 8px; font-weight: 700; border-bottom: none; }
.rd-eval-label { color: #1F3326; font-weight: 600; }
.rd-eval-value { color: #6C6B5D; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rd-eval-pts { color: #BFA762; font-weight: 700; text-align: right; }
.rd-eval-weight { color: #6C6B5D; text-align: right; }
.rd-eval-summary { font-family: 'Albert Sans', sans-serif; font-size: 14px; color: #1F3326; margin-top: 8px; font-style: italic; }

/* Conversion */
.rd-convert-section { margin-top: 20px; padding: 20px; border: 1px solid #E8F5E9; border-radius: 12px; background: #FAFAF7; }
.rd-convert-btns { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
.rd-convert-btn { display: flex; align-items: center; gap: 8px; padding: 14px 20px; border: 2px solid; border-radius: 12px; font-family: 'Albert Sans', sans-serif; font-size: 15px; font-weight: 700; cursor: pointer; transition: all 0.2s; }
.rd-convert-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.rd-convert-dip { border-color: #2D5A3D; color: #2D5A3D; background: #E8F5E9; }
.rd-convert-dip:hover:not(:disabled) { background: #2D5A3D; color: #fff; }
.rd-convert-ach { border-color: #4F7B8C; color: #4F7B8C; background: #EBF5F7; }
.rd-convert-ach:hover:not(:disabled) { background: #4F7B8C; color: #fff; }

/* Converted */
.rd-converted-box { text-align: center; padding: 28px; border: 2px solid #E8F5E9; border-radius: 14px; background: #FAFAF7; margin-top: 16px; }
.rd-converted-icon { margin-bottom: 10px; }
.rd-converted-title { font-family: 'Fraunces', serif; font-size: 20px; color: #2D5A3D; margin: 0 0 6px; }
.rd-converted-detail { font-family: 'Albert Sans', sans-serif; font-size: 15px; color: #1F3326; margin: 0 0 8px; }
.rd-id-row { display: flex; align-items: center; gap: 8px; justify-content: center; flex-wrap: wrap; margin-top: 8px; }
.rd-id-label { font-family: 'Albert Sans', sans-serif; font-size: 13px; color: #6C6B5D; }
.rd-id-value { font-family: monospace; font-size: 12px; color: #1F3326; background: #F3EBDD; padding: 4px 8px; border-radius: 4px; word-break: break-all; }

/* Nav */
.rd-nav { display: flex; align-items: center; gap: 8px; padding-top: 4px; }

/* Buttons */
.rd-btn-primary { display: inline-flex; align-items: center; gap: 6px; padding: 11px 20px; background: #1F3326; color: #FAF9F5; border: none; border-radius: 8px; font-family: 'Albert Sans', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
.rd-btn-primary:hover { background: #2a4a35; }
.rd-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.rd-btn-secondary { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; background: #fff; color: #1F3326; border: 1px solid #D8CCB8; border-radius: 8px; font-family: 'Albert Sans', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; }
.rd-btn-secondary:hover { background: #F3EBDD; }
.rd-btn-danger { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; background: #B3261E; color: #fff; border: none; border-radius: 8px; font-family: 'Albert Sans', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; }
.rd-btn-danger:hover { background: #8c1d17; }
.rd-btn-sm { padding: 7px 12px; font-size: 12px; }
.rd-btn-gold { display: inline-flex; align-items: center; gap: 8px; padding: 12px 20px; background: #BFA762; color: #fff; border: none; border-radius: 10px; font-family: 'Albert Sans', sans-serif; font-size: 15px; font-weight: 700; cursor: pointer; transition: background 0.2s; margin-bottom: 8px; }
.rd-btn-gold:hover { background: #a89050; }

/* Skeleton */
.rd-skel { background: linear-gradient(90deg, #F3EBDD 25%, #FAF9F5 50%, #F3EBDD 75%); background-size: 200% 100%; animation: rd-shimmer 1.5s ease-in-out infinite; border-radius: 10px; }
@keyframes rd-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.rd-skel-stepper { height: 56px; margin-bottom: 20px; }
.rd-skel-content { height: 400px; }

@media (max-width: 768px) {
  .rd-page { padding: 16px; }
  .rd-name { font-size: 22px; }
  .rd-grid2 { grid-template-columns: 1fr; }
  .rd-outcome-grid { grid-template-columns: 1fr; }
  .rd-convert-btns { flex-direction: column; }
  .rd-stepper { justify-content: flex-start; }
  .rd-step-line { width: 16px; }
  .rd-content { padding: 18px 14px; }
  .rd-top-row { flex-direction: column; gap: 8px; align-items: flex-start; }
  .rd-fi-add { flex-direction: column; }
  .rd-header { flex-direction: column; }
  .rd-score-mini { margin-left: 0; }
  .dp-dropdown { min-width: 280px; right: 0; left: auto; }
  .rd-eval-row { grid-template-columns: 1fr 80px 60px 40px; }
}
`;
