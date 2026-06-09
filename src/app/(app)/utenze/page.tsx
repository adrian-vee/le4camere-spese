"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { eur, fmtDate, type Category } from "@/lib/format";

type Bill = {
  id: string;
  bill_type: string;
  supplier_name: string;
  amount: number;
  period_start: string;
  period_end: string;
  consumption: number | null;
  consumption_unit: string | null;
  expense_id: string | null;
  created_by: string | null;
  created_at: string;
};

const BILL_TYPES = ["Luce", "Gas", "Acqua"] as const;
const emptyForm = {
  bill_type: "Luce" as string,
  supplier_name: "",
  amount: "",
  period_start: "",
  period_end: "",
  consumption: "",
  consumption_unit: "kWh",
  auto_expense: true,
};

export default function UtenzePage() {
  const supabase = createClient();
  const [bills, setBills] = useState<Bill[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "warn" | "error" } | null>(null);

  function showToast(msg: string, type: "ok" | "warn" | "error" = "ok") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  async function load() {
    const [{ data: b }, { data: c }] = await Promise.all([
      supabase.from("utility_bills").select("*").order("period_end", { ascending: false }),
      supabase.from("categories").select("*").order("sort"),
    ]);
    setBills((b ?? []) as Bill[]);
    setCats((c ?? []) as Category[]);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function save() {
    const amt = parseFloat(form.amount);
    if (!form.supplier_name.trim() || isNaN(amt) || amt <= 0 || !form.period_start || !form.period_end) {
      showToast("Compila tutti i campi obbligatori", "warn");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");

      const consumption = form.consumption ? parseFloat(form.consumption) : null;

      const { data: bill, error: billErr } = await supabase
        .from("utility_bills")
        .insert({
          bill_type: form.bill_type,
          supplier_name: form.supplier_name.trim(),
          amount: amt,
          period_start: form.period_start,
          period_end: form.period_end,
          consumption,
          consumption_unit: consumption ? form.consumption_unit : null,
          created_by: user.id,
        })
        .select("id")
        .single();

      if (billErr) throw billErr;

      if (form.auto_expense) {
        const utenzeCat = cats.find((c) =>
          c.name.toLowerCase().includes("utenz") || c.name.toLowerCase().includes("luce") || c.name.toLowerCase().includes("gas")
        );

        const dueDate = new Date(form.period_end);
        dueDate.setDate(dueDate.getDate() + 30);

        const consumoNote = consumption ? ` | Consumo: ${consumption} ${form.consumption_unit}` : "";
        const notes = `Bolletta ${form.bill_type} — periodo ${fmtDate(form.period_start)} - ${fmtDate(form.period_end)}${consumoNote}`;

        const { data: expense, error: expErr } = await supabase
          .from("expenses")
          .insert({
            amount: amt,
            expense_date: form.period_end,
            category_id: utenzeCat?.id ?? null,
            supplier_name: form.supplier_name.trim(),
            doc_type: "Fattura",
            payment_method: "Bonifico",
            payment_status: "da_pagare",
            due_date: dueDate.toISOString().slice(0, 10),
            cost_center: "Generale",
            notes,
            created_by: user.id,
          })
          .select("id")
          .single();

        if (expErr) throw expErr;

        await supabase
          .from("utility_bills")
          .update({ expense_id: expense.id })
          .eq("id", bill.id);

        showToast("Bolletta salvata + spesa creata automaticamente");
      } else {
        showToast("Bolletta salvata");
      }

      setForm({ ...emptyForm });
      setShowForm(false);
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Errore imprevisto", "error");
    } finally {
      setSaving(false);
    }
  }

  async function del(id: string) {
    if (!confirm("Eliminare questa bolletta?")) return;
    await supabase.from("utility_bills").delete().eq("id", id);
    setBills((prev) => prev.filter((b) => b.id !== id));
    showToast("Bolletta eliminata");
  }

  const unitMap: Record<string, string> = { Luce: "kWh", Gas: "m\u00B3", Acqua: "m\u00B3" };

  return (
    <>
      <div className="section">
        <div className="section-head">
          <h2>Utenze</h2>
          <button
            className="btn btn-primary"
            style={{ padding: "9px 18px", fontSize: 14 }}
            onClick={() => setShowForm((p) => !p)}
          >
            {showForm ? "Chiudi" : "+ Nuova bolletta"}
          </button>
        </div>

        {showForm && (
          <div className="section-body" style={{ borderBottom: "1px solid var(--line)" }}>
            <div className="grid2">
              <div className="field">
                <label>Tipo</label>
                <select value={form.bill_type} onChange={(e) => { set("bill_type", e.target.value); set("consumption_unit", unitMap[e.target.value] || "kWh"); }}>
                  {BILL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Fornitore</label>
                <input value={form.supplier_name} onChange={(e) => set("supplier_name", e.target.value)} placeholder="Es. Enel, A2A..." />
              </div>
              <div className="field">
                <label>Importo (EUR)</label>
                <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0.00" />
              </div>
              <div className="field">
                <label>Consumo ({form.consumption_unit})</label>
                <input type="number" step="0.01" min="0" value={form.consumption} onChange={(e) => set("consumption", e.target.value)} placeholder="Opzionale" />
              </div>
              <div className="field">
                <label>Periodo dal</label>
                <input type="date" value={form.period_start} onChange={(e) => set("period_start", e.target.value)} />
              </div>
              <div className="field">
                <label>Periodo al</label>
                <input type="date" value={form.period_end} onChange={(e) => set("period_end", e.target.value)} />
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 16 }}>
              <input
                type="checkbox"
                checked={form.auto_expense}
                onChange={(e) => set("auto_expense", e.target.checked)}
                style={{ width: 20, height: 20, accentColor: "var(--ok)" }}
              />
              Crea spesa automaticamente
            </label>
            <button className="btn btn-primary" onClick={save} disabled={saving} style={{ padding: "12px 28px" }}>
              {saving ? "Salvataggio..." : "Salva bolletta"}
            </button>
          </div>
        )}

        <div className="section-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="empty">Caricamento...</div>
          ) : bills.length === 0 ? (
            <div className="empty">
              <div className="serif">Nessuna bolletta registrata</div>
              <div>Premi &quot;+ Nuova bolletta&quot; per iniziare.</div>
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Fornitore</th>
                  <th className="hide-sm">Periodo</th>
                  <th className="hide-sm">Consumo</th>
                  <th style={{ textAlign: "right" }}>Importo</th>
                  <th className="hide-sm">Spesa</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <span className="tag">
                        <span className="dot" style={{ background: b.bill_type === "Luce" ? "#F5C542" : b.bill_type === "Gas" ? "#E07B3A" : "#4A9BD9" }} />
                        {b.bill_type}
                      </span>
                    </td>
                    <td><strong>{b.supplier_name}</strong></td>
                    <td className="hide-sm">{fmtDate(b.period_start)} — {fmtDate(b.period_end)}</td>
                    <td className="hide-sm">{b.consumption ? `${b.consumption} ${b.consumption_unit}` : "—"}</td>
                    <td className="amt-cell tabular" style={{ textAlign: "right" }}>{eur(b.amount)}</td>
                    <td className="hide-sm">
                      {b.expense_id
                        ? <span className="badge ok">Collegata</span>
                        : <span className="muted">No</span>}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn-ghost" style={{ padding: "6px 10px", borderRadius: 8, fontSize: 12 }} onClick={() => del(b.id)}>Elimina</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: toast.type === "ok" ? "#2D5A3D" : toast.type === "warn" ? "#B68A3E" : "#9E3B2E",
          color: "#FAF9F5", padding: "12px 24px", borderRadius: 10, fontSize: 14, fontWeight: 600,
          zIndex: 200, boxShadow: "0 4px 20px rgba(0,0,0,.25)",
        }}>
          {toast.msg}
        </div>
      )}
    </>
  );
}
