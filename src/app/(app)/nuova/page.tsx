"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { DOC_TYPES, PAYMENT_METHODS, COST_CENTERS, isoToday, type Category } from "@/lib/format";
import { useRole } from "@/lib/useRole";
import DatePickerIT from "@/components/ui/DatePickerIT";

type Form = {
  amount: string; expense_date: string; category_id: string; supplier_name: string;
  doc_type: string; payment_method: string; payment_status: "pagato" | "da_pagare";
  due_date: string; cost_center: string; notes: string;
};


export default function NuovaSpesa() {
  const router = useRouter();
  const supabase = createClient();
  const { role, isManager, loading: roleLoading } = useRole();
  const isStaff = role === "staff";

  useEffect(() => {
    if (!roleLoading && !isManager) {
      router.replace("/");
    }
  }, [roleLoading, isManager, router]);

  const [cats, setCats] = useState<Category[]>([]);
  const [staffSaved, setStaffSaved] = useState(false);
  const [form, setForm] = useState<Form>({
    amount: "", expense_date: isoToday(), category_id: "", supplier_name: "",
    doc_type: "Scontrino", payment_method: "Carta", payment_status: "pagato",
    due_date: "", cost_center: "Generale", notes: "",
  });
  const [photo, setPhoto] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guide
  const [guideOpen, setGuideOpen] = useState(false);
  useEffect(() => {
    if (localStorage.getItem("nuova_guide_closed") !== "1") setGuideOpen(true);
  }, []);
  function toggleGuide() {
    setGuideOpen(prev => {
      const next = !prev;
      localStorage.setItem("nuova_guide_closed", next ? "0" : "1");
      return next;
    });
  }

  useEffect(() => {
    supabase.from("categories").select("*").order("sort").then(({ data }) => {
      const c = (data ?? []) as Category[];
      setCats(c);
      setForm((f) => ({ ...f, category_id: f.category_id || (c[0]?.id ?? "") }));
    });
    // eslint-disable-next-line
  }, []);

  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new globalThis.Image();
      img.onload = () => {
        const maxd = 1600;
        let { width: w, height: h } = img;
        if (w > maxd || h > maxd) { const r = Math.min(maxd / w, maxd / h); w = Math.round(w * r); h = Math.round(h * r); }
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        cv.getContext("2d")!.drawImage(img, 0, 0, w, h);
        const dataUrl = cv.toDataURL("image/jpeg", 0.75);
        setPhoto(dataUrl);
        scan(dataUrl);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  function onPhoto(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (file) handleFile(file);
  }

  async function scan(dataUrl: string) {
    setScanning(true);
    setScanMsg("Analizzo lo scontrino...");
    try {
      const res = await fetch("/api/scan-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      if (!res.ok) throw new Error("Scansione non riuscita");
      const data = await res.json();
      setForm((f) => {
        const next = { ...f };
        if (data.amount) next.amount = String(data.amount).replace(",", ".");
        if (data.date) next.expense_date = data.date;
        if (data.supplier) next.supplier_name = data.supplier;
        if (data.doc_type && DOC_TYPES.includes(data.doc_type)) next.doc_type = data.doc_type;
        if (data.category) {
          const match = cats.find((c) => c.name.toLowerCase().includes(String(data.category).toLowerCase()) || String(data.category).toLowerCase().includes(c.name.toLowerCase().split(" ")[0]));
          if (match) next.category_id = match.id;
        }
        return next;
      });
      setScanMsg("Dati estratti con successo! Controlla e correggi se serve.");
    } catch {
      setScanMsg("Non sono riuscito a leggere lo scontrino: inserisci i dati a mano.");
    } finally {
      setScanning(false);
    }
  }

  async function save() {
    setError(null);
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) return setError("Inserisci un importo valido (maggiore di zero).");
    if (!form.expense_date) return setError("Inserisci la data.");
    if (!form.category_id) return setError("Seleziona una categoria.");

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessione scaduta, rifai il login.");

      let document_path: string | null = null;
      if (photo) {
        const blob = await (await fetch(photo)).blob();
        const path = `${user.id}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage.from("documenti").upload(path, blob, { contentType: "image/jpeg" });
        if (upErr) throw upErr;
        document_path = path;
      }

      const { error: insErr } = await supabase.from("expenses").insert({
        amount,
        expense_date: form.expense_date,
        category_id: form.category_id || null,
        supplier_name: form.supplier_name.trim() || null,
        doc_type: form.doc_type,
        payment_method: form.payment_method,
        payment_status: form.payment_status,
        due_date: form.payment_status === "da_pagare" && form.due_date ? form.due_date : null,
        cost_center: form.cost_center || null,
        notes: form.notes.trim() || null,
        document_path,
        created_by: user.id,
        ...(isStaff ? { needs_approval: true } : {}),
      });
      if (insErr) throw insErr;

      if (isStaff) {
        setStaffSaved(true);
        setSaving(false);
        return;
      }
      router.push("/spese");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore nel salvataggio.");
      setSaving(false);
    }
  }

  if (roleLoading || !isManager) {
    return <div style={{ padding: 40, textAlign: "center", color: "#6C6B5D", fontFamily: "'Albert Sans', sans-serif" }}>Caricamento...</div>;
  }

  if (staffSaved) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#2D5A3D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" />
        </svg>
        <h2 className="serif" style={{ fontSize: 22, marginBottom: 8 }}>Spesa registrata</h2>
        <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 24 }}>
          La spesa è stata inviata e sarà visibile dopo l&apos;approvazione del manager.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button className="btn btn-ghost" onClick={() => router.push("/")}>Torna alla home</button>
          <button className="btn btn-primary" onClick={() => { setStaffSaved(false); setForm({ amount: "", expense_date: isoToday(), category_id: cats[0]?.id ?? "", supplier_name: "", doc_type: "Scontrino", payment_method: "Carta", payment_status: "pagato", due_date: "", cost_center: "Generale", notes: "" }); setPhoto(null); setScanMsg(null); }}>Registra un&apos;altra</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <h2 className="serif" style={{ fontSize: 22, fontWeight: 500 }}>Nuova spesa</h2>
        {isStaff && <p style={{ color: "var(--ink-soft)", fontSize: 13, marginTop: 4 }}>La spesa sar&agrave; inviata per approvazione al manager.</p>}
      </div>

      {/* ── Guide Banner ── */}
      <div style={{
        background: "#F3EBDD", borderLeft: "3px solid #BFA762", borderRadius: 8,
        padding: guideOpen ? "16px 18px" : "12px 18px", marginBottom: 20,
        transition: "padding 0.2s",
      }}>
        <button onClick={toggleGuide} style={{
          background: "none", border: "none", cursor: "pointer", padding: 0,
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          fontFamily: "'Albert Sans', sans-serif", fontSize: 14, fontWeight: 600, color: "#1F3326",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#BFA762" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
          </svg>
          Come registrare una spesa
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6C6B5D" strokeWidth="2" strokeLinecap="round" style={{ marginLeft: "auto", transform: guideOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {guideOpen && (
          <ol style={{ marginTop: 12, fontSize: 13, lineHeight: 1.7, color: "#6C6B5D", paddingLeft: 18 }}>
            <li>Scatta una foto allo scontrino o alla fattura con il bottone fotocamera &mdash; i dati verranno estratti automaticamente</li>
            <li>Controlla che i dati estratti siano corretti (importo, data, fornitore)</li>
            <li>Seleziona la categoria corretta</li>
            <li>Indica se la spesa &egrave; gi&agrave; stata pagata o &egrave; da pagare</li>
            <li>Aggiungi note se necessario (es. per cosa &egrave; stata fatta la spesa)</li>
            <li>Clicca <strong>&laquo;Salva spesa&raquo;</strong></li>
          </ol>
        )}
        {guideOpen && (
          <div style={{ marginTop: 8, fontSize: 13, color: "#6C6B5D", fontStyle: "italic" }}>
            Puoi anche inserire una spesa manualmente senza foto.
          </div>
        )}
      </div>

      <div className="nuova-grid">
        {/* ── Left: Photo / OCR ── */}
        <div>
          {!photo ? (
            <label
              className="foto-zone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
            >
              <svg className="icon" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <div className="foto-zone-title">Scatta o carica il documento</div>
              <div className="foto-zone-sub">Scontrino, fattura, bolla, ricevuta</div>
              <input type="file" accept="image/*" capture="environment" onChange={onPhoto} />
            </label>
          ) : (
            <div className="foto-zone has-photo">
              <Image src={photo} alt="documento" width={400} height={300} unoptimized style={{ width: "100%", height: "auto" }} />
              <button className="foto-remove" onClick={() => { setPhoto(null); setScanMsg(null); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }}><path d="M18 6L6 18M6 6l12 12" /></svg>Rimuovi foto
              </button>
            </div>
          )}
          {scanMsg && (
            <div style={{
              marginTop: 12, padding: "10px 14px", borderRadius: 9, fontSize: 13, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 8,
              background: scanning ? "#F3EBDD" : "#E3EEE4",
              color: scanning ? "#1F3326" : "#2D5A3D",
              transition: "background 0.3s, color 0.3s",
            }}>
              {scanning ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#BFA762" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }}>
                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2D5A3D" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
              {scanMsg}
            </div>
          )}
        </div>

        {/* ── Right: Form ── */}
        <div className="section nuova-form" style={{ borderRadius: 16 }}>
          <div className="section-body" style={{ padding: 32 }}>

            <div className="grid2">
              <div className="field">
                <label>Importo (€)</label>
                <input type="number" inputMode="decimal" step="0.01" min="0" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="Es: 45,50" />
              </div>
              <div className="field">
                <label>Data</label>
                <DatePickerIT value={form.expense_date} onChange={v => set("expense_date", v)} />
              </div>
            </div>

            <div className="field">
              <label>Fornitore</label>
              <input value={form.supplier_name} onChange={(e) => set("supplier_name", e.target.value)} placeholder="Es: Eurospin, Mulino Bianco, idraulico..." />
            </div>

            <div className="grid2">
              <div className="field">
                <label>Categoria</label>
                <select value={form.category_id} onChange={(e) => set("category_id", e.target.value)}>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Tipo documento</label>
                <select value={form.doc_type} onChange={(e) => set("doc_type", e.target.value)}>
                  {DOC_TYPES.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
            </div>

            <div className="grid2">
              <div className="field">
                <label>Pagamento</label>
                <select value={form.payment_method} onChange={(e) => set("payment_method", e.target.value)}>
                  {PAYMENT_METHODS.map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Centro di costo</label>
                <select value={form.cost_center} onChange={(e) => set("cost_center", e.target.value)}>
                  {COST_CENTERS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="grid2">
              <div className="field">
                <label>Stato</label>
                <select value={form.payment_status} onChange={(e) => set("payment_status", e.target.value)}>
                  <option value="pagato">Pagato</option>
                  <option value="da_pagare">Da pagare</option>
                </select>
              </div>
              {form.payment_status === "da_pagare" && (
                <div className="field">
                  <label>Scadenza</label>
                  <DatePickerIT value={form.due_date} onChange={v => set("due_date", v)} />
                </div>
              )}
            </div>

            <div className="field">
              <label>Note</label>
              <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Es: Spesa settimanale colazione, riparazione rubinetto camera 3..." />
            </div>

            {error && <p className="error" style={{ textAlign: "left" }}>{error}</p>}

            <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
              <button className="btn btn-ghost" onClick={() => router.push(isStaff ? "/" : "/spese")}>Annulla</button>
              <button className="btn btn-primary btn-block" style={{ padding: "15px 22px", fontSize: 16 }} onClick={save} disabled={saving || scanning || !form.amount || !form.category_id}>
                {saving ? "Salvataggio..." : "Salva spesa"}
              </button>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
