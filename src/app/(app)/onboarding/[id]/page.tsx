"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Modal } from "@/components/ui/Modal";
import { useRole } from "@/lib/useRole";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/Toast";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/* ── Types ── */
type RDoc = { id: string; candidate_id: string; doc_type: string | null; file_url: string; file_name: string; file_type: string; uploaded_at: string };
type Candidate = {
  id: string; first_name: string; last_name: string; birth_date: string | null;
  residence: string | null; phone: string | null; email: string | null;
  has_car: boolean; distance_km: number | null;
  position_applied: string | null; experience: string | null; languages: string | null;
  availability: string | null; employment_type_sought: string | null; can_start_date: string | null;
  interview_notes: string | null; strengths: string | null; weaknesses: string | null; rating: number | null;
  privacy_consent: boolean; privacy_consent_at: string | null;
  signature_url: string | null; signed_document_url: string | null;
  outcome: string; converted: boolean; converted_to: string | null;
  converted_at: string | null; onboarding_process_id: string | null;
  current_phase: number; completed_phases: number[];
  created_by: string | null; created_at: string; updated_at: string;
  recruitment_documents: RDoc[];
};
type TplItem = { id: string; template_id: string; category: string; title: string; description: string; requires_file: boolean; sort_order: number };
type Tpl = { id: string; role_name: string; description: string; is_active: boolean; onboarding_template_items: TplItem[] };

/* ── Constants ── */
const PHASES = [
  { num: 1, label: "Anagrafici" }, { num: 2, label: "Esperienza" },
  { num: 3, label: "Valutazione" }, { num: 4, label: "Documenti" },
  { num: 5, label: "Privacy" }, { num: 6, label: "Esito" },
];
const DOC_TYPES = [
  { key: "documento_identita", label: "Documento d'identità" },
  { key: "codice_fiscale", label: "Codice fiscale" },
  { key: "permesso_soggiorno", label: "Permesso di soggiorno" },
  { key: "cv", label: "CV" },
  { key: "certificazione", label: "Certificazione" },
  { key: "altro", label: "Altro" },
];
const OUTCOME_OPTS = [
  { key: "in_valutazione", label: "In valutazione", color: "#BFA762", bg: "#FFF8E1" },
  { key: "da_richiamare", label: "Da richiamare", color: "#6C6B5D", bg: "#F3EBDD" },
  { key: "idoneo", label: "Idoneo", color: "#2D5A3D", bg: "#E8F5E9" },
  { key: "non_idoneo", label: "Non idoneo", color: "#B3261E", bg: "#FDECEB" },
];

function storagePathFromUrl(url: string): string {
  const idx = url.indexOf("/recruitment-files/");
  return idx >= 0 ? decodeURIComponent(url.substring(idx + "/recruitment-files/".length)) : "";
}

