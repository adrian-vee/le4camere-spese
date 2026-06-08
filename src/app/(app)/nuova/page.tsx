"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { DOC_TYPES, PAYMENT_METHODS, COST_CENTERS, type Category } from "@/lib/format";

type Form = {
  amount: string; expense_date: string; category_id: string; supplier_name: string;
  doc_type: string; payment_method: string; payment_status: "pagato" | "da_pagare";
  due_date: string; cost_center: string; notes: string;
};

const today = () => new Date().toISOString().slice(0, 10);

export default function NuovaSpesa() {
  const router = useRouter();
  const supabase = createClient();
  const [cats, setCats] = useState<Category[]>([]);
  const [form, setForm] = useState<Form>({
    amount: "", expense_date: today(), category_id: "", supplier_name: "",
    doc_type: "Scontrino", payment_method: "Carta", payment_status: "pagato",
    due_date: "", cost_center: "Generale", notes: "",
  });
  const [photo, setPhoto] = useState<string | null>(null); // dataURL jpeg
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("categories").select("*").order("sort").then(({ data }) => {
      const c = (data ?? []) as Category[];
      setCats(c);
      setForm((f) => ({ ...f, category_id: f.category_id || (c[0]?.id ?? "") }));
    });
    // eslint-disable-next-line
  }, []);

  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function onPhoto(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
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

  async function scan(dataUrl: string) {
    setScanning(true);
    setScanMsg("Lettura dello scontrino in corso…");
    try {
      const res = await fetch("/api/scan-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      if (!res.ok) throw new Error("Scansione non riuscita");
      const data = await res.json();
      // Precompila i campi disponibili (l'utente verifica sempre)
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
      setScanMsg("✓ Dati estratti — controlla e correggi se serve.");
    } catch {
      setScanMsg("Non sono riuscito a leggere lo scontrino: inserisci i dati a mano.");
    } finally {
      setScanning(false);
    }
  }

  async function save() {
    setError(null);
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount < 0) return setError("Inserisci un importo valido.");
    if (!form.expense_date) return setError("Inserisci la data.");

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
      });
      if (insErr) throw insErr;

      router.push("/spese");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore nel salvataggio.");
      setSaving(false);
    }
  }

  return (
    <div className="section" style={{ maxWidth: 620, margin: "0 auto" }}>
      <div className="section-head"><h2>Nuova spesa</h2></div>
      <div className="section-body">
        {/* Foto + OCR */}
        {!photo ? (
          <label className="foto-drop">
            📷 Scatta o carica scontrino / fattura / bolla
            <input type="file" accept="image/*" capture="environment" onChange={onPhoto} />
          </label>
        ) : (
          <div className="foto-preview">
            <img src={photo} alt="documento" />
            <button className="btn-ghost" style={{ padding: "8px 14px" }} onClick={() => { setPhoto(null); setScanMsg(null); }}>Rimuovi</button>
          </div>
        )}
        {scanMsg && <div className="scan-status">{scanning ? "⏳ " : ""}{scanMsg}</div>}

        <div style={{ height: 18 }} />

        <div className="grid2">
          <div className="field"><label>Importo (€)</label>
            <input type="number" inputMode="decimal" step="0.01" min="0" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0,00" /></div>
          <div className="field"><label>Data</label>
            <input type="date" value={form.expense_date} onChange={(e) => set("expense_date", e.target.value)} /></div>
        </div>

        <div className="field"><label>Fornitore</label>
          <input value={form.supplier_name} onChange={(e) => set("supplier_name", e.target.value)} placeholder="Es. Metro, Enel, idraulico…" /></div>

        <div className="grid2">
          <div className="field"><label>Categoria</label>
            <select value={form.category_id} onChange={(e) => set("category_id", e.target.value)}>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div className="field"><label>Tipo documento</label>
            <select value={form.doc_type} onChange={(e) => set("doc_type", e.target.value)}>
              {DOC_TYPES.map((d) => <option key={d}>{d}</option>)}
            </select></div>
        </div>

        <div className="grid2">
          <div className="field"><label>Pagamento</label>
            <select value={form.payment_method} onChange={(e) => set("payment_method", e.target.value)}>
              {PAYMENT_METHODS.map((p) => <option key={p}>{p}</option>)}
            </select></div>
          <div className="field"><label>Centro di costo</label>
            <select value={form.cost_center} onChange={(e) => set("cost_center", e.target.value)}>
              {COST_CENTERS.map((c) => <option key={c}>{c}</option>)}
            </select></div>
        </div>

        <div className="grid2">
          <div className="field"><label>Stato</label>
            <select value={form.payment_status} onChange={(e) => set("payment_status", e.target.value)}>
              <option value="pagato">Pagato</option>
              <option value="da_pagare">Da pagare</option>
            </select></div>
          {form.payment_status === "da_pagare" && (
            <div className="field"><label>Scadenza</label>
              <input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} /></div>
          )}
        </div>

        <div className="field"><label>Note</label>
          <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Descrizione opzionale" /></div>

        {error && <p className="error" style={{ textAlign: "left" }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <button className="btn btn-ghost" onClick={() => router.push("/spese")}>Annulla</button>
          <button className="btn btn-primary btn-block" onClick={save} disabled={saving || scanning}>
            {saving ? "Salvataggio…" : "Salva spesa"}
          </button>
        </div>
      </div>
    </div>
  );
}
