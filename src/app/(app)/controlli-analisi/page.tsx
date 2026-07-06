"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { useRole } from "@/lib/useRole";
import { canAccess } from "@/lib/permissions";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/Toast";
import { Modal } from "@/components/ui/Modal";
import DatePickerIT from "@/components/ui/DatePickerIT";

export const dynamic = "force-dynamic";

/* ── Types ── */

type Control = {
  id: string;
  tipo: string;
  laboratorio: string;
  data_prelievo: string;
  periodicita_mesi: number | null;
  prossimo_controllo: string | null;
  esito_generale: string;
  note: string | null;
  created_at: string;
  created_by: string | null;
};

type Sample = {
  id: string;
  control_id: string;
  punto_prelievo: string;
  esito: string;
  referto_url: string | null;
  note: string | null;
};

type SampleForm = {
  punto_prelievo: string;
  esito: string;
  note: string;
  file: File | null;
  existingUrl: string | null;
};

/* ── Constants ── */

const CONTROL_TYPES = [
  { value: "acqua_potabile", label: "Acqua potabile" },
  { value: "legionella", label: "Legionella" },
  { value: "alimenti", label: "Analisi alimenti" },
  { value: "aria", label: "Qualita aria" },
  { value: "altro", label: "Altro" },
];

const ESITO_OPTS = [
  { value: "conforme", label: "Conforme" },
  { value: "non_conforme", label: "Non conforme" },
  { value: "in_attesa", label: "In attesa" },
];

const typeLabel = (t: string) => CONTROL_TYPES.find(c => c.value === t)?.label ?? t;

const esitoColor = (e: string) => {
  if (e === "conforme") return { bg: "#e6f4ea", text: "#2D5A3D", border: "#2D5A3D" };
  if (e === "non_conforme") return { bg: "#fde8e4", text: "#9E3B2E", border: "#9E3B2E" };
  return { bg: "#fef9e7", text: "#C77B4A", border: "#C77B4A" };
};

const esitoLabel = (e: string) => ESITO_OPTS.find(o => o.value === e)?.label ?? e;

const emptySample = (): SampleForm => ({
  punto_prelievo: "",
  esito: "in_attesa",
  note: "",
  file: null,
  existingUrl: null,
});

const emptyForm = {
  tipo: "acqua_potabile",
  laboratorio: "",
  data_prelievo: "",
  periodicita_mesi: "",
  prossimo_controllo: "",
  esito_generale: "in_attesa",
  note: "",
};

/* ── Styles ── */

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #D8CCB8",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14,
  fontFamily: "'Albert Sans', sans-serif",
  background: "#fff",
  color: "#1F3326",
  outline: "none",
  boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: "none" as const,
  WebkitAppearance: "none" as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236C6B5D' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 10px center",
  paddingRight: 28,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "'Albert Sans', sans-serif",
  fontSize: 13,
  fontWeight: 600,
  color: "#6C6B5D",
  marginBottom: 4,
};