/* ── Stepper ── */
function Stepper({ current, completed, onNav }: { current: number; completed: number[]; onNav: (p: number) => void }) {
  return (
    <div className="rd-stepper">
      {PHASES.map((p, i) => {
        const done = completed.includes(p.num);
        const isCur = current === p.num;
        const canClick = done || isCur;
        return (
          <div key={p.num} className="rd-step-wrap">
            {i > 0 && <div className={`rd-step-line${done || isCur ? " rd-line-active" : ""}`} />}
            <button className={`rd-step${isCur ? " rd-step-cur" : ""}${done ? " rd-step-done" : ""}`}
              onClick={() => canClick && onNav(p.num)} disabled={!canClick} type="button">
              <span className="rd-step-num">{done ? "✓" : p.num}</span>
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
    ctx.strokeStyle = "#1F3326";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
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
      <canvas ref={canvasRef} width={480} height={180}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        className="rd-sig-canvas" />
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
  const { isAdmin, loading: roleLoading, userId } = useRole();
  const { toast, showToast } = useToast();

  const [cand, setCand] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState(1);
  const [saving, setSaving] = useState(false);

  /* Form mirrors */
  const [f, setF] = useState<Record<string, unknown>>({});
  const upd = (k: string, v: unknown) => setF(prev => ({ ...prev, [k]: v }));

  /* Privacy text from settings */
  const [privacyText, setPrivacyText] = useState("");
  const [privacyEditing, setPrivacyEditing] = useState(false);
  const [privacyDraft, setPrivacyDraft] = useState("");

  /* Templates for conversion */
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [convTemplate, setConvTemplate] = useState("");
  const [converting, setConverting] = useState(false);

  const [showDelete, setShowDelete] = useState(false);

  /* ── Load ── */
  const loadCandidate = useCallback(async () => {
    const { data, error } = await supabase.from("recruitment_candidates")
      .select("*, recruitment_documents(id, candidate_id, doc_type, file_url, file_name, file_type, uploaded_at)")
      .eq("id", id).single();
    if (error || !data) { showToast("Candidato non trovato", "error"); router.push("/onboarding"); return; }
    const c = data as unknown as Candidate;
    setCand(c);
    setPhase(c.current_phase);
    setF({
      first_name: c.first_name, last_name: c.last_name, birth_date: c.birth_date ?? "",
      residence: c.residence ?? "", phone: c.phone ?? "", email: c.email ?? "",
      has_car: c.has_car, distance_km: c.distance_km ?? "",
      position_applied: c.position_applied ?? "", experience: c.experience ?? "",
      languages: c.languages ?? "", availability: c.availability ?? "",
      employment_type_sought: c.employment_type_sought ?? "", can_start_date: c.can_start_date ?? "",
      interview_notes: c.interview_notes ?? "", strengths: c.strengths ?? "",
      weaknesses: c.weaknesses ?? "", rating: c.rating ?? 0,
      privacy_consent: c.privacy_consent, outcome: c.outcome,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (roleLoading) return;
    Promise.all([
      loadCandidate(),
      supabase.from("settings").select("value").eq("key", "recruitment_privacy_text").single().then(({ data }) => { setPrivacyText(typeof data?.value === "string" ? data.value : ""); }),
      supabase.from("onboarding_templates").select("id, role_name, description, is_active, onboarding_template_items(id, template_id, category, title, description, requires_file, sort_order)").order("created_at", { ascending: false }).then(({ data }) => { setTemplates((data ?? []) as unknown as Tpl[]); }),
    ]).then(() => setLoading(false));
  }, [roleLoading, loadCandidate]);

  /* ── Save phase ── */
  async function savePhase(phaseNum: number, extra?: Record<string, unknown>) {
    if (!cand) return;
    setSaving(true);
    const completed = cand.completed_phases.includes(phaseNum) ? cand.completed_phases : [...cand.completed_phases, phaseNum];
    const nextPhase = Math.min(phaseNum + 1, 6);
    const payload: Record<string, unknown> = { ...extra, current_phase: nextPhase, completed_phases: completed };

    if (phaseNum === 1) Object.assign(payload, { first_name: f.first_name, last_name: f.last_name, birth_date: f.birth_date || null, residence: f.residence || null, phone: f.phone || null, email: f.email || null, has_car: f.has_car, distance_km: f.distance_km ? Number(f.distance_km) : null });
    if (phaseNum === 2) Object.assign(payload, { position_applied: f.position_applied || null, experience: f.experience || null, languages: f.languages || null, availability: f.availability || null, employment_type_sought: f.employment_type_sought || null, can_start_date: f.can_start_date || null });
    if (phaseNum === 3) Object.assign(payload, { interview_notes: f.interview_notes || null, strengths: f.strengths || null, weaknesses: f.weaknesses || null, rating: f.rating ? Number(f.rating) : null });
    if (phaseNum === 5) Object.assign(payload, { privacy_consent: f.privacy_consent, privacy_consent_at: f.privacy_consent ? new Date().toISOString() : null });
    if (phaseNum === 6) Object.assign(payload, { outcome: f.outcome });

    const { error } = await supabase.from("recruitment_candidates").update(payload).eq("id", cand.id);
    if (error) { showToast("Errore salvataggio", "error"); setSaving(false); return; }
    showToast("Fase salvata", "ok");
    setSaving(false);
    await loadCandidate();
    if (phaseNum < 6) setPhase(nextPhase);
  }

  /* ── File upload ── */
  async function uploadDoc(docType: string, file: File) {
    if (!cand) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const path = `recruitment/${cand.id}/${docType}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("recruitment-files").upload(path, file);
    if (error) { showToast("Errore upload", "error"); return; }
    const { data: { publicUrl } } = supabase.storage.from("recruitment-files").getPublicUrl(path);
    await supabase.from("recruitment_documents").insert({ candidate_id: cand.id, doc_type: docType, file_url: publicUrl, file_name: file.name, file_type: file.type });
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

  /* ── Signature upload ── */
  async function uploadSignature(blob: Blob) {
    if (!cand) return;
    const path = `recruitment/${cand.id}/signature/${Date.now()}.png`;
    const { error } = await supabase.storage.from("recruitment-files").upload(path, blob, { contentType: "image/png" });
    if (error) { showToast("Errore upload firma", "error"); return; }
    const { data: { publicUrl } } = supabase.storage.from("recruitment-files").getPublicUrl(path);
    await supabase.from("recruitment_candidates").update({ signature_url: publicUrl }).eq("id", cand.id);
    showToast("Firma salvata", "ok");
    loadCandidate();
  }

  async function uploadSignedDoc(file: File) {
    if (!cand) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const path = `recruitment/${cand.id}/signed_doc/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("recruitment-files").upload(path, file);
    if (error) { showToast("Errore upload", "error"); return; }
    const { data: { publicUrl } } = supabase.storage.from("recruitment-files").getPublicUrl(path);
    await supabase.from("recruitment_candidates").update({ signed_document_url: publicUrl }).eq("id", cand.id);
    showToast("Documento firmato caricato", "ok");
    loadCandidate();
  }

  /* ── Save privacy text (admin) ── */
  async function savePrivacyText() {
    await supabase.from("settings").upsert({ key: "recruitment_privacy_text", value: privacyDraft });
    setPrivacyText(privacyDraft);
    setPrivacyEditing(false);
    showToast("Testo informativa salvato", "ok");
  }

  /* ── Conversion ── */
  async function convertCandidate(type: "dipendente" | "a_chiamata") {
    if (!cand) return;
    setConverting(true);
    const { data: proc, error } = await supabase.from("onboarding_processes").insert({
      employee_name: `${cand.first_name} ${cand.last_name}`,
      employee_role: cand.position_applied || "",
      template_id: convTemplate || null,
      created_by: userId,
    }).select("id").single();
    if (error || !proc) { showToast("Errore creazione onboarding", "error"); setConverting(false); return; }

    if (convTemplate) {
      const tpl = templates.find(t => t.id === convTemplate);
      if (tpl?.onboarding_template_items.length) {
        await supabase.from("onboarding_process_items").insert(
          tpl.onboarding_template_items.map((ti, i) => ({ process_id: proc.id, category: ti.category, title: ti.title, description: ti.description, requires_file: ti.requires_file, sort_order: i }))
        );
      }
    }

    await supabase.from("recruitment_candidates").update({
      converted: true, converted_to: type, converted_at: new Date().toISOString(),
      onboarding_process_id: proc.id, outcome: "idoneo",
    }).eq("id", cand.id);
    showToast(`Convertito in ${type === "dipendente" ? "Dipendente" : "A chiamata"} — onboarding avviato`, "ok");
    setConverting(false);
    loadCandidate();
  }

  /* ── Delete ── */
  async function deleteCandidate() {
    if (!cand) return;
    const docs = cand.recruitment_documents;
    const urls: string[] = docs.map(d => d.file_url);
    if (cand.signature_url) urls.push(cand.signature_url);
    if (cand.signed_document_url) urls.push(cand.signed_document_url);
    const paths = urls.map(storagePathFromUrl).filter(Boolean);
    if (paths.length) await supabase.storage.from("recruitment-files").remove(paths);
    await supabase.from("recruitment_candidates").delete().eq("id", cand.id);
    showToast("Candidato eliminato", "ok");
    router.push("/onboarding");
  }

  /* ── Render ── */
  if (loading || !cand) return (
    <div className="rd-page">
      <div className="rd-skel rd-skel-stepper" />
      <div className="rd-skel rd-skel-content" />
      <style>{CSS}</style>
    </div>
  );

  const fStr = (k: string) => (f[k] as string) ?? "";
  const isImg = (t: string) => t.startsWith("image/");

  return (
    <div className="rd-page">
      {/* Back */}
      <button className="rd-back" onClick={() => router.push("/onboarding")} type="button">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        Torna alla lista
      </button>

      {/* Header */}
      <div className="rd-header">
        <h1 className="rd-name">{cand.first_name} {cand.last_name}</h1>
        {cand.position_applied && <span className="rd-pos">{cand.position_applied}</span>}
      </div>

      {/* Stepper */}
      <Stepper current={phase} completed={cand.completed_phases} onNav={setPhase} />

      {/* Phase Content */}
      <div className="rd-content">
        {/* ── Phase 1: Anagrafici ── */}
        {phase === 1 && (
          <div className="rd-phase">
            <h2 className="rd-phase-title">Dati anagrafici</h2>
            <div className="rd-grid2">
              <div><label className="rd-label">Nome *</label><input className="rd-input" value={fStr("first_name")} onChange={e => upd("first_name", e.target.value)} /></div>
              <div><label className="rd-label">Cognome *</label><input className="rd-input" value={fStr("last_name")} onChange={e => upd("last_name", e.target.value)} /></div>
              <div><label className="rd-label">Data di nascita</label><input className="rd-input" type="date" value={fStr("birth_date")} onChange={e => upd("birth_date", e.target.value)} /></div>
              <div><label className="rd-label">Residenza / Dove abita</label><input className="rd-input" value={fStr("residence")} onChange={e => upd("residence", e.target.value)} placeholder="es. Verona, San Giovanni Lupatoto" /></div>
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
              <div><label className="rd-label">Distanza km dall&apos;hotel</label><input className="rd-input" type="number" min="0" value={fStr("distance_km")} onChange={e => upd("distance_km", e.target.value)} placeholder="km" /></div>
            </div>
          </div>
        )}

        {/* ── Phase 2: Esperienza ── */}
        {phase === 2 && (
          <div className="rd-phase">
            <h2 className="rd-phase-title">Esperienza e profilo</h2>
            <div className="rd-grid2">
              <div><label className="rd-label">Posizione per cui si candida</label><input className="rd-input" value={fStr("position_applied")} onChange={e => upd("position_applied", e.target.value)} placeholder="es. Receptionist, Cameriere ai piani" /></div>
              <div><label className="rd-label">Tipo impiego cercato</label>
                <select className="rd-input" value={fStr("employment_type_sought")} onChange={e => upd("employment_type_sought", e.target.value)}>
                  <option value="">— Seleziona —</option>
                  <option value="full-time">Full-time</option><option value="part-time">Part-time</option><option value="stagionale">Stagionale</option>
                </select>
              </div>
            </div>
            <label className="rd-label">Esperienza precedente</label>
            <textarea className="rd-input rd-textarea" value={fStr("experience")} onChange={e => upd("experience", e.target.value)} rows={5} placeholder="Descrivere esperienze lavorative rilevanti..." />
            <div className="rd-grid2">
              <div><label className="rd-label">Lingue parlate</label><input className="rd-input" value={fStr("languages")} onChange={e => upd("languages", e.target.value)} placeholder="es. Italiano, Inglese B2, Tedesco A1" /></div>
              <div><label className="rd-label">Disponibilità</label><input className="rd-input" value={fStr("availability")} onChange={e => upd("availability", e.target.value)} placeholder="es. Da subito, mattina e sera" /></div>
            </div>
            <label className="rd-label">Data possibile inizio</label>
            <input className="rd-input" type="date" value={fStr("can_start_date")} onChange={e => upd("can_start_date", e.target.value)} style={{ maxWidth: 220 }} />
          </div>
        )}

        {/* ── Phase 3: Valutazione ── */}
        {phase === 3 && (
          <div className="rd-phase">
            <h2 className="rd-phase-title">Valutazione colloquio</h2>
            <label className="rd-label">Note del colloquio</label>
            <textarea className="rd-input rd-textarea" value={fStr("interview_notes")} onChange={e => upd("interview_notes", e.target.value)} rows={6} placeholder="Impressioni, dettagli discussi, domande poste..." />
            <div className="rd-grid2">
              <div><label className="rd-label">Punti di forza</label><textarea className="rd-input rd-textarea" value={fStr("strengths")} onChange={e => upd("strengths", e.target.value)} rows={3} /></div>
              <div><label className="rd-label">Punti deboli</label><textarea className="rd-input rd-textarea" value={fStr("weaknesses")} onChange={e => upd("weaknesses", e.target.value)} rows={3} /></div>
            </div>
            <label className="rd-label">Valutazione complessiva</label>
            <StarSelect value={Number(f.rating) || 0} onChange={v => upd("rating", v)} />
          </div>
        )}

        {/* ── Phase 4: Documenti ── */}
        {phase === 4 && (
          <div className="rd-phase">
            <h2 className="rd-phase-title">Documenti</h2>
            <div className="rd-doc-grid">
              {DOC_TYPES.map(dt => {
                const docs = cand.recruitment_documents.filter(d => d.doc_type === dt.key);
                return (
                  <div key={dt.key} className="rd-doc-area">
                    <span className="rd-doc-type-label">{dt.label}</span>
                    {docs.map(doc => (
                      <div key={doc.id} className="rd-doc-file">
                        {isImg(doc.file_type) && <img src={doc.file_url} alt="" className="rd-doc-thumb" />}
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="rd-doc-link">{doc.file_name || "File"}</a>
                        <button type="button" className="rd-doc-del" onClick={() => deleteDoc(doc)}>×</button>
                      </div>
                    ))}
                    <label className="rd-doc-upload">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                      Carica
                      <input type="file" className="rd-hidden" onChange={e => { if (e.target.files?.[0]) uploadDoc(dt.key, e.target.files[0]); e.target.value = ""; }} />
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Phase 5: Privacy ── */}
        {phase === 5 && (
          <div className="rd-phase">
            <h2 className="rd-phase-title">Privacy e consenso</h2>
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
                      <textarea className="rd-input rd-textarea" value={privacyDraft} onChange={e => setPrivacyDraft(e.target.value)} rows={6} placeholder="Incolla qui il testo dell'informativa privacy..." />
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

            <h3 className="rd-phase-subtitle">Firma del candidato</h3>
            <SignaturePad existingUrl={cand.signature_url} onSave={uploadSignature} />

            <h3 className="rd-phase-subtitle" style={{ marginTop: 24 }}>Oppure: carica modulo firmato</h3>
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

            {cand.converted ? (
              <div className="rd-converted-box">
                <div className="rd-converted-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2D5A3D" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                </div>
                <h3 className="rd-converted-title">Candidato convertito</h3>
                <p className="rd-converted-detail">
                  Convertito in <strong>{cand.converted_to === "dipendente" ? "Dipendente" : "Personale a chiamata"}</strong>
                  {cand.converted_at && <> il {new Date(cand.converted_at).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" })}</>}
                </p>
                {cand.onboarding_process_id && (
                  <p className="rd-converted-ob">Processo di onboarding operativo avviato (ID: {cand.onboarding_process_id.substring(0, 8)}...)</p>
                )}
              </div>
            ) : (
              <>
                <p className="rd-phase-desc">Seleziona l&apos;esito del colloquio:</p>
                <div className="rd-outcome-grid">
                  {OUTCOME_OPTS.map(o => (
                    <button key={o.key} type="button"
                      className={`rd-outcome-btn${f.outcome === o.key ? " rd-outcome-active" : ""}`}
                      style={{ "--oc-bg": o.bg, "--oc-color": o.color } as React.CSSProperties}
                      onClick={() => upd("outcome", o.key)}>
                      {o.label}
                    </button>
                  ))}
                </div>

                {f.outcome === "idoneo" && !cand.converted && (
                  <div className="rd-convert-section">
                    <h3 className="rd-phase-subtitle">Converti in personale</h3>
                    <label className="rd-label">Template onboarding (opzionale)</label>
                    <select className="rd-input" value={convTemplate} onChange={e => setConvTemplate(e.target.value)} style={{ maxWidth: 400 }}>
                      <option value="">— Nessun template —</option>
                      {templates.filter(t => t.is_active).map(t => (
                        <option key={t.id} value={t.id}>{t.role_name} ({t.onboarding_template_items.length} voci)</option>
                      ))}
                    </select>
                    <div className="rd-convert-btns">
                      <button type="button" className="rd-convert-btn rd-convert-dip" onClick={() => convertCandidate("dipendente")} disabled={converting}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></svg>
                        Converti in Dipendente
                      </button>
                      <button type="button" className="rd-convert-btn rd-convert-ach" onClick={() => convertCandidate("a_chiamata")} disabled={converting}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg>
                        Converti in A chiamata
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="rd-nav">
        {phase > 1 && <button type="button" className="rd-btn-secondary" onClick={() => setPhase(phase - 1)}>← Indietro</button>}
        <div style={{ flex: 1 }} />
        {(isAdmin) && (
          <button type="button" className="rd-btn-danger rd-btn-sm" onClick={() => setShowDelete(true)} style={{ marginRight: 8 }}>Elimina candidato</button>
        )}
        {phase < 6 ? (
          <button type="button" className="rd-btn-primary" onClick={() => savePhase(phase)} disabled={saving}>{saving ? "Salvataggio..." : "Salva e continua →"}</button>
        ) : !cand.converted ? (
          <button type="button" className="rd-btn-primary" onClick={() => savePhase(6)} disabled={saving}>{saving ? "Salvataggio..." : "Salva esito"}</button>
        ) : null}
      </div>

      {/* Delete Modal */}
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
.rd-back { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; font-family: 'Albert Sans', sans-serif; font-size: 14px; color: #6C6B5D; cursor: pointer; padding: 4px 0; margin-bottom: 12px; }
.rd-back:hover { color: #1F3326; }
.rd-header { margin-bottom: 24px; }
.rd-name { font-family: 'Fraunces', serif; font-size: 30px; font-weight: 600; color: #1F3326; margin: 0; }
.rd-pos { font-family: 'Albert Sans', sans-serif; font-size: 16px; color: #BFA762; margin-top: 4px; display: block; }

/* Stepper */
.rd-stepper { display: flex; align-items: flex-start; justify-content: center; gap: 0; margin-bottom: 32px; padding: 20px 0; overflow-x: auto; }
.rd-step-wrap { display: flex; align-items: center; }
.rd-step-line { width: 40px; height: 3px; background: #D8CCB8; border-radius: 2px; margin: 0 4px; flex-shrink: 0; margin-top: 16px; }
.rd-line-active { background: #BFA762; }
.rd-step { display: flex; flex-direction: column; align-items: center; gap: 6px; background: none; border: none; cursor: pointer; padding: 4px 8px; opacity: 0.4; transition: opacity 0.2s; }
.rd-step:not(:disabled) { opacity: 1; }
.rd-step-cur { opacity: 1; }
.rd-step-done { opacity: 1; }
.rd-step-num { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: 'Fraunces', serif; font-size: 16px; font-weight: 600; color: #6C6B5D; border: 2px solid #D8CCB8; background: #fff; transition: all 0.2s; }
.rd-step-cur .rd-step-num { border-color: #BFA762; color: #BFA762; background: #FFF8E1; box-shadow: 0 0 0 4px rgba(191,167,98,0.15); }
.rd-step-done .rd-step-num { border-color: #2D5A3D; color: #fff; background: #2D5A3D; }
.rd-step-label { font-family: 'Albert Sans', sans-serif; font-size: 12px; color: #6C6B5D; white-space: nowrap; }
.rd-step-cur .rd-step-label { color: #BFA762; font-weight: 700; }
.rd-step-done .rd-step-label { color: #2D5A3D; }

/* Content */
.rd-content { background: #fff; border: 1px solid #D8CCB8; border-radius: 14px; padding: 28px; margin-bottom: 20px; }
.rd-phase { display: flex; flex-direction: column; gap: 16px; }
.rd-phase-title { font-family: 'Fraunces', serif; font-size: 24px; font-weight: 600; color: #1F3326; margin: 0 0 4px; }
.rd-phase-subtitle { font-family: 'Albert Sans', sans-serif; font-size: 16px; font-weight: 700; color: #1F3326; margin: 8px 0 0; }
.rd-phase-desc { font-family: 'Albert Sans', sans-serif; font-size: 15px; color: #6C6B5D; margin: 0; }

.rd-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.rd-label { display: block; font-family: 'Albert Sans', sans-serif; font-size: 14px; font-weight: 600; color: #1F3326; margin-bottom: 6px; }
.rd-input { font-family: 'Albert Sans', sans-serif; font-size: 15px; border: 1px solid #D8CCB8; border-radius: 8px; padding: 11px 14px; color: #1F3326; background: #fff; outline: none; transition: border-color 0.2s; width: 100%; box-sizing: border-box; }
.rd-input:focus { border-color: #BFA762; }
.rd-textarea { resize: vertical; min-height: 80px; }

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

/* Docs */
.rd-doc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
.rd-doc-area { border: 1px solid #F3EBDD; border-radius: 10px; padding: 16px; }
.rd-doc-type-label { display: block; font-family: 'Albert Sans', sans-serif; font-size: 15px; font-weight: 700; color: #1F3326; margin-bottom: 10px; }
.rd-doc-file { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding: 6px 10px; background: #F3EBDD; border-radius: 6px; }
.rd-doc-thumb { width: 36px; height: 36px; object-fit: cover; border-radius: 4px; }
.rd-doc-link { font-family: 'Albert Sans', sans-serif; font-size: 13px; color: #1F3326; text-decoration: none; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rd-doc-link:hover { text-decoration: underline; }
.rd-doc-del { background: none; border: none; color: #B3261E; cursor: pointer; font-size: 16px; padding: 0 4px; }
.rd-doc-upload { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px dashed #D8CCB8; border-radius: 8px; font-family: 'Albert Sans', sans-serif; font-size: 14px; color: #6C6B5D; cursor: pointer; transition: border-color 0.2s; }
.rd-doc-upload:hover { border-color: #BFA762; color: #1F3326; }
.rd-hidden { display: none; }

/* Privacy */
.rd-privacy-box { border: 1px solid #F3EBDD; border-radius: 12px; padding: 20px; background: #FAFAF7; }
.rd-privacy-heading { font-family: 'Albert Sans', sans-serif; font-size: 16px; font-weight: 700; color: #1F3326; margin: 0 0 12px; }
.rd-privacy-text { font-family: 'Albert Sans', sans-serif; font-size: 14px; color: #1F3326; line-height: 1.6; white-space: pre-wrap; max-height: 240px; overflow-y: auto; padding: 12px; background: #fff; border: 1px solid #D8CCB8; border-radius: 8px; }
.rd-privacy-warn { display: flex; align-items: center; gap: 8px; padding: 12px; background: #FFF8E1; border-radius: 8px; font-family: 'Albert Sans', sans-serif; font-size: 14px; color: #BFA762; }
.rd-consent-row { margin-top: 8px; }
.rd-consent-label { display: flex; align-items: center; gap: 12px; cursor: pointer; font-family: 'Albert Sans', sans-serif; font-size: 16px; color: #1F3326; padding: 12px 16px; border: 2px solid #D8CCB8; border-radius: 10px; transition: border-color 0.2s; }
.rd-consent-label:has(.rd-consent-check:checked) { border-color: #2D5A3D; background: #E8F5E9; }
.rd-consent-check { width: 22px; height: 22px; accent-color: #2D5A3D; cursor: pointer; flex-shrink: 0; }

/* Signature */
.rd-sig { margin-top: 8px; }
.rd-sig-existing { margin-bottom: 12px; padding: 12px; background: #E8F5E9; border-radius: 8px; display: flex; align-items: center; gap: 12px; }
.rd-sig-img { max-width: 200px; max-height: 80px; border-radius: 4px; border: 1px solid #D8CCB8; }
.rd-sig-saved { font-family: 'Albert Sans', sans-serif; font-size: 13px; color: #2D5A3D; font-weight: 600; }
.rd-sig-label { font-family: 'Albert Sans', sans-serif; font-size: 14px; color: #6C6B5D; margin: 0 0 8px; }
.rd-sig-canvas { border: 2px solid #D8CCB8; border-radius: 10px; cursor: crosshair; background: #fff; touch-action: none; display: block; max-width: 100%; }
.rd-sig-btns { display: flex; gap: 8px; margin-top: 8px; }

/* Outcome */
.rd-outcome-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.rd-outcome-btn { padding: 18px; border: 2px solid #D8CCB8; border-radius: 12px; background: #fff; font-family: 'Albert Sans', sans-serif; font-size: 18px; font-weight: 700; color: #6C6B5D; cursor: pointer; transition: all 0.2s; }
.rd-outcome-btn:hover { border-color: var(--oc-color); color: var(--oc-color); background: var(--oc-bg); }
.rd-outcome-active { border-color: var(--oc-color) !important; color: var(--oc-color) !important; background: var(--oc-bg) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--oc-color) 20%, transparent); }

/* Conversion */
.rd-convert-section { margin-top: 24px; padding: 20px; border: 1px solid #E8F5E9; border-radius: 12px; background: #FAFAF7; }
.rd-convert-btns { display: flex; gap: 12px; margin-top: 16px; flex-wrap: wrap; }
.rd-convert-btn { display: flex; align-items: center; gap: 10px; padding: 16px 24px; border: 2px solid; border-radius: 12px; font-family: 'Albert Sans', sans-serif; font-size: 16px; font-weight: 700; cursor: pointer; transition: all 0.2s; }
.rd-convert-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.rd-convert-dip { border-color: #2D5A3D; color: #2D5A3D; background: #E8F5E9; }
.rd-convert-dip:hover:not(:disabled) { background: #2D5A3D; color: #fff; }
.rd-convert-ach { border-color: #4F7B8C; color: #4F7B8C; background: #EBF5F7; }
.rd-convert-ach:hover:not(:disabled) { background: #4F7B8C; color: #fff; }

/* Converted */
.rd-converted-box { text-align: center; padding: 32px; border: 2px solid #E8F5E9; border-radius: 14px; background: #FAFAF7; }
.rd-converted-icon { margin-bottom: 12px; }
.rd-converted-title { font-family: 'Fraunces', serif; font-size: 22px; color: #2D5A3D; margin: 0 0 8px; }
.rd-converted-detail { font-family: 'Albert Sans', sans-serif; font-size: 16px; color: #1F3326; margin: 0 0 6px; }
.rd-converted-ob { font-family: 'Albert Sans', sans-serif; font-size: 13px; color: #6C6B5D; margin: 0; }

/* Nav */
.rd-nav { display: flex; align-items: center; gap: 8px; padding-top: 4px; }

/* Buttons */
.rd-btn-primary { display: inline-flex; align-items: center; gap: 6px; padding: 12px 22px; background: #1F3326; color: #FAF9F5; border: none; border-radius: 8px; font-family: 'Albert Sans', sans-serif; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
.rd-btn-primary:hover { background: #2a4a35; }
.rd-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.rd-btn-secondary { display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px; background: #fff; color: #1F3326; border: 1px solid #D8CCB8; border-radius: 8px; font-family: 'Albert Sans', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; }
.rd-btn-secondary:hover { background: #F3EBDD; }
.rd-btn-danger { display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px; background: #B3261E; color: #fff; border: none; border-radius: 8px; font-family: 'Albert Sans', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; }
.rd-btn-danger:hover { background: #8c1d17; }
.rd-btn-sm { padding: 7px 14px; font-size: 13px; }

/* Skeleton */
.rd-skel { background: linear-gradient(90deg, #F3EBDD 25%, #FAF9F5 50%, #F3EBDD 75%); background-size: 200% 100%; animation: rd-shimmer 1.5s ease-in-out infinite; border-radius: 10px; }
@keyframes rd-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.rd-skel-stepper { height: 60px; margin-bottom: 24px; }
.rd-skel-content { height: 400px; }

@media (max-width: 768px) {
  .rd-page { padding: 16px; }
  .rd-name { font-size: 24px; }
  .rd-grid2 { grid-template-columns: 1fr; }
  .rd-outcome-grid { grid-template-columns: 1fr; }
  .rd-convert-btns { flex-direction: column; }
  .rd-stepper { gap: 0; justify-content: flex-start; }
  .rd-step-line { width: 20px; }
  .rd-doc-grid { grid-template-columns: 1fr; }
  .rd-content { padding: 20px 16px; }
}
`;
