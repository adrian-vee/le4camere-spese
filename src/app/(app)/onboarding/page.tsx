"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
type ProcessDoc = { id: string; process_item_id: string; file_url: string; file_name: string; file_type: string };
type ProcessItem = {
  id: string; process_id: string; category: string; title: string; description: string;
  requires_file: boolean; is_completed: boolean; completed_at: string | null;
  completed_by: string | null; sort_order: number;
  completer: { full_name: string | null } | null;
  onboarding_documents: ProcessDoc[];
};
type Process = {
  id: string; employee_name: string; employee_role: string; template_id: string | null;
  status: string; start_date: string; target_date: string | null; notes: string;
  created_by: string | null; created_at: string; updated_at: string;
  author: { full_name: string | null } | null;
  onboarding_process_items: ProcessItem[];
};
type TemplateItem = {
  id: string; template_id: string; category: string; title: string;
  description: string; requires_file: boolean; sort_order: number;
};
type Template = {
  id: string; role_name: string; description: string; is_active: boolean;
  created_by: string | null; created_at: string;
  onboarding_template_items: TemplateItem[];
};
type FormItem = { category: string; title: string; description: string; requires_file: boolean };

/* ── Constants ── */
const CATEGORIES = ["documenti", "formazione", "accessi"] as const;
const CAT_LABELS: Record<string, string> = { documenti: "Documenti", formazione: "Formazione", accessi: "Accessi" };
const CAT_COLORS: Record<string, string> = { documenti: "#4F7B8C", formazione: "#BFA762", accessi: "#2D5A3D" };

const PROCESS_COLS = `id, employee_name, employee_role, template_id, status, start_date, target_date, notes, created_by, created_at, updated_at,
  author:profiles!created_by(full_name),
  onboarding_process_items(id, process_id, category, title, description, requires_file, is_completed, completed_at, completed_by, sort_order,
    completer:profiles!completed_by(full_name),
    onboarding_documents(id, process_item_id, file_url, file_name, file_type)
  )`;

const TEMPLATE_COLS = `id, role_name, description, is_active, created_by, created_at,
  onboarding_template_items(id, template_id, category, title, description, requires_file, sort_order)`;

const STATUS_LABELS: Record<string, string> = { in_corso: "In corso", completato: "Completato", sospeso: "Sospeso" };
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  in_corso: { bg: "#FFF8E1", text: "#BFA762" },
  completato: { bg: "#E8F5E9", text: "#2D5A3D" },
  sospeso: { bg: "#F3EBDD", text: "#6C6B5D" },
};

const EXAMPLE_TEMPLATES = [
  {
    role_name: "Receptionist",
    description: "Percorso completo per il personale di reception",
    items: [
      { category: "documenti", title: "Contratto firmato", requires_file: true },
      { category: "documenti", title: "Documento d'identità", requires_file: true },
      { category: "documenti", title: "Codice fiscale", requires_file: true },
      { category: "formazione", title: "Uso gestionale", requires_file: false },
      { category: "formazione", title: "Procedura check-in/check-out", requires_file: false },
      { category: "formazione", title: "Gestione cassa", requires_file: false },
      { category: "formazione", title: "Gestione reclami", requires_file: false },
      { category: "accessi", title: "Account gestionale", requires_file: false },
      { category: "accessi", title: "Email aziendale", requires_file: false },
      { category: "accessi", title: "Chiavi e badge", requires_file: false },
    ],
  },
  {
    role_name: "Cameriere ai piani",
    description: "Percorso per il personale housekeeping",
    items: [
      { category: "documenti", title: "Contratto firmato", requires_file: true },
      { category: "documenti", title: "Documento d'identità", requires_file: true },
      { category: "documenti", title: "Attestato HACCP", requires_file: true },
      { category: "formazione", title: "Procedura pulizia camere", requires_file: false },
      { category: "formazione", title: "Uso prodotti e sicurezza", requires_file: false },
      { category: "formazione", title: "Gestione biancheria", requires_file: false },
      { category: "accessi", title: "Badge accesso piani", requires_file: false },
      { category: "accessi", title: "Account gestionale", requires_file: false },
    ],
  },
];

