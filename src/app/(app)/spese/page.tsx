"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { eur, fmtDate, monthKey, monthLabel, type Expense, type Category } from "@/lib/format";

export default function SpesePage() {
  const supabase = createClient();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [month, setMonth] = useState("");
  const [cat, setCat] = useState("");

  async function load() {
    setLoading(true);
    const [{ data: exp }, { data: c }] = await Promise.all([
      supabase.from("expenses").select("*, categories(name,color), profiles(full_name)").order("expense_date", { ascending: false }),
      supabase.from("categories").select("*").order("sort"),
    ]);
    setExpenses((exp ?? []) as Expense[]);
    setCats((c ?? []) as Category[]);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const months = useMemo(
    () => [...new Set(expenses.map((e) => monthKey(e.expense_date)).filter(Boolean))].sort().reverse(),
    [expenses]
  );

  const filtered = useMemo(() => {
    const query = q.toLowerCase().trim();
    return expenses.filter((e) => {
      if (month && monthKey(e.expense_date) !== month) return false;
      if (cat && e.category_id !== cat) return false;
      if (query && !`${e.supplier_name ?? ""} ${e.notes ?? ""}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [expenses, q, month, cat]);

  const total = filtered.reduce((s, e) => s + Number(e.amount), 0);

  async function del(id: string, path: string | null) {
    if (!confirm("Eliminare questa spesa?")) return;
    if (path) await supabase.storage.from("documenti").remove([path]);
    await supabase.from("expenses").delete().eq("id", id);
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  async function openDoc(path: string) {
    const { data } = await supabase.storage.from("documenti").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  function exportCSV() {
    if (!filtered.length) return alert("Nessuna spesa da esportare.");
    const head = ["Data", "Fornitore", "Categoria", "Tipo", "Pagamento", "Stato", "Centro di costo", "Note", "Importo EUR"];
    const rows = filtered.map((e) => [
      fmtDate(e.expense_date), e.supplier_name ?? "", e.categories?.name ?? "", e.doc_type,
      e.payment_method, e.payment_status, e.cost_center ?? "", (e.notes ?? "").replace(/\n/g, " "),
      String(e.amount).replace(".", ","),
    ]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `spese-le4camere-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  return (
    <div className="section">
      <div className="section-head">
        <h2>Registro spese · {eur(total)}</h2>
        <div className="filters">
          <input type="search" placeholder="Cerca…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">Tutti i mesi</option>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Tutte le categorie</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn-ghost" style={{ padding: "9px 14px", borderRadius: 9, fontSize: 13, fontWeight: 600 }} onClick={exportCSV}>Esporta CSV</button>
        </div>
      </div>
      <div className="section-body" style={{ padding: 0 }}>
        {loading ? (
          <div className="empty">Caricamento…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="serif">Nessuna spesa</div>
            <div><Link href="/nuova" style={{ color: "var(--accent)", fontWeight: 700 }}>Aggiungi la prima spesa</Link></div>
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Data</th><th>Fornitore</th><th className="hide-sm">Categoria</th>
                <th className="hide-sm">Doc.</th><th style={{ textAlign: "right" }}>Importo</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td>{fmtDate(e.expense_date)}</td>
                  <td>
                    <strong>{e.supplier_name || "—"}</strong>
                    {e.payment_status === "da_pagare" && <span className="badge warn" style={{ marginLeft: 8 }}>da pagare</span>}
                    {e.notes && <div className="muted">{e.notes}</div>}
                    {e.profiles?.full_name && <div className="muted">↳ {e.profiles.full_name}</div>}
                  </td>
                  <td className="hide-sm"><span className="tag"><span className="dot" style={{ background: e.categories?.color ?? "#9C8E78" }} />{e.categories?.name ?? "Altro"}</span></td>
                  <td className="hide-sm">
                    {e.document_path
                      ? <button className="btn-ghost" style={{ padding: "5px 10px", borderRadius: 8, fontSize: 12 }} onClick={() => openDoc(e.document_path!)}>📎 {e.doc_type}</button>
                      : <span className="muted">{e.doc_type}</span>}
                  </td>
                  <td className="amt-cell tabular" style={{ textAlign: "right" }}>{eur(Number(e.amount))}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn-ghost" style={{ padding: "6px 10px", borderRadius: 8, fontSize: 12 }} onClick={() => del(e.id, e.document_path)}>Elimina</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