const btnPrimary: React.CSSProperties = {
  background: "#1F3326",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 20px",
  fontFamily: "'Albert Sans', sans-serif",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  background: "#fff",
  color: "#1F3326",
  border: "1px solid #D8CCB8",
  borderRadius: 8,
  padding: "10px 20px",
  fontFamily: "'Albert Sans', sans-serif",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

/* ── Component ── */

export default function ControlliAnalisiPage() {
  const supabase = createClient();
  const router = useRouter();
  const { role, loading: roleLoading } = useRole();

  useEffect(() => {
    if (!roleLoading && !canAccess(role, "/controlli-analisi")) {
      router.replace("/");
    }
  }, [roleLoading, role, router]);

  const [controls, setControls] = useState<Control[]>([]);
  const [samplesMap, setSamplesMap] = useState<Record<string, Sample[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /* Filters */
  const [filterType, setFilterType] = useState("");
  const [filterEsito, setFilterEsito] = useState("");
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));

  /* Modal */
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [sampleForms, setSampleForms] = useState<SampleForm[]>([emptySample(), emptySample(), emptySample(), emptySample()]);

  /* Detail modal */
  const [detailId, setDetailId] = useState<string | null>(null);

  /* Toast */
  const { toast, showToast } = useToast();

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  /* ── Auto-calculate prossimo_controllo ── */
  useEffect(() => {
    if (form.data_prelievo && form.periodicita_mesi) {
      const d = new Date(form.data_prelievo);
      const months = parseInt(form.periodicita_mesi, 10);
      if (!isNaN(months) && months > 0) {
        d.setMonth(d.getMonth() + months);
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        setForm(p => ({ ...p, prossimo_controllo: iso }));
      }
    }
  }, [form.data_prelievo, form.periodicita_mesi]);

  /* ── Data loading ── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: cData } = await supabase
      .from("controls")
      .select("*")
      .order("data_prelievo", { ascending: false });

    const controlsList = (cData ?? []) as Control[];
    setControls(controlsList);

    if (controlsList.length > 0) {
      const ids = controlsList.map(c => c.id);
      const { data: sData } = await supabase
        .from("control_samples")
        .select("*")
        .in("control_id", ids);

      const map: Record<string, Sample[]> = {};
      for (const s of (sData ?? []) as Sample[]) {
        if (!map[s.control_id]) map[s.control_id] = [];
        map[s.control_id].push(s);
      }
      setSamplesMap(map);
    } else {
      setSamplesMap({});
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Filtered controls ── */
  const filtered = controls.filter(c => {
    if (filterType && c.tipo !== filterType) return false;
    if (filterEsito && c.esito_generale !== filterEsito) return false;
    if (filterYear) {
      const y = new Date(c.data_prelievo).getFullYear();
      if (String(y) !== filterYear) return false;
    }
    return true;
  });

  /* ── KPI ── */
  const totalControls = controls.length;
  const conformi = controls.filter(c => c.esito_generale === "conforme").length;
  const nonConformi = controls.filter(c => c.esito_generale === "non_conforme").length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in30 = new Date(today);
  in30.setDate(in30.getDate() + 30);

  const scaduti = controls.filter(c => {
    if (!c.prossimo_controllo) return false;
    return new Date(c.prossimo_controllo) < today;
  });

  const inScadenza = controls.filter(c => {
    if (!c.prossimo_controllo) return false;
    const d = new Date(c.prossimo_controllo);
    return d >= today && d <= in30;
  });

  const hasAlerts = scaduti.length > 0 || inScadenza.length > 0;

  /* ── Years for filter ── */
  const years = [...new Set(controls.map(c => String(new Date(c.data_prelievo).getFullYear())))].sort((a, b) => b.localeCompare(a));
  if (!years.includes(String(new Date().getFullYear()))) years.unshift(String(new Date().getFullYear()));

  /* ── Open modal ── */
  function openNew() {
    setEditId(null);
    setForm({ ...emptyForm });
    setSampleForms([emptySample(), emptySample(), emptySample(), emptySample()]);
    setShowModal(true);
  }

  function openEdit(c: Control) {
    setEditId(c.id);
    setForm({
      tipo: c.tipo,
      laboratorio: c.laboratorio,
      data_prelievo: c.data_prelievo,
      periodicita_mesi: c.periodicita_mesi != null ? String(c.periodicita_mesi) : "",
      prossimo_controllo: c.prossimo_controllo ?? "",
      esito_generale: c.esito_generale,
      note: c.note ?? "",
    });
    const existing = samplesMap[c.id] ?? [];
    const mapped: SampleForm[] = existing.map(s => ({
      punto_prelievo: s.punto_prelievo,
      esito: s.esito,
      note: s.note ?? "",
      file: null,
      existingUrl: s.referto_url,
    }));
    if (mapped.length === 0) mapped.push(emptySample());
    setSampleForms(mapped);
    setShowModal(true);
  }

  /* ── Sample form management ── */
  function updateSample(idx: number, key: keyof SampleForm, val: string | File | null) {
    setSampleForms(prev => prev.map((s, i) => i === idx ? { ...s, [key]: val } : s));
  }

  function addSample() {
    setSampleForms(prev => [...prev, emptySample()]);
  }

  function removeSample(idx: number) {
    setSampleForms(prev => prev.filter((_, i) => i !== idx));
  }

  /* ── Upload referto ── */
  async function uploadReferto(file: File, controlId: string, sampleIdx: number): Promise<string | null> {
    const ext = file.name.split(".").pop() ?? "pdf";
    const path = `${controlId}/${sampleIdx}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("controlli-referti").upload(path, file);
    if (error) return null;
    const { data } = supabase.storage.from("controlli-referti").getPublicUrl(path);
    return data.publicUrl;
  }

  /* ── Save ── */
  async function handleSave() {
    if (!form.data_prelievo) {
      showToast("Inserisci la data del prelievo", "error");
      return;
    }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const payload = {
      tipo: form.tipo,
      laboratorio: form.laboratorio,
      data_prelievo: form.data_prelievo,
      periodicita_mesi: form.periodicita_mesi ? parseInt(form.periodicita_mesi, 10) : null,
      prossimo_controllo: form.prossimo_controllo || null,
      esito_generale: form.esito_generale,
      note: form.note || null,
      created_by: user.id,
    };

    let controlId: string;

    if (editId) {
      const { error } = await supabase.from("controls").update(payload).eq("id", editId);
      if (error) {
        showToast("Errore aggiornamento: " + error.message, "error");
        setSaving(false);
        return;
      }
      controlId = editId;
      // Delete old samples, re-insert
      await supabase.from("control_samples").delete().eq("control_id", editId);
    } else {
      const { data, error } = await supabase.from("controls").insert(payload).select("id").single();
      if (error || !data) {
        showToast("Errore salvataggio: " + (error?.message ?? "sconosciuto"), "error");
        setSaving(false);
        return;
      }
      controlId = data.id;
    }

    // Insert samples
    const validSamples = sampleForms.filter(s => s.punto_prelievo.trim());
    for (let i = 0; i < validSamples.length; i++) {
      const s = validSamples[i];
      let refertoUrl: string | null = s.existingUrl;

      if (s.file) {
        const uploaded = await uploadReferto(s.file, controlId, i);
        if (uploaded) refertoUrl = uploaded;
      }

      await supabase.from("control_samples").insert({
        control_id: controlId,
        punto_prelievo: s.punto_prelievo,
        esito: s.esito,
        referto_url: refertoUrl,
        note: s.note || null,
      });
    }

    showToast(editId ? "Controllo aggiornato" : "Controllo registrato", "ok");
    setShowModal(false);
    setSaving(false);
    fetchData();
  }

  /* ── Delete ── */
  async function handleDelete(id: string) {
    if (!confirm("Eliminare questo controllo e tutti i suoi punti di prelievo?")) return;
    const { error } = await supabase.from("controls").delete().eq("id", id);
    if (error) {
      showToast("Errore eliminazione: " + error.message, "error");
      return;
    }
    showToast("Controllo eliminato", "ok");
    setDetailId(null);
    fetchData();
  }

  /* ── Download referto ── */
  function openReferto(url: string) {
    window.open(url, "_blank");
  }

  /* ── Format dates ── */
  function fmtD(d: string | null) {
    if (!d) return "—";
    const dt = new Date(d);
    return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
  }

  /* ── Detail control ── */
  const detailControl = detailId ? controls.find(c => c.id === detailId) : null;
  const detailSamples = detailId ? (samplesMap[detailId] ?? []) : [];

  if (roleLoading) return null;

  return (
    <>
      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, color: "#1F3326", margin: 0 }}>
          Controlli e Analisi
        </h1>
        <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#6C6B5D", margin: "4px 0 0" }}>
          Registro dei controlli di laboratorio, referti e scadenze
        </p>
      </div>

      {/* ── Alert banner ── */}
      {hasAlerts && (
        <div style={{
          background: scaduti.length > 0 ? "#fde8e4" : "#fef9e7",
          border: `1px solid ${scaduti.length > 0 ? "#9E3B2E" : "#C77B4A"}`,
          borderRadius: 12,
          padding: "16px 20px",
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={scaduti.length > 0 ? "#9E3B2E" : "#C77B4A"} strokeWidth="2" strokeLinecap="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
          </svg>
          <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#1F3326" }}>
            {scaduti.length > 0 && (
              <span style={{ fontWeight: 700 }}>
                {scaduti.length} controllo/i scaduto/i!{" "}
              </span>
            )}
            {inScadenza.length > 0 && (
              <span>
                {inScadenza.length} controllo/i in scadenza entro 30 giorni.
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 24 }}>
        <div style={{ background: "#fff", border: "1px solid #D8CCB8", borderRadius: 12, padding: "16px 20px", borderTop: "3px solid #4F7B8C" }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: "#1F3326" }}>{totalControls}</div>
          <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 12, color: "#6C6B5D" }}>Controlli totali</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #D8CCB8", borderRadius: 12, padding: "16px 20px", borderTop: "3px solid #2D5A3D" }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: "#2D5A3D" }}>{conformi}</div>
          <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 12, color: "#6C6B5D" }}>Conformi</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #D8CCB8", borderRadius: 12, padding: "16px 20px", borderTop: "3px solid #9E3B2E" }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: "#9E3B2E" }}>{nonConformi}</div>
          <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 12, color: "#6C6B5D" }}>Non conformi</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #D8CCB8", borderRadius: 12, padding: "16px 20px", borderTop: `3px solid ${scaduti.length > 0 ? "#9E3B2E" : "#C77B4A"}` }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: scaduti.length > 0 ? "#9E3B2E" : "#C77B4A" }}>
            {scaduti.length + inScadenza.length}
          </div>
          <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 12, color: "#6C6B5D" }}>Scaduti / In scadenza</div>
        </div>
      </div>

      {/* ── Filters + Add button ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 20 }}>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...selectStyle, width: "auto", minWidth: 160 }}>
          <option value="">Tutti i tipi</option>
          {CONTROL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={filterEsito} onChange={e => setFilterEsito(e.target.value)} style={{ ...selectStyle, width: "auto", minWidth: 140 }}>
          <option value="">Tutti gli esiti</option>
          {ESITO_OPTS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
        </select>
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)} style={{ ...selectStyle, width: "auto", minWidth: 100 }}>
          <option value="">Tutti gli anni</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button onClick={openNew} style={btnPrimary}>
          + Nuovo controllo
        </button>
      </div>

      {/* ── Table / List ── */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#6C6B5D", fontFamily: "'Albert Sans', sans-serif" }}>
          Caricamento...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          background: "#fff",
          border: "1px solid #D8CCB8",
          borderRadius: 12,
          padding: "48px 24px",
          textAlign: "center",
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#D8CCB8" strokeWidth="1.5" strokeLinecap="round">
            <path d="M6 18h8M3 22h18M14 22a7 7 0 100-14h-1M9 14h2M9 12a2 2 0 01-2-2V6h6v4a2 2 0 01-2 2zM12 6V3a1 1 0 00-1-1H9a1 1 0 00-1 1v3" />
          </svg>
          <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 15, color: "#6C6B5D", marginTop: 12 }}>
            Nessun controllo registrato
          </p>
          <button onClick={openNew} style={{ ...btnPrimary, marginTop: 8 }}>
            + Registra il primo controllo
          </button>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #D8CCB8", borderRadius: 12, overflow: "hidden" }}>
          {/* Desktop table */}
          <div className="table-responsive">
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Albert Sans', sans-serif", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#F3EBDD" }}>
                  <th style={thStyle}>Tipo</th>
                  <th style={thStyle}>Data prelievo</th>
                  <th style={thStyle}>Laboratorio</th>
                  <th style={thStyle}>Esito</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Punti</th>
                  <th style={thStyle}>Prossimo controllo</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => {
                  const ec = esitoColor(c.esito_generale);
                  const samples = samplesMap[c.id] ?? [];
                  const isOverdue = c.prossimo_controllo && new Date(c.prossimo_controllo) < today;
                  const isSoon = c.prossimo_controllo && !isOverdue && new Date(c.prossimo_controllo) <= in30;

                  return (
                    <tr
                      key={c.id}
                      onClick={() => setDetailId(c.id)}
                      style={{
                        background: i % 2 === 0 ? "#fff" : "#FAFAF7",
                        cursor: "pointer",
                        transition: "background .15s",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#F3EBDD")}
                      onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "#fff" : "#FAFAF7")}
                    >
                      <td style={tdStyle}>{typeLabel(c.tipo)}</td>
                      <td style={tdStyle}>{fmtD(c.data_prelievo)}</td>
                      <td style={tdStyle}>{c.laboratorio || "—"}</td>
                      <td style={tdStyle}>
                        <span style={{
                          display: "inline-block",
                          padding: "3px 10px",
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 600,
                          background: ec.bg,
                          color: ec.text,
                          border: `1px solid ${ec.border}`,
                        }}>
                          {esitoLabel(c.esito_generale)}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>{samples.length}</td>
                      <td style={tdStyle}>
                        {c.prossimo_controllo ? (
                          <span style={{
                            fontWeight: isOverdue || isSoon ? 700 : 400,
                            color: isOverdue ? "#9E3B2E" : isSoon ? "#C77B4A" : "#1F3326",
                          }}>
                            {fmtD(c.prossimo_controllo)}
                            {isOverdue && " (scaduto)"}
                            {isSoon && " (in scadenza)"}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Detail Modal ── */}
      <Modal isOpen={!!detailControl} onClose={() => setDetailId(null)} title="Dettaglio controllo" maxWidth={640}>
        {detailControl && (
          <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px", marginBottom: 20 }}>
              <div>
                <div style={{ ...labelStyle, marginBottom: 2 }}>Tipo</div>
                <div style={{ color: "#1F3326", fontWeight: 600 }}>{typeLabel(detailControl.tipo)}</div>
              </div>
              <div>
                <div style={{ ...labelStyle, marginBottom: 2 }}>Laboratorio</div>
                <div style={{ color: "#1F3326" }}>{detailControl.laboratorio || "—"}</div>
              </div>
              <div>
                <div style={{ ...labelStyle, marginBottom: 2 }}>Data prelievo</div>
                <div style={{ color: "#1F3326" }}>{fmtD(detailControl.data_prelievo)}</div>
              </div>
              <div>
                <div style={{ ...labelStyle, marginBottom: 2 }}>Esito generale</div>
                {(() => {
                  const ec = esitoColor(detailControl.esito_generale);
                  return (
                    <span style={{
                      display: "inline-block",
                      padding: "3px 10px",
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 600,
                      background: ec.bg,
                      color: ec.text,
                      border: `1px solid ${ec.border}`,
                    }}>
                      {esitoLabel(detailControl.esito_generale)}
                    </span>
                  );
                })()}
              </div>
              <div>
                <div style={{ ...labelStyle, marginBottom: 2 }}>Periodicita</div>
                <div style={{ color: "#1F3326" }}>
                  {detailControl.periodicita_mesi ? `Ogni ${detailControl.periodicita_mesi} mesi` : "—"}
                </div>
              </div>
              <div>
                <div style={{ ...labelStyle, marginBottom: 2 }}>Prossimo controllo</div>
                <div style={{ color: "#1F3326", fontWeight: detailControl.prossimo_controllo && new Date(detailControl.prossimo_controllo) < today ? 700 : 400 }}>
                  {fmtD(detailControl.prossimo_controllo)}
                </div>
              </div>
            </div>

            {detailControl.note && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ ...labelStyle, marginBottom: 2 }}>Note</div>
                <div style={{ color: "#1F3326", whiteSpace: "pre-wrap" }}>{detailControl.note}</div>
              </div>
            )}

            {/* Samples */}
            <div style={{ ...labelStyle, marginBottom: 8, fontSize: 15, fontWeight: 700, color: "#1F3326" }}>
              Punti di prelievo ({detailSamples.length})
            </div>
            {detailSamples.length === 0 ? (
              <p style={{ color: "#6C6B5D", fontSize: 13 }}>Nessun punto di prelievo registrato.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {detailSamples.map((s) => {
                  const ec = esitoColor(s.esito);
                  return (
                    <div key={s.id} style={{
                      background: "#FAF9F5",
                      border: "1px solid #D8CCB8",
                      borderRadius: 10,
                      padding: "12px 16px",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                        <span style={{ fontWeight: 600, color: "#1F3326" }}>{s.punto_prelievo}</span>
                        <span style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 20,
                          fontSize: 11,
                          fontWeight: 600,
                          background: ec.bg,
                          color: ec.text,
                          border: `1px solid ${ec.border}`,
                        }}>
                          {esitoLabel(s.esito)}
                        </span>
                      </div>
                      {s.note && <div style={{ fontSize: 13, color: "#6C6B5D", marginTop: 4 }}>{s.note}</div>}
                      {s.referto_url && (
                        <button
                          onClick={() => openReferto(s.referto_url!)}
                          style={{
                            marginTop: 8,
                            background: "none",
                            border: "1px solid #4F7B8C",
                            borderRadius: 6,
                            padding: "4px 12px",
                            fontSize: 12,
                            color: "#4F7B8C",
                            cursor: "pointer",
                            fontFamily: "'Albert Sans', sans-serif",
                            fontWeight: 600,
                          }}
                        >
                          Apri referto PDF
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 12, marginTop: 20, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button onClick={() => { setDetailId(null); openEdit(detailControl); }} style={btnSecondary}>
                Modifica
              </button>
              {(role === "admin") && (
                <button onClick={() => handleDelete(detailControl.id)} style={{ ...btnSecondary, color: "#9E3B2E", borderColor: "#9E3B2E" }}>
                  Elimina
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ── New/Edit Modal ── */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editId ? "Modifica controllo" : "Nuovo controllo"} maxWidth={640} style={{ maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Tipo */}
          <div>
            <label style={labelStyle}>Tipo di controllo</label>
            <select value={form.tipo} onChange={e => set("tipo", e.target.value)} style={selectStyle}>
              {CONTROL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Laboratorio */}
          <div>
            <label style={labelStyle}>Laboratorio</label>
            <input value={form.laboratorio} onChange={e => set("laboratorio", e.target.value)} placeholder="Nome del laboratorio" style={inputStyle} />
          </div>

          {/* Data prelievo */}
          <div>
            <label style={labelStyle}>Data prelievo *</label>
            <DatePickerIT value={form.data_prelievo} onChange={v => set("data_prelievo", v)} />
          </div>

          {/* Periodicita + Prossimo controllo */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Periodicita (mesi)</label>
              <input
                type="number"
                min="1"
                value={form.periodicita_mesi}
                onChange={e => set("periodicita_mesi", e.target.value)}
                placeholder="es. 6"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Prossimo controllo</label>
              <DatePickerIT value={form.prossimo_controllo} onChange={v => set("prossimo_controllo", v)} />
            </div>
          </div>

          {/* Esito generale */}
          <div>
            <label style={labelStyle}>Esito generale</label>
            <select value={form.esito_generale} onChange={e => set("esito_generale", e.target.value)} style={selectStyle}>
              {ESITO_OPTS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </div>

          {/* Note */}
          <div>
            <label style={labelStyle}>Note</label>
            <textarea
              value={form.note}
              onChange={e => set("note", e.target.value)}
              rows={2}
              style={{ ...inputStyle, resize: "vertical" }}
              placeholder="Note opzionali..."
            />
          </div>

          {/* ── Punti di prelievo ── */}
          <div style={{ borderTop: "1px solid #D8CCB8", paddingTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 15, fontWeight: 700, color: "#1F3326" }}>
                Punti di prelievo ({sampleForms.length})
              </span>
              <button type="button" onClick={addSample} style={{ ...btnSecondary, padding: "6px 14px", fontSize: 13 }}>
                + Aggiungi punto
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {sampleForms.map((s, idx) => (
                <div key={idx} style={{
                  background: "#FAF9F5",
                  border: "1px solid #D8CCB8",
                  borderRadius: 10,
                  padding: "14px 16px",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, fontWeight: 700, color: "#6C6B5D" }}>
                      Punto #{idx + 1}
                    </span>
                    {sampleForms.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSample(idx)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#9E3B2E", fontSize: 18, lineHeight: 1, padding: "2px 6px" }}
                        title="Rimuovi punto"
                      >
                        &times;
                      </button>
                    )}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ ...labelStyle, fontSize: 12 }}>Punto di prelievo</label>
                      <input
                        value={s.punto_prelievo}
                        onChange={e => updateSample(idx, "punto_prelievo", e.target.value)}
                        placeholder="es. Rubinetto cucina"
                        style={{ ...inputStyle, fontSize: 13, padding: "8px 10px" }}
                      />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, fontSize: 12 }}>Esito</label>
                      <select
                        value={s.esito}
                        onChange={e => updateSample(idx, "esito", e.target.value)}
                        style={{ ...selectStyle, fontSize: 13, padding: "8px 10px" }}
                      >
                        {ESITO_OPTS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <label style={{ ...labelStyle, fontSize: 12 }}>Note punto</label>
                    <input
                      value={s.note}
                      onChange={e => updateSample(idx, "note", e.target.value)}
                      placeholder="Note opzionali..."
                      style={{ ...inputStyle, fontSize: 13, padding: "8px 10px" }}
                    />
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <label style={{ ...labelStyle, fontSize: 12 }}>Referto PDF</label>
                    {s.existingUrl && !s.file && (
                      <div style={{ fontSize: 12, color: "#4F7B8C", marginBottom: 4 }}>
                        Referto esistente caricato
                      </div>
                    )}
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={e => updateSample(idx, "file", e.target.files?.[0] ?? null)}
                      style={{ fontSize: 13, fontFamily: "'Albert Sans', sans-serif" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 }}>
            <button onClick={() => setShowModal(false)} style={btnSecondary} disabled={saving}>
              Annulla
            </button>
            <button onClick={handleSave} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }} disabled={saving}>
              {saving ? "Salvataggio..." : editId ? "Aggiorna" : "Salva"}
            </button>
          </div>
        </div>
      </Modal>

      <Toast toast={toast} />
    </>
  );
}

/* ── Table cell styles ── */
const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 14px",
  fontFamily: "'Albert Sans', sans-serif",
  fontSize: 12,
  fontWeight: 700,
  color: "#6C6B5D",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  borderBottom: "1px solid #D8CCB8",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 14px",
  fontFamily: "'Albert Sans', sans-serif",
  fontSize: 14,
  color: "#1F3326",
  borderBottom: "1px solid #F3EBDD",
};
