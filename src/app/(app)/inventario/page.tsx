"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { eur, fmtDate } from "@/lib/format";

type Product = {
  id: string; name: string; category: string; unit: string;
  unit_cost: number; min_stock: number; supplier_id: string | null;
  notes: string | null; active: boolean; current_stock: number;
};
type Movement = {
  id: string; product_id: string; type: "in" | "out"; quantity: number;
  notes: string | null; expense_id: string | null; created_by: string | null;
  created_at: string;
  products?: { name: string } | null;
  profiles?: { full_name: string } | null;
};
type Supplier = { id: string; name: string };
type Exp = { id: string; supplier_name: string | null; amount: number; expense_date: string };

const CAT_COLORS: Record<string, string> = {
  Pulizia: "#5C7363", Colazione: "#C77B4A", Biancheria: "#4F7B8C",
  "Bagno/Toiletries": "#7A6A8C", Manutenzione: "#A8552F", Cancelleria: "#B68A3E",
  Bar: "#9E3B2E", Cucina: "#C77B4A", Minibar: "#7A6A8C",
  Bevande: "#4F7B8C", Alcolici: "#8A7355", "Snack/Distributori": "#B68A3E",
  Altro: "#6C6B5D",
};
const CATEGORIES = Object.keys(CAT_COLORS);
const UNITS = ["pz", "kg", "litri", "rotoli", "conf", "bottiglie", "pacchi"];
const EMPTY_P = { name: "", category: "Pulizia", unit: "pz", unit_cost: 0, min_stock: 0, supplier_id: "", notes: "" };
const EMPTY_M = { product_id: "", type: "in" as "in" | "out", quantity: 1, notes: "", expense_id: "" };