/* ── Progress Ring ── */
function Ring({ pct, size = 56 }: { pct: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  return (
    <svg width={size} height={size} style={{ display: "block" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F3EBDD" strokeWidth={5} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={pct === 100 ? "#2D5A3D" : "#BFA762"} strokeWidth={5}
        strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      <text x="50%" y="50%" textAnchor="middle" dy="0.35em"
        style={{ fontFamily: "'Fraunces',serif", fontSize: size * 0.24, fill: "#1F3326", fontWeight: 500 }}>
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

/* ── Category Icon ── */
function CatIcon({ cat, size = 16 }: { cat: string; size?: number }) {
  const color = CAT_COLORS[cat] ?? "#6C6B5D";
  if (cat === "documenti") return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
    </svg>
  );
  if (cat === "formazione") return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" /><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
    </svg>
  );
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.78 7.78 5.5 5.5 0 017.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

/* ── Helpers ── */
function pctComplete(items: ProcessItem[]): number {
  if (!items.length) return 0;
  return (items.filter(i => i.is_completed).length / items.length) * 100;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

function groupByCategory(items: ProcessItem[]): Record<string, ProcessItem[]> {
  const g: Record<string, ProcessItem[]> = { documenti: [], formazione: [], accessi: [] };
  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order);
  sorted.forEach(i => { if (g[i.category]) g[i.category].push(i); });
  return g;
}

/* ════════════════════════════════════════════════════════════ */
export default function OnboardingPage() {
  const { role, isAdmin, isManager, loading: roleLoading, userId } = useRole();
  const { toast, showToast } = useToast();

  /* ── Data state ── */
  const [processes, setProcesses] = useState<Process[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  /* ── Modal state ── */
  const [showNewProcess, setShowNewProcess] = useState(false);
  const [viewingProcess, setViewingProcess] = useState<Process | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateView, setTemplateView] = useState<"list" | "edit">("list");
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ type: "process" | "template"; id: string } | null>(null);
  const [showCompletati, setShowCompletati] = useState(false);

  /* ── New process form ── */
  const [npName, setNpName] = useState("");
  const [npRole, setNpRole] = useState("");
  const [npTemplate, setNpTemplate] = useState("");
  const [npTarget, setNpTarget] = useState("");
  const [npNotes, setNpNotes] = useState("");
  const [npSaving, setNpSaving] = useState(false);

  /* ── Template form ── */
  const [tfName, setTfName] = useState("");
  const [tfDesc, setTfDesc] = useState("");
  const [tfItems, setTfItems] = useState<FormItem[]>([]);
  const [tfSaving, setTfSaving] = useState(false);

  /* ── Add item to process ── */
  const [addItemCat, setAddItemCat] = useState("documenti");
  const [addItemTitle, setAddItemTitle] = useState("");
  const [addItemFile, setAddItemFile] = useState(false);

  /* ── Stagger animation ── */
  const gridRef = useRef<HTMLDivElement>(null);

  /* ── Load data ── */
  const loadProcesses = useCallback(async () => {
    const { data } = await supabase.from("onboarding_processes").select(PROCESS_COLS).order("created_at", { ascending: false });
    setProcesses((data ?? []) as unknown as Process[]);
  }, []);

  const loadTemplates = useCallback(async () => {
    const { data } = await supabase.from("onboarding_templates").select(TEMPLATE_COLS).order("created_at", { ascending: false });
    setTemplates((data ?? []) as unknown as Template[]);
  }, []);

  useEffect(() => {
    if (roleLoading) return;
    Promise.all([loadProcesses(), loadTemplates()]).then(() => setLoading(false));
  }, [roleLoading, loadProcesses, loadTemplates]);

  /* ── Stagger observer ── */
  useEffect(() => {
    if (loading || !gridRef.current) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { (e.target as HTMLElement).classList.add("ob-visible"); obs.unobserve(e.target); } });
    }, { threshold: 0.1 });
    gridRef.current.querySelectorAll(".ob-card").forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [loading, processes]);

  /* ── Process CRUD ── */
  async function createProcess() {
    if (!npName.trim()) { showToast("Inserisci il nome", "warn"); return; }
    setNpSaving(true);
    const { data: proc, error } = await supabase.from("onboarding_processes").insert({
      employee_name: npName.trim(), employee_role: npRole.trim(),
      template_id: npTemplate || null, target_date: npTarget || null,
      notes: npNotes.trim(), created_by: userId,
    }).select("id").single();
    if (error || !proc) { showToast("Errore creazione", "error"); setNpSaving(false); return; }

    if (npTemplate) {
      const tpl = templates.find(t => t.id === npTemplate);
      if (tpl && tpl.onboarding_template_items.length) {
        const items = tpl.onboarding_template_items.map((ti, i) => ({
          process_id: proc.id, category: ti.category, title: ti.title,
          description: ti.description, requires_file: ti.requires_file, sort_order: i,
        }));
        await supabase.from("onboarding_process_items").insert(items);
      }
    }

    showToast("Onboarding creato", "ok");
    setShowNewProcess(false);
    setNpName(""); setNpRole(""); setNpTemplate(""); setNpTarget(""); setNpNotes("");
    setNpSaving(false);
    loadProcesses();
  }

  async function updateProcessStatus(id: string, status: string) {
    await supabase.from("onboarding_processes").update({ status }).eq("id", id);
    loadProcesses();
    if (viewingProcess?.id === id) refreshDetail(id);
  }

  async function deleteProcess(id: string) {
    await supabase.from("onboarding_processes").delete().eq("id", id);
    showToast("Processo eliminato", "ok");
    setShowDeleteConfirm(null);
    if (viewingProcess?.id === id) setViewingProcess(null);
    loadProcesses();
  }

  async function refreshDetail(id: string) {
    const { data } = await supabase.from("onboarding_processes").select(PROCESS_COLS).eq("id", id).single();
    if (data) setViewingProcess(data as unknown as Process);
  }

  /* ── Item toggle ── */
  async function toggleItem(item: ProcessItem) {
    const nowDone = !item.is_completed;
    const { error } = await supabase.from("onboarding_process_items").update({
      is_completed: nowDone,
      completed_at: nowDone ? new Date().toISOString() : null,
      completed_by: nowDone ? userId : null,
    }).eq("id", item.id);
    if (error) { showToast("Errore aggiornamento", "error"); return; }
    await refreshDetail(item.process_id);
    loadProcesses();
  }

  /* ── Add item to process ── */
  async function addProcessItem() {
    if (!addItemTitle.trim() || !viewingProcess) return;
    const existing = viewingProcess.onboarding_process_items.filter(i => i.category === addItemCat);
    await supabase.from("onboarding_process_items").insert({
      process_id: viewingProcess.id, category: addItemCat, title: addItemTitle.trim(),
      requires_file: addItemFile, sort_order: existing.length,
    });
    setAddItemTitle(""); setAddItemFile(false);
    showToast("Voce aggiunta", "ok");
    refreshDetail(viewingProcess.id);
    loadProcesses();
  }

  /* ── File upload ── */
  async function uploadItemFile(item: ProcessItem, file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const path = `onboarding/${item.process_id}/${item.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("onboarding-documents").upload(path, file);
    if (error) { showToast("Errore upload", "error"); return; }
    const { data: { publicUrl } } = supabase.storage.from("onboarding-documents").getPublicUrl(path);
    await supabase.from("onboarding_documents").insert({
      process_item_id: item.id, file_url: publicUrl, file_name: file.name, file_type: file.type,
    });
    showToast("File caricato", "ok");
    refreshDetail(item.process_id);
  }

  async function deleteDoc(doc: ProcessDoc, processId: string) {
    await supabase.from("onboarding_documents").delete().eq("id", doc.id);
    refreshDetail(processId);
  }

  /* ── Template CRUD ── */
  function openTemplateEdit(tpl: Template | null) {
    if (tpl) {
      setTfName(tpl.role_name);
      setTfDesc(tpl.description);
      setTfItems(tpl.onboarding_template_items.map(i => ({
        category: i.category, title: i.title, description: i.description, requires_file: i.requires_file,
      })));
      setEditingTemplate(tpl);
    } else {
      setTfName(""); setTfDesc(""); setTfItems([]); setEditingTemplate(null);
    }
    setTemplateView("edit");
  }

  async function saveTemplate() {
    if (!tfName.trim()) { showToast("Inserisci il nome ruolo", "warn"); return; }
    setTfSaving(true);
    if (editingTemplate) {
      await supabase.from("onboarding_templates").update({ role_name: tfName.trim(), description: tfDesc.trim() }).eq("id", editingTemplate.id);
      await supabase.from("onboarding_template_items").delete().eq("template_id", editingTemplate.id);
      if (tfItems.length) {
        await supabase.from("onboarding_template_items").insert(
          tfItems.map((it, i) => ({ template_id: editingTemplate.id, category: it.category, title: it.title, description: it.description, requires_file: it.requires_file, sort_order: i }))
        );
      }
    } else {
      const { data, error } = await supabase.from("onboarding_templates").insert({
        role_name: tfName.trim(), description: tfDesc.trim(), created_by: userId,
      }).select("id").single();
      if (error || !data) { showToast("Errore", "error"); setTfSaving(false); return; }
      if (tfItems.length) {
        await supabase.from("onboarding_template_items").insert(
          tfItems.map((it, i) => ({ template_id: data.id, category: it.category, title: it.title, description: it.description, requires_file: it.requires_file, sort_order: i }))
        );
      }
    }
    showToast(editingTemplate ? "Template aggiornato" : "Template creato", "ok");
    setTfSaving(false);
    setTemplateView("list");
    loadTemplates();
  }

  async function deleteTemplate(id: string) {
    await supabase.from("onboarding_templates").delete().eq("id", id);
    showToast("Template eliminato", "ok");
    setShowDeleteConfirm(null);
    loadTemplates();
  }

  async function createExampleTemplates() {
    for (const tpl of EXAMPLE_TEMPLATES) {
      const { data } = await supabase.from("onboarding_templates").insert({
        role_name: tpl.role_name, description: tpl.description, created_by: userId,
      }).select("id").single();
      if (!data) continue;
      await supabase.from("onboarding_template_items").insert(
        tpl.items.map((it, i) => ({ template_id: data.id, category: it.category, title: it.title, description: "", requires_file: it.requires_file, sort_order: i }))
      );
    }
    showToast("Template di esempio creati", "ok");
    loadTemplates();
  }

  /* ── Computed ── */
  const active = processes.filter(p => p.status === "in_corso");
  const sospesi = processes.filter(p => p.status === "sospeso");
  const completati = processes.filter(p => p.status === "completato");
  const totalPending = processes.reduce((s, p) => s + p.onboarding_process_items.filter(i => !i.is_completed).length, 0);

  /* ── Skeleton ── */
  if (loading) return (
    <div className="ob-page">
      <div className="ob-hero"><div className="ob-skel ob-skel-title" /><div className="ob-skel ob-skel-sub" /></div>
      <div className="ob-stats">{[1, 2, 3].map(i => <div key={i} className="ob-skel ob-skel-stat" />)}</div>
      <div className="ob-grid">{[1, 2, 3].map(i => <div key={i} className="ob-skel ob-skel-card" />)}</div>
      <style>{CSS}</style>
    </div>
  );

  return (
    <div className="ob-page">
      {/* ── Hero ── */}
      <div className="ob-hero">
        <div>
          <h1 className="ob-title">Onboarding</h1>
          <p className="ob-subtitle">Gestisci l&apos;inserimento dei nuovi dipendenti</p>
        </div>
        <div className="ob-hero-actions">
          <button className="ob-btn-primary" onClick={() => setShowNewProcess(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Nuovo onboarding
          </button>
          {isAdmin && (
            <button className="ob-btn-secondary" onClick={() => { setTemplateView("list"); setShowTemplates(true); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
              Gestisci template
            </button>
          )}
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div className="ob-stats">
        <div className="ob-stat" style={{ borderTop: "3px solid #BFA762" }}>
          <span className="ob-stat-num">{active.length + sospesi.length}</span>
          <span className="ob-stat-label">In corso</span>
        </div>
        <div className="ob-stat" style={{ borderTop: "3px solid #2D5A3D" }}>
          <span className="ob-stat-num">{completati.length}</span>
          <span className="ob-stat-label">Completati</span>
        </div>
        <div className="ob-stat" style={{ borderTop: "3px solid #9E3B2E" }}>
          <span className="ob-stat-num">{totalPending}</span>
          <span className="ob-stat-label">Voci da completare</span>
        </div>
      </div>

      {/* ── Active Processes ── */}
      {active.length === 0 && sospesi.length === 0 ? (
        <div className="ob-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#D8CCB8" strokeWidth="1.5" strokeLinecap="round">
            <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
          </svg>
          <p className="ob-empty-title">Nessun onboarding attivo</p>
          <p className="ob-empty-sub">Crea il primo percorso di inserimento per un nuovo dipendente</p>
        </div>
      ) : (
        <div className="ob-grid" ref={gridRef}>
          {[...active, ...sospesi].map((p, idx) => {
            const pct = pctComplete(p.onboarding_process_items);
            const grouped = groupByCategory(p.onboarding_process_items);
            return (
              <div key={p.id} className="ob-card" style={{ transitionDelay: `${idx * 60}ms` }} onClick={() => setViewingProcess(p)}>
                <div className="ob-card-top">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 className="ob-card-name">{p.employee_name}</h3>
                    <span className="ob-card-role">{p.employee_role || "—"}</span>
                  </div>
                  <Ring pct={pct} size={52} />
                </div>
                <div className="ob-card-cats">
                  {CATEGORIES.map(cat => {
                    const items = grouped[cat];
                    const done = items.filter(i => i.is_completed).length;
                    return (
                      <div key={cat} className="ob-card-cat">
                        <CatIcon cat={cat} size={14} />
                        <span>{done}/{items.length}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="ob-card-footer">
                  <span className="ob-badge" style={{ background: STATUS_COLORS[p.status]?.bg, color: STATUS_COLORS[p.status]?.text }}>
                    {STATUS_LABELS[p.status] ?? p.status}
                  </span>
                  <span className="ob-card-date">{fmtDate(p.start_date)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Completed Section ── */}
      {completati.length > 0 && (
        <div className="ob-completed-section">
          <button className="ob-completed-toggle" onClick={() => setShowCompletati(!showCompletati)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: showCompletati ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
            Completati ({completati.length})
          </button>
          {showCompletati && (
            <div className="ob-grid ob-grid-completed">
              {completati.map(p => (
                <div key={p.id} className="ob-card ob-card-done ob-visible" onClick={() => setViewingProcess(p)}>
                  <div className="ob-card-top">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 className="ob-card-name">{p.employee_name}</h3>
                      <span className="ob-card-role">{p.employee_role || "—"}</span>
                    </div>
                    <Ring pct={100} size={44} />
                  </div>
                  <div className="ob-card-footer">
                    <span className="ob-badge" style={{ background: STATUS_COLORS.completato.bg, color: STATUS_COLORS.completato.text }}>Completato</span>
                    <span className="ob-card-date">{fmtDate(p.start_date)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════ New Process Modal ══════════ */}
      <Modal isOpen={showNewProcess} onClose={() => setShowNewProcess(false)} title="Nuovo onboarding" maxWidth={520}>
        <div className="ob-form">
          <label className="ob-label">Nome dipendente *</label>
          <input className="ob-input" value={npName} onChange={e => setNpName(e.target.value)} placeholder="Mario Rossi" />

          <label className="ob-label">Ruolo</label>
          <input className="ob-input" value={npRole} onChange={e => setNpRole(e.target.value)} placeholder="Receptionist" />

          <label className="ob-label">Template</label>
          <select className="ob-input" value={npTemplate} onChange={e => { setNpTemplate(e.target.value); if (!npRole && e.target.value) { const t = templates.find(t => t.id === e.target.value); if (t) setNpRole(t.role_name); } }}>
            <option value="">— Nessun template —</option>
            {templates.filter(t => t.is_active).map(t => (
              <option key={t.id} value={t.id}>{t.role_name} ({t.onboarding_template_items.length} voci)</option>
            ))}
          </select>

          <label className="ob-label">Data target (opzionale)</label>
          <input className="ob-input" type="date" value={npTarget} onChange={e => setNpTarget(e.target.value)} />

          <label className="ob-label">Note</label>
          <textarea className="ob-input ob-textarea" value={npNotes} onChange={e => setNpNotes(e.target.value)} placeholder="Note aggiuntive..." rows={3} />

          <div className="ob-form-actions">
            <button className="ob-btn-secondary" onClick={() => setShowNewProcess(false)}>Annulla</button>
            <button className="ob-btn-primary" onClick={createProcess} disabled={npSaving}>{npSaving ? "Salvataggio..." : "Crea onboarding"}</button>
          </div>
        </div>
      </Modal>

      {/* ══════════ Process Detail Modal ══════════ */}
      <Modal isOpen={!!viewingProcess} onClose={() => setViewingProcess(null)} title="" maxWidth={800}>
        {viewingProcess && (() => {
          const p = viewingProcess;
          const pct = pctComplete(p.onboarding_process_items);
          const grouped = groupByCategory(p.onboarding_process_items);
          const allDone = p.onboarding_process_items.length > 0 && p.onboarding_process_items.every(i => i.is_completed);
          return (
            <div className="ob-detail">
              {/* Header */}
              <div className="ob-detail-header">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 className="ob-detail-name">{p.employee_name}</h2>
                  <div className="ob-detail-meta">
                    <span className="ob-badge" style={{ background: STATUS_COLORS[p.status]?.bg, color: STATUS_COLORS[p.status]?.text }}>{STATUS_LABELS[p.status]}</span>
                    {p.employee_role && <span className="ob-detail-role">{p.employee_role}</span>}
                    <span className="ob-detail-date">Inizio: {fmtDate(p.start_date)}</span>
                    {p.target_date && <span className="ob-detail-date">Target: {fmtDate(p.target_date)}</span>}
                  </div>
                  {p.notes && <p className="ob-detail-notes">{p.notes}</p>}
                  {p.author?.full_name && <p className="ob-detail-author">Creato da {p.author.full_name}</p>}
                </div>
                <Ring pct={pct} size={72} />
              </div>

              {allDone && p.status === "in_corso" && (
                <div className="ob-all-done-banner">
                  <span>Tutte le voci completate!</span>
                  <button className="ob-btn-primary ob-btn-sm" onClick={() => updateProcessStatus(p.id, "completato")}>Segna come completato</button>
                </div>
              )}

              {/* Category sections */}
              {CATEGORIES.map(cat => {
                const items = grouped[cat];
                const catDone = items.filter(i => i.is_completed).length;
                return (
                  <div key={cat} className="ob-detail-section">
                    <div className="ob-detail-section-header" style={{ borderLeftColor: CAT_COLORS[cat] }}>
                      <CatIcon cat={cat} size={18} />
                      <span className="ob-detail-section-title">{CAT_LABELS[cat]}</span>
                      <span className="ob-detail-section-count">{catDone}/{items.length}</span>
                    </div>
                    {items.length === 0 ? (
                      <p className="ob-detail-empty">Nessuna voce in questa categoria</p>
                    ) : (
                      <div className="ob-detail-items">
                        {items.map(item => (
                          <div key={item.id} className={`ob-detail-item${item.is_completed ? " ob-item-done" : ""}`}>
                            <label className="ob-check-label">
                              <input type="checkbox" checked={item.is_completed} onChange={() => toggleItem(item)} className="ob-checkbox" />
                              <span className="ob-item-title">{item.title}</span>
                            </label>
                            {item.description && <p className="ob-item-desc">{item.description}</p>}
                            {item.is_completed && item.completer?.full_name && (
                              <p className="ob-item-completer">Completato da {item.completer.full_name} — {fmtDate(item.completed_at)}</p>
                            )}
                            {/* Files */}
                            {item.requires_file && (
                              <div className="ob-item-files">
                                {item.onboarding_documents.map(doc => (
                                  <div key={doc.id} className="ob-file-pill">
                                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="ob-file-link">
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                                      {doc.file_name || "File"}
                                    </a>
                                    <button className="ob-file-del" onClick={() => deleteDoc(doc, p.id)} title="Rimuovi">×</button>
                                  </div>
                                ))}
                                <label className="ob-file-upload-btn">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                                  Carica file
                                  <input type="file" className="ob-file-input-hidden" onChange={e => { if (e.target.files?.[0]) uploadItemFile(item, e.target.files[0]); e.target.value = ""; }} />
                                </label>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add item */}
              <div className="ob-add-item">
                <span className="ob-add-item-label">Aggiungi voce</span>
                <div className="ob-add-item-row">
                  <select className="ob-input ob-input-sm" value={addItemCat} onChange={e => setAddItemCat(e.target.value)}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
                  </select>
                  <input className="ob-input ob-input-sm" style={{ flex: 1 }} value={addItemTitle} onChange={e => setAddItemTitle(e.target.value)} placeholder="Titolo voce..." />
                  <label className="ob-add-item-file">
                    <input type="checkbox" checked={addItemFile} onChange={e => setAddItemFile(e.target.checked)} />
                    File
                  </label>
                  <button className="ob-btn-primary ob-btn-sm" onClick={addProcessItem} disabled={!addItemTitle.trim()}>+</button>
                </div>
              </div>

              {/* Actions */}
              <div className="ob-detail-actions">
                {p.status === "in_corso" && (
                  <button className="ob-btn-secondary ob-btn-sm" onClick={() => updateProcessStatus(p.id, "sospeso")}>Sospendi</button>
                )}
                {p.status === "sospeso" && (
                  <button className="ob-btn-secondary ob-btn-sm" onClick={() => updateProcessStatus(p.id, "in_corso")}>Riprendi</button>
                )}
                {p.status !== "completato" && (
                  <button className="ob-btn-primary ob-btn-sm" onClick={() => updateProcessStatus(p.id, "completato")}>Segna completato</button>
                )}
                {isAdmin && (
                  <button className="ob-btn-danger ob-btn-sm" onClick={() => setShowDeleteConfirm({ type: "process", id: p.id })}>Elimina</button>
                )}
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ══════════ Template Management Modal ══════════ */}
      <Modal isOpen={showTemplates} onClose={() => setShowTemplates(false)} title={templateView === "list" ? "Template onboarding" : (editingTemplate ? "Modifica template" : "Nuovo template")} maxWidth={700}>
        {templateView === "list" ? (
          <div className="ob-tpl-list">
            <div className="ob-tpl-actions">
              <button className="ob-btn-primary ob-btn-sm" onClick={() => openTemplateEdit(null)}>+ Nuovo template</button>
              {templates.length === 0 && (
                <button className="ob-btn-secondary ob-btn-sm" onClick={createExampleTemplates}>Crea template di esempio</button>
              )}
            </div>
            {templates.length === 0 ? (
              <div className="ob-empty" style={{ padding: "32px 0" }}>
                <p className="ob-empty-title">Nessun template</p>
                <p className="ob-empty-sub">Crea un template o genera quelli di esempio</p>
              </div>
            ) : (
              templates.map(tpl => (
                <div key={tpl.id} className="ob-tpl-card">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4 className="ob-tpl-name">{tpl.role_name}</h4>
                    {tpl.description && <p className="ob-tpl-desc">{tpl.description}</p>}
                    <div className="ob-tpl-cats">
                      {CATEGORIES.map(cat => {
                        const count = tpl.onboarding_template_items.filter(i => i.category === cat).length;
                        if (!count) return null;
                        return <span key={cat} className="ob-tpl-cat-badge" style={{ background: CAT_COLORS[cat] + "18", color: CAT_COLORS[cat] }}><CatIcon cat={cat} size={12} /> {count}</span>;
                      })}
                    </div>
                  </div>
                  <div className="ob-tpl-card-actions">
                    <button className="ob-btn-secondary ob-btn-sm" onClick={() => openTemplateEdit(tpl)}>Modifica</button>
                    <button className="ob-btn-danger ob-btn-sm" onClick={() => setShowDeleteConfirm({ type: "template", id: tpl.id })}>Elimina</button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="ob-form">
            <label className="ob-label">Nome ruolo *</label>
            <input className="ob-input" value={tfName} onChange={e => setTfName(e.target.value)} placeholder="es. Receptionist" />

            <label className="ob-label">Descrizione</label>
            <input className="ob-input" value={tfDesc} onChange={e => setTfDesc(e.target.value)} placeholder="Breve descrizione..." />

            {CATEGORIES.map(cat => (
              <div key={cat} className="ob-tpl-section">
                <div className="ob-tpl-section-header">
                  <CatIcon cat={cat} size={16} />
                  <span>{CAT_LABELS[cat]}</span>
                  <span className="ob-tpl-section-count">{tfItems.filter(i => i.category === cat).length} voci</span>
                </div>
                {tfItems.filter(i => i.category === cat).map((item, idx) => {
                  const globalIdx = tfItems.findIndex(i => i === item);
                  return (
                    <div key={idx} className="ob-tpl-item-row">
                      <input className="ob-input ob-input-sm" style={{ flex: 1 }} value={item.title}
                        onChange={e => { const n = [...tfItems]; n[globalIdx] = { ...n[globalIdx], title: e.target.value }; setTfItems(n); }}
                        placeholder="Titolo voce..." />
                      <label className="ob-add-item-file" title="Richiedi file">
                        <input type="checkbox" checked={item.requires_file}
                          onChange={e => { const n = [...tfItems]; n[globalIdx] = { ...n[globalIdx], requires_file: e.target.checked }; setTfItems(n); }} />
                        File
                      </label>
                      <button className="ob-btn-icon" onClick={() => setTfItems(tfItems.filter((_, i) => i !== globalIdx))} title="Rimuovi">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9E3B2E" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    </div>
                  );
                })}
                <button className="ob-btn-add-item" onClick={() => setTfItems([...tfItems, { category: cat, title: "", description: "", requires_file: false }])}>
                  + Aggiungi voce
                </button>
              </div>
            ))}

            <div className="ob-form-actions">
              <button className="ob-btn-secondary" onClick={() => setTemplateView("list")}>Indietro</button>
              <button className="ob-btn-primary" onClick={saveTemplate} disabled={tfSaving}>{tfSaving ? "Salvataggio..." : "Salva template"}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* ══════════ Delete Confirm Modal ══════════ */}
      <Modal isOpen={!!showDeleteConfirm} onClose={() => setShowDeleteConfirm(null)} title="Conferma eliminazione" maxWidth={400}>
        {showDeleteConfirm && (
          <div className="ob-form">
            <p style={{ fontFamily: "'Albert Sans',sans-serif", fontSize: 15, color: "#1F3326", marginBottom: 20 }}>
              Sei sicuro di voler eliminare {showDeleteConfirm.type === "process" ? "questo percorso di onboarding" : "questo template"}? L&apos;azione è irreversibile.
            </p>
            <div className="ob-form-actions">
              <button className="ob-btn-secondary" onClick={() => setShowDeleteConfirm(null)}>Annulla</button>
              <button className="ob-btn-danger" onClick={() => {
                if (showDeleteConfirm.type === "process") deleteProcess(showDeleteConfirm.id);
                else deleteTemplate(showDeleteConfirm.id);
              }}>Elimina</button>
            </div>
          </div>
        )}
      </Modal>

      <Toast toast={toast} />
      <style>{CSS}</style>
    </div>
  );
}

/* ══════════ CSS ══════════ */
const CSS = `
.ob-page { padding: 24px 32px; min-height: 100vh; }

/* Hero */
.ob-hero { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 28px; flex-wrap: wrap; }
.ob-title { font-family: 'Fraunces', serif; font-size: 32px; font-weight: 600; color: #1F3326; margin: 0; }
.ob-subtitle { font-family: 'Albert Sans', sans-serif; font-size: 15px; color: #6C6B5D; margin: 6px 0 0; }
.ob-hero-actions { display: flex; gap: 10px; flex-wrap: wrap; }

/* Buttons */
.ob-btn-primary { display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px; background: #1F3326; color: #FAF9F5; border: none; border-radius: 8px; font-family: 'Albert Sans', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
.ob-btn-primary:hover { background: #2a4a35; }
.ob-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.ob-btn-secondary { display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px; background: #fff; color: #1F3326; border: 1px solid #D8CCB8; border-radius: 8px; font-family: 'Albert Sans', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.ob-btn-secondary:hover { background: #F3EBDD; }
.ob-btn-danger { display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px; background: #9E3B2E; color: #fff; border: none; border-radius: 8px; font-family: 'Albert Sans', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
.ob-btn-danger:hover { background: #7a2d23; }
.ob-btn-sm { padding: 6px 14px; font-size: 13px; }
.ob-btn-icon { background: none; border: none; padding: 4px; cursor: pointer; border-radius: 4px; display: flex; align-items: center; }
.ob-btn-icon:hover { background: #FEF0F0; }

/* Stats */
.ob-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px; }
.ob-stat { background: #fff; border: 1px solid #D8CCB8; border-radius: 12px; padding: 20px; text-align: center; }
.ob-stat-num { display: block; font-family: 'Bebas Neue', sans-serif; font-size: 36px; color: #1F3326; line-height: 1; }
.ob-stat-label { font-family: 'Albert Sans', sans-serif; font-size: 13px; color: #6C6B5D; margin-top: 4px; display: block; }

/* Grid */
.ob-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.ob-grid-completed { margin-top: 12px; }

/* Card */
.ob-card { background: #fff; border: 1px solid #D8CCB8; border-radius: 12px; padding: 20px; cursor: pointer; transition: transform 0.25s ease, box-shadow 0.25s ease, opacity 0.4s ease; opacity: 0; transform: translateY(12px); }
.ob-card.ob-visible { opacity: 1; transform: translateY(0); }
.ob-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(31,51,38,0.08); }
.ob-card-done { opacity: 0.75; }
.ob-card-done.ob-visible { opacity: 0.75; }
.ob-card-top { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 12px; }
.ob-card-name { font-family: 'Fraunces', serif; font-size: 18px; font-weight: 600; color: #1F3326; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ob-card-role { font-family: 'Albert Sans', sans-serif; font-size: 13px; color: #6C6B5D; }
.ob-card-cats { display: flex; gap: 16px; margin-bottom: 12px; }
.ob-card-cat { display: flex; align-items: center; gap: 4px; font-family: 'Albert Sans', sans-serif; font-size: 13px; color: #6C6B5D; }
.ob-card-footer { display: flex; align-items: center; justify-content: space-between; }
.ob-card-date { font-family: 'Albert Sans', sans-serif; font-size: 12px; color: #6C6B5D; }

/* Badge */
.ob-badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-family: 'Albert Sans', sans-serif; font-size: 12px; font-weight: 600; }

/* Empty */
.ob-empty { text-align: center; padding: 48px 24px; }
.ob-empty-title { font-family: 'Fraunces', serif; font-size: 18px; color: #1F3326; margin: 12px 0 4px; }
.ob-empty-sub { font-family: 'Albert Sans', sans-serif; font-size: 14px; color: #6C6B5D; margin: 0; }

/* Completed section */
.ob-completed-section { margin-top: 32px; }
.ob-completed-toggle { display: flex; align-items: center; gap: 8px; background: none; border: none; cursor: pointer; font-family: 'Albert Sans', sans-serif; font-size: 15px; font-weight: 600; color: #1F3326; padding: 8px 0; }

/* Form */
.ob-form { display: flex; flex-direction: column; gap: 12px; }
.ob-label { font-family: 'Albert Sans', sans-serif; font-size: 13px; font-weight: 600; color: #1F3326; margin-bottom: -4px; }
.ob-input { font-family: 'Albert Sans', sans-serif; font-size: 14px; border: 1px solid #D8CCB8; border-radius: 8px; padding: 10px 12px; color: #1F3326; background: #fff; outline: none; transition: border-color 0.2s; }
.ob-input:focus { border-color: #BFA762; }
.ob-input-sm { padding: 6px 10px; font-size: 13px; }
.ob-textarea { resize: vertical; min-height: 60px; }
.ob-form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 8px; }

/* Detail modal */
.ob-detail { display: flex; flex-direction: column; gap: 20px; }
.ob-detail-header { display: flex; align-items: flex-start; gap: 20px; padding-bottom: 16px; border-bottom: 1px solid #F3EBDD; }
.ob-detail-name { font-family: 'Fraunces', serif; font-size: 24px; font-weight: 600; color: #1F3326; margin: 0; }
.ob-detail-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 8px; }
.ob-detail-role { font-family: 'Albert Sans', sans-serif; font-size: 13px; color: #6C6B5D; padding: 2px 8px; background: #F3EBDD; border-radius: 12px; }
.ob-detail-date { font-family: 'Albert Sans', sans-serif; font-size: 12px; color: #6C6B5D; }
.ob-detail-notes { font-family: 'Albert Sans', sans-serif; font-size: 13px; color: #6C6B5D; margin-top: 6px; font-style: italic; }
.ob-detail-author { font-family: 'Albert Sans', sans-serif; font-size: 12px; color: #BFA762; margin-top: 4px; }

/* All done banner */
.ob-all-done-banner { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; background: #E8F5E9; border-radius: 10px; font-family: 'Albert Sans', sans-serif; font-size: 14px; font-weight: 600; color: #2D5A3D; }

/* Detail section */
.ob-detail-section { border: 1px solid #F3EBDD; border-radius: 10px; overflow: hidden; }
.ob-detail-section-header { display: flex; align-items: center; gap: 8px; padding: 12px 16px; background: #FAFAF7; border-left: 4px solid #D8CCB8; }
.ob-detail-section-title { font-family: 'Albert Sans', sans-serif; font-size: 14px; font-weight: 700; color: #1F3326; flex: 1; }
.ob-detail-section-count { font-family: 'Albert Sans', sans-serif; font-size: 12px; color: #6C6B5D; }
.ob-detail-empty { font-family: 'Albert Sans', sans-serif; font-size: 13px; color: #6C6B5D; padding: 12px 16px; margin: 0; }
.ob-detail-items { display: flex; flex-direction: column; }
.ob-detail-item { padding: 12px 16px; border-top: 1px solid #F3EBDD; transition: background 0.15s; }
.ob-detail-item:hover { background: #FAFAF7; }
.ob-item-done { opacity: 0.6; }
.ob-check-label { display: flex; align-items: center; gap: 10px; cursor: pointer; }
.ob-checkbox { width: 18px; height: 18px; accent-color: #2D5A3D; cursor: pointer; flex-shrink: 0; }
.ob-item-title { font-family: 'Albert Sans', sans-serif; font-size: 14px; color: #1F3326; }
.ob-item-done .ob-item-title { text-decoration: line-through; color: #6C6B5D; }
.ob-item-desc { font-family: 'Albert Sans', sans-serif; font-size: 12px; color: #6C6B5D; margin: 4px 0 0 28px; }
.ob-item-completer { font-family: 'Albert Sans', sans-serif; font-size: 11px; color: #BFA762; margin: 4px 0 0 28px; }

/* Files */
.ob-item-files { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 0 28px; align-items: center; }
.ob-file-pill { display: flex; align-items: center; gap: 4px; background: #F3EBDD; border-radius: 6px; padding: 3px 8px; font-size: 12px; }
.ob-file-link { display: flex; align-items: center; gap: 4px; color: #1F3326; text-decoration: none; font-family: 'Albert Sans', sans-serif; }
.ob-file-link:hover { text-decoration: underline; }
.ob-file-del { background: none; border: none; color: #9E3B2E; cursor: pointer; font-size: 14px; padding: 0 2px; line-height: 1; }
.ob-file-upload-btn { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border: 1px dashed #D8CCB8; border-radius: 6px; font-family: 'Albert Sans', sans-serif; font-size: 12px; color: #6C6B5D; cursor: pointer; transition: border-color 0.2s; }
.ob-file-upload-btn:hover { border-color: #BFA762; color: #1F3326; }
.ob-file-input-hidden { display: none; }

/* Add item */
.ob-add-item { padding: 16px; background: #FAFAF7; border-radius: 10px; }
.ob-add-item-label { font-family: 'Albert Sans', sans-serif; font-size: 13px; font-weight: 600; color: #1F3326; display: block; margin-bottom: 8px; }
.ob-add-item-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ob-add-item-file { display: flex; align-items: center; gap: 4px; font-family: 'Albert Sans', sans-serif; font-size: 12px; color: #6C6B5D; cursor: pointer; white-space: nowrap; }

/* Detail actions */
.ob-detail-actions { display: flex; gap: 8px; flex-wrap: wrap; padding-top: 12px; border-top: 1px solid #F3EBDD; }

/* Template list */
.ob-tpl-list { display: flex; flex-direction: column; gap: 12px; }
.ob-tpl-actions { display: flex; gap: 8px; margin-bottom: 8px; }
.ob-tpl-card { display: flex; align-items: flex-start; gap: 16px; padding: 16px; background: #fff; border: 1px solid #D8CCB8; border-radius: 10px; }
.ob-tpl-name { font-family: 'Fraunces', serif; font-size: 16px; font-weight: 600; color: #1F3326; margin: 0; }
.ob-tpl-desc { font-family: 'Albert Sans', sans-serif; font-size: 13px; color: #6C6B5D; margin: 4px 0 0; }
.ob-tpl-cats { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.ob-tpl-cat-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 12px; font-family: 'Albert Sans', sans-serif; font-size: 12px; font-weight: 600; }
.ob-tpl-card-actions { display: flex; gap: 6px; flex-shrink: 0; }

/* Template edit sections */
.ob-tpl-section { margin-top: 16px; border: 1px solid #F3EBDD; border-radius: 8px; overflow: hidden; }
.ob-tpl-section-header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: #FAFAF7; font-family: 'Albert Sans', sans-serif; font-size: 14px; font-weight: 700; color: #1F3326; }
.ob-tpl-section-count { font-weight: 400; font-size: 12px; color: #6C6B5D; margin-left: auto; }
.ob-tpl-item-row { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-top: 1px solid #F3EBDD; }
.ob-btn-add-item { background: none; border: none; color: #BFA762; font-family: 'Albert Sans', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; padding: 8px 12px; text-align: left; }
.ob-btn-add-item:hover { color: #1F3326; }

/* Skeleton */
.ob-skel { background: linear-gradient(90deg, #F3EBDD 25%, #FAF9F5 50%, #F3EBDD 75%); background-size: 200% 100%; animation: ob-shimmer 1.5s ease-in-out infinite; border-radius: 8px; }
@keyframes ob-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.ob-skel-title { width: 200px; height: 36px; margin-bottom: 8px; }
.ob-skel-sub { width: 300px; height: 18px; }
.ob-skel-stat { height: 100px; }
.ob-skel-card { height: 160px; }

/* Responsive */
@media (max-width: 768px) {
  .ob-page { padding: 16px; }
  .ob-title { font-size: 26px; }
  .ob-stats { grid-template-columns: 1fr; }
  .ob-grid { grid-template-columns: 1fr; }
  .ob-hero { flex-direction: column; }
  .ob-detail-header { flex-direction: column; align-items: stretch; }
  .ob-add-item-row { flex-direction: column; align-items: stretch; }
  .ob-tpl-card { flex-direction: column; }
}
`;