export default function InventarioPage() {
  const supabase = createClient();

  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [expenses, setExpenses] = useState<Exp[]>([]);
  const [monthMoves, setMonthMoves] = useState(0);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "low" | "out">("all");

  const [showProd, setShowProd] = useState(false);
  const [editProd, setEditProd] = useState<Product | null>(null);
  const [pf, setPf] = useState({ ...EMPTY_P });

  const [showMove, setShowMove] = useState(false);
  const [mf, setMf] = useState({ ...EMPTY_M });

  async function load() {
    setLoading(true);
    const ago30 = new Date();
    ago30.setDate(ago30.getDate() - 30);
    const now = new Date();
    const ms = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    const [{ data: p }, { data: m }, { data: s }, { data: e }, { count }] = await Promise.all([
      supabase.from("stock_levels").select("*").eq("active", true).order("name"),
      supabase.from("stock_movements").select("*, products(name), profiles(full_name)").order("created_at", { ascending: false }).limit(20),
      supabase.from("suppliers").select("id, name").order("name"),
      supabase.from("expenses").select("id, supplier_name, amount, expense_date").gte("expense_date", ago30.toISOString().slice(0, 10)).order("expense_date", { ascending: false }).limit(50),
      supabase.from("stock_movements").select("id", { count: "exact", head: true }).gte("created_at", ms),
    ]);

    setProducts((p ?? []) as Product[]);
    setMovements((m ?? []) as Movement[]);
    setSuppliers((s ?? []) as Supplier[]);
    setExpenses((e ?? []) as Exp[]);
    setMonthMoves(count ?? 0);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const filtered = useMemo(() => {
    let list = products;
    if (search) { const q = search.toLowerCase(); list = list.filter(p => p.name.toLowerCase().includes(q)); }
    if (catFilter) list = list.filter(p => p.category === catFilter);
    if (statusFilter === "low") list = list.filter(p => p.current_stock > 0 && p.min_stock > 0 && p.current_stock < p.min_stock);
    if (statusFilter === "out") list = list.filter(p => p.current_stock <= 0);
    return list;
  }, [products, search, catFilter, statusFilter]);

  const warehouseValue = products.reduce((s, p) => s + p.current_stock * p.unit_cost, 0);
  const lowCount = products.filter(p => p.min_stock > 0 && p.current_stock < p.min_stock).length;

  async function saveProd() {
    if (!pf.name.trim()) return alert("Inserisci il nome del prodotto.");
    const payload = {
      name: pf.name.trim(), category: pf.category, unit: pf.unit,
      unit_cost: pf.unit_cost, min_stock: pf.min_stock,
      supplier_id: pf.supplier_id || null, notes: pf.notes || null, active: true,
    };
    const { error } = editProd
      ? await supabase.from("products").update(payload).eq("id", editProd.id)
      : await supabase.from("products").insert(payload);
    if (error) return alert("Errore: " + error.message);
    closeProd();
    load();
  }

  async function delProd(id: string) {
    if (!confirm("Eliminare questo prodotto?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return alert("Errore: " + error.message);
    load();
  }

  async function saveMove() {
    if (!mf.product_id) return alert("Seleziona un prodotto.");
    if (mf.quantity <= 0) return alert("La quantità deve essere maggiore di 0.");
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("stock_movements").insert({
      product_id: mf.product_id, type: mf.type, quantity: mf.quantity,
      notes: mf.notes || null, expense_id: mf.expense_id || null,
      created_by: user?.id ?? null,
    });
    if (error) return alert("Errore: " + error.message);
    closeMove();
    load();
  }

  function closeProd() { setShowProd(false); setEditProd(null); setPf({ ...EMPTY_P }); }
  function closeMove() { setShowMove(false); setMf({ ...EMPTY_M }); }

  function openNewProd() { setEditProd(null); setPf({ ...EMPTY_P }); setShowProd(true); }
  function openEditProd(p: Product) {
    setEditProd(p);
    setPf({ name: p.name, category: p.category, unit: p.unit, unit_cost: p.unit_cost, min_stock: p.min_stock, supplier_id: p.supplier_id ?? "", notes: p.notes ?? "" });
    setShowProd(true);
  }
  function openMove(pid?: string, type?: "in" | "out") {
    setMf({ ...EMPTY_M, product_id: pid ?? "", type: type ?? "in" });
    setShowMove(true);
  }

  function exportCSV() {
    const h = "Prodotto,Categoria,Giacenza,Unità,Scorta minima,Costo unitario,Valore\n";
    const r = filtered.map(p =>
      `"${p.name}","${p.category}",${p.current_stock},"${p.unit}",${p.min_stock},${p.unit_cost},${(p.current_stock * p.unit_cost).toFixed(2)}`
    ).join("\n");
    const blob = new Blob(["﻿" + h + r], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `inventario-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const catBg = (cat: string) => (CAT_COLORS[cat] ?? "#6C6B5D") + "1A";
  const catFg = (cat: string) => CAT_COLORS[cat] ?? "#6C6B5D";
  const selectedProduct = products.find(p => p.id === mf.product_id);

  const fmtDT = (s: string) => {
    const d = new Date(s);
    return `${d.toLocaleDateString("it-IT")} ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
  };

  return (
    <>
      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 16 }}>
        <h1 className="serif" style={{ fontSize: 24, fontWeight: 500 }}>Inventario</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={openNewProd}>+ Nuovo prodotto</button>
          <button className="btn btn-ghost" onClick={() => openMove()}>Registra movimento</button>
          <button className="btn btn-ghost" onClick={exportCSV}>Esporta CSV</button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="cards" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <div className="card">
          <div className="label">Prodotti attivi</div>
          <div className="value tabular">{products.length}</div>
        </div>
        <div className="card accent">
          <div className="label">Valore magazzino</div>
          <div className="value tabular">{eur(warehouseValue)}</div>
        </div>
        <div className="card">
          <div className="label">Sotto scorta</div>
          <div className="value tabular" style={{ color: lowCount > 0 ? "var(--danger)" : undefined }}>{lowCount}</div>
          {lowCount > 0 && <div className="meta" style={{ color: "var(--danger)", fontWeight: 700 }}>Riordino necessario</div>}
        </div>
        <div className="card">
          <div className="label">Movimenti del mese</div>
          <div className="value tabular">{monthMoves}</div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="section" style={{ marginBottom: 0 }}>
        <div className="section-body" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input placeholder="Cerca prodotto…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: "1 1 200px", minWidth: 160 }} />
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ minWidth: 160 }}>
            <option value="">Tutte le categorie</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="view-toggle">
            <button className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")}>Tutti</button>
            <button className={statusFilter === "low" ? "active" : ""} onClick={() => setStatusFilter("low")}>Sotto scorta</button>
            <button className={statusFilter === "out" ? "active" : ""} onClick={() => setStatusFilter("out")}>Esauriti</button>
          </div>
        </div>
      </div>

      {/* ── Products Table ── */}
      <div className="section">
        <div className="section-head">
          <h2>Prodotti ({filtered.length})</h2>
        </div>
        <div className="section-body" style={{ padding: 0, overflowX: "auto" }}>
          {loading ? (
            <div className="empty">Caricamento…</div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              <div className="serif" style={{ fontSize: 18, marginBottom: 6 }}>Nessun prodotto</div>
              <div>{products.length > 0 ? "Nessun risultato per i filtri selezionati." : "Aggiungi il primo prodotto."}</div>
            </div>
          ) : (
            <table className="tbl" style={{ minWidth: 800 }}>
              <thead>
                <tr>
                  <th>Prodotto</th>
                  <th style={{ textAlign: "center" }}>Giacenza</th>
                  <th style={{ textAlign: "center" }}>Min</th>
                  <th style={{ textAlign: "center" }}>Stato</th>
                  <th style={{ textAlign: "right" }}>Costo un.</th>
                  <th style={{ textAlign: "right" }}>Valore</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const isLow = p.min_stock > 0 && p.current_stock < p.min_stock && p.current_stock > 0;
                  const isOut = p.current_stock <= 0;
                  return (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                        <span className="badge" style={{ background: catBg(p.category), color: catFg(p.category), marginTop: 4 }}>
                          {p.category}
                        </span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span className="tabular" style={{ fontSize: 18, fontWeight: 700, color: isOut ? "var(--danger)" : isLow ? "var(--warn)" : "var(--ink)" }}>
                          {p.current_stock}
                        </span>
                        <span className="muted" style={{ fontSize: 12, marginLeft: 4 }}>{p.unit}</span>
                      </td>
                      <td className="tabular muted" style={{ textAlign: "center" }}>{p.min_stock}</td>
                      <td style={{ textAlign: "center" }}>
                        {isOut ? (
                          <span className="badge" style={{ background: "#1F3326", color: "#FAF9F5" }}>Esaurito</span>
                        ) : isLow ? (
                          <span className="badge" style={{ background: "rgba(158,59,46,.12)", color: "var(--danger)" }}>Sotto scorta</span>
                        ) : (
                          <span className="badge" style={{ background: "#E3EEE4", color: "#2D5A3D" }}>OK</span>
                        )}
                      </td>
                      <td className="tabular" style={{ textAlign: "right" }}>{eur(p.unit_cost)}</td>
                      <td className="tabular" style={{ textAlign: "right", fontWeight: 600 }}>{eur(p.current_stock * p.unit_cost)}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button className="btn-ghost" style={{ padding: "5px 10px", borderRadius: 8, fontSize: 12, color: "var(--ok)" }}
                          onClick={() => openMove(p.id, "in")}>Carica</button>
                        <button className="btn-ghost" style={{ padding: "5px 10px", borderRadius: 8, fontSize: 12, color: "#B68A3E", marginLeft: 4 }}
                          onClick={() => openMove(p.id, "out")}>Scarica</button>
                        <button className="btn-ghost" style={{ padding: "5px 10px", borderRadius: 8, fontSize: 12, marginLeft: 4 }}
                          onClick={() => openEditProd(p)}>Modifica</button>
                        <button className="btn-ghost" style={{ padding: "5px 10px", borderRadius: 8, fontSize: 12, color: "var(--danger)", marginLeft: 4 }}
                          onClick={() => delProd(p.id)}>Elimina</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Recent Movements ── */}
      {movements.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2>Ultimi movimenti</h2>
            <span className="muted">{movements.length} più recenti</span>
          </div>
          <div className="section-body" style={{ padding: 0, overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Prodotto</th>
                  <th>Tipo</th>
                  <th style={{ textAlign: "right" }}>Quantità</th>
                  <th className="hide-sm">Note</th>
                  <th className="hide-sm">Chi</th>
                </tr>
              </thead>
              <tbody>
                {movements.map(m => (
                  <tr key={m.id}>
                    <td style={{ whiteSpace: "nowrap", fontSize: 13 }}>{fmtDT(m.created_at)}</td>
                    <td><strong>{m.products?.name ?? "?"}</strong></td>
                    <td>
                      <span className="badge" style={{
                        background: m.type === "in" ? "#E3EEE4" : "#F5EEDB",
                        color: m.type === "in" ? "#2D5A3D" : "#B68A3E",
                      }}>
                        {m.type === "in" ? "Entrata" : "Uscita"}
                      </span>
                    </td>
                    <td className="tabular" style={{ textAlign: "right", fontWeight: 600 }}>
                      {m.type === "in" ? "+" : "−"}{m.quantity}
                    </td>
                    <td className="hide-sm muted">{m.notes || "—"}</td>
                    <td className="hide-sm muted">{m.profiles?.full_name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Product Modal ── */}
      {showProd && (
        <div className="modal-overlay" onClick={closeProd}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="section-head" style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
              <h2>{editProd ? "Modifica prodotto" : "Nuovo prodotto"}</h2>
              <button className="btn-ghost" style={{ fontSize: 18, padding: "4px 10px", borderRadius: 8 }} onClick={closeProd}>✕</button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="field">
                <label>Nome</label>
                <input value={pf.name} onChange={e => setPf({ ...pf, name: e.target.value })} placeholder="Es. Sapone mani 500ml" />
              </div>
              <div className="grid2">
                <div className="field">
                  <label>Categoria</label>
                  <select value={pf.category} onChange={e => setPf({ ...pf, category: e.target.value })}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Unità di misura</label>
                  <select value={pf.unit} onChange={e => setPf({ ...pf, unit: e.target.value })}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid2">
                <div className="field">
                  <label>Costo unitario (€)</label>
                  <input type="number" min="0" step="0.01" value={pf.unit_cost}
                    onChange={e => setPf({ ...pf, unit_cost: Number(e.target.value) })} />
                </div>
                <div className="field">
                  <label>Scorta minima</label>
                  <input type="number" min="0" step="1" value={pf.min_stock}
                    onChange={e => setPf({ ...pf, min_stock: Number(e.target.value) })} />
                </div>
              </div>
              {suppliers.length > 0 && (
                <div className="field">
                  <label>Fornitore (opzionale)</label>
                  <select value={pf.supplier_id} onChange={e => setPf({ ...pf, supplier_id: e.target.value })}>
                    <option value="">— Nessuno —</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              <div className="field">
                <label>Note</label>
                <textarea value={pf.notes} onChange={e => setPf({ ...pf, notes: e.target.value })} placeholder="Note opzionali…" />
              </div>
              <button className="btn btn-primary" style={{ width: "100%", padding: "14px 22px", fontSize: 15 }} onClick={saveProd}>
                {editProd ? "Salva modifiche" : "Aggiungi prodotto"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Movement Modal ── */}
      {showMove && (
        <div className="modal-overlay" onClick={closeMove}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="section-head" style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
              <h2>Registra movimento</h2>
              <button className="btn-ghost" style={{ fontSize: 18, padding: "4px 10px", borderRadius: 8 }} onClick={closeMove}>✕</button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="field">
                <label>Prodotto</label>
                <select value={mf.product_id} onChange={e => setMf({ ...mf, product_id: e.target.value })}>
                  <option value="">Seleziona…</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.current_stock} {p.unit})</option>)}
                </select>
              </div>

              {selectedProduct && (
                <div style={{ padding: "12px 16px", borderRadius: 10, background: "var(--surface-2)", fontSize: 14 }}>
                  Giacenza attuale: <strong>{selectedProduct.current_stock} {selectedProduct.unit}</strong>
                  {selectedProduct.min_stock > 0 && <span className="muted"> · Minimo: {selectedProduct.min_stock}</span>}
                </div>
              )}

              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-soft)", display: "block", marginBottom: 8 }}>Tipo</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <button type="button" className={`contract-pill${mf.type === "in" ? " active" : ""}`}
                    style={mf.type === "in" ? { background: "var(--ok)", borderColor: "var(--ok)", color: "#fff" } : {}}
                    onClick={() => setMf({ ...mf, type: "in" })}>
                    📦 Carico
                  </button>
                  <button type="button" className={`contract-pill${mf.type === "out" ? " active" : ""}`}
                    style={mf.type === "out" ? { background: "#B68A3E", borderColor: "#B68A3E", color: "#fff" } : {}}
                    onClick={() => setMf({ ...mf, type: "out" })}>
                    📤 Scarico
                  </button>
                </div>
              </div>

              <div className="field">
                <label>Quantità</label>
                <input type="number" min="1" step="1" value={mf.quantity}
                  onChange={e => setMf({ ...mf, quantity: Number(e.target.value) })}
                  style={{ fontSize: 20, fontWeight: 700, textAlign: "center", padding: "14px 16px" }} />
              </div>

              <div className="field">
                <label>Note</label>
                <input value={mf.notes} onChange={e => setMf({ ...mf, notes: e.target.value })}
                  placeholder="Es. Consegna Metro, rifornimento minibar…" />
              </div>

              {expenses.length > 0 && (
                <div className="field">
                  <label>Collega a spesa (opzionale)</label>
                  <select value={mf.expense_id} onChange={e => setMf({ ...mf, expense_id: e.target.value })}>
                    <option value="">— Nessuna —</option>
                    {expenses.map(ex => (
                      <option key={ex.id} value={ex.id}>
                        {fmtDate(ex.expense_date)} · {ex.supplier_name ?? "—"} · {eur(Number(ex.amount))}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button className="btn btn-primary" style={{ width: "100%", padding: "14px 22px", fontSize: 15 }} onClick={saveMove}>
                {mf.type === "in" ? "Registra carico" : "Registra scarico"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
