"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { eur, fmtDate } from "@/lib/format";
import Link from "next/link";
import CaricoModal from "./CaricoModal";
import NewProductModal, { type SavedProduct } from "@/components/NewProductModal";
import { logClientActivity } from "@/lib/activityLog";
import { useRole } from "@/lib/useRole";
import BarcodeScanner from "@/components/BarcodeScanner";

type Product = {
  product_id: string; name: string; category: string; unit: string;
  unit_cost: number; min_stock: number; supplier_id: string | null;
  notes: string | null; active: boolean; current_stock: number;
  barcode: string | null;
};
type Movement = {
  id: string; product_id: string; type: "in" | "out"; quantity: number;
  notes: string | null; created_by: string | null; created_at: string;
  expiry_date: string | null;
  products?: { name: string } | null;
  profiles?: { full_name: string } | null;
};
type Supplier = { id: string; name: string };

const CAT_COLORS: Record<string, string> = {
  Pulizia: "#5C7363", Colazione: "#C77B4A", Biancheria: "#4F7B8C",
  "Bagno/Toiletries": "#7A6A8C", Manutenzione: "#A8552F", Cancelleria: "#B68A3E",
  Bar: "#9E3B2E", Cucina: "#C77B4A", Minibar: "#7A6A8C",
  Bevande: "#4F7B8C", Alcolici: "#8A7355", "Snack/Distributori": "#B68A3E",
  Altro: "#6C6B5D",
};
const CATEGORIES = Object.keys(CAT_COLORS);
const UNITS = ["pz", "kg", "litri", "rotoli", "conf", "bottiglie", "pacchi"];
const SCARICO_REASONS = ["Uso camere", "Uso cucina", "Uso bar", "Uso pulizie", "Danneggiato", "Scaduto", "Altro"];
const EMPTY_P = { name: "", brand: "", category: "Pulizia", unit: "pz", unit_cost: 0, min_stock: 0, supplier_id: "", notes: "", barcode: "" };

export default function MagazzinoPage() {
  const supabase = createClient();
  const { role, loading: roleLoading } = useRole();
  const isStaff = role === "staff";
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [todayMoves, setTodayMoves] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastInv, setLastInv] = useState<{ completed_at: string; discrepancies_count: number } | null>(null);

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "ok" | "low" | "out" | "expiring" | "expired">("all");
  const [sortBy, setSortBy] = useState<"name" | "stock" | "recent">("name");

  const [showProd, setShowProd] = useState(false);
  const [editProd, setEditProd] = useState<Product | null>(null);
  const [pf, setPf] = useState({ ...EMPTY_P });

  const [showScarico, setShowScarico] = useState(false);
  const [scaricoProd, setScaricoProd] = useState<Product | null>(null);
  const [scaricoQty, setScaricoQty] = useState(1);
  const [scaricoReason, setScaricoReason] = useState(SCARICO_REASONS[0]);
  const [scaricoNotes, setScaricoNotes] = useState("");

  const [showCarico, setShowCarico] = useState(false);
  const [showQuickCarico, setShowQuickCarico] = useState(false);
  const [quickCaricoProd, setQuickCaricoProd] = useState<Product | null>(null);
  const [quickCaricoQty, setQuickCaricoQty] = useState(1);
  const [quickCaricoNotes, setQuickCaricoNotes] = useState("");
  const [quickCaricoExpiry, setQuickCaricoExpiry] = useState("");
  const [showDetail, setShowDetail] = useState(false);
  const [detailProd, setDetailProd] = useState<Product | null>(null);
  const [detailMoves, setDetailMoves] = useState<Movement[]>([]);

  const [scanInput, setScanInput] = useState("");
  const [scanFeedback, setScanFeedback] = useState<{ type: "ok" | "warn" | "idle"; msg: string }>({ type: "idle", msg: "" });
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "warn" | "error" } | null>(null);
  const [newProdBarcode, setNewProdBarcode] = useState<string | null>(null);
  const [showCamScanner, setShowCamScanner] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  function showToast(msg: string, type: "ok" | "warn" | "error" = "ok") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  const lastMoveMap = useMemo(() => {
    const map: Record<string, { date: string; type: string }> = {};
    for (const m of movements) {
      if (!map[m.product_id]) map[m.product_id] = { date: m.created_at, type: m.type };
    }
    return map;
  }, [movements]);

  const nearestExpiryMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of movements) {
      if (m.type === "in" && m.expiry_date) {
        if (!map[m.product_id] || m.expiry_date < map[m.product_id]) {
          map[m.product_id] = m.expiry_date;
        }
      }
    }
    return map;
  }, [movements]);

  async function load() {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: p }, { data: m }, { data: s }, { count }, { data: inv }] = await Promise.all([
      supabase.from("stock_levels").select("*").eq("active", true).order("name"),
      supabase.from("stock_movements").select("*, products(name), profiles(full_name)").order("created_at", { ascending: false }).limit(500),
      supabase.from("suppliers").select("id, name").order("name"),
      supabase.from("stock_movements").select("id", { count: "exact", head: true }).gte("created_at", today + "T00:00:00"),
      supabase.from("inventory_sessions").select("completed_at, discrepancies_count").eq("status", "completato").order("completed_at", { ascending: false }).limit(1),
    ]);
    setProducts((p ?? []) as Product[]);
    setMovements((m ?? []) as Movement[]);
    setSuppliers((s ?? []) as Supplier[]);
    setTodayMoves(count ?? 0);
    setLastInv((inv && inv.length > 0) ? inv[0] as { completed_at: string; discrepancies_count: number } : null);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const warehouseValue = products.reduce((s, p) => s + p.current_stock * p.unit_cost, 0);
  const lowCount = products.filter(p => p.min_stock > 0 && p.current_stock < p.min_stock).length;
  const todayStr = new Date().toISOString().slice(0, 10);
  const in30days = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const expiredCount = products.filter(p => nearestExpiryMap[p.product_id] && nearestExpiryMap[p.product_id] < todayStr).length;
  const expiringCount = products.filter(p => { const e = nearestExpiryMap[p.product_id]; return e && e >= todayStr && e <= in30days; }).length;

  const filtered = useMemo(() => {
    let list = products;
    if (search) { const q = search.toLowerCase(); list = list.filter(p => p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(q))); }
    if (catFilter) list = list.filter(p => p.category === catFilter);
    if (statusFilter === "ok") list = list.filter(p => p.current_stock > 0 && (p.min_stock === 0 || p.current_stock >= p.min_stock));
    if (statusFilter === "low") list = list.filter(p => p.current_stock > 0 && p.min_stock > 0 && p.current_stock < p.min_stock);
    if (statusFilter === "out") list = list.filter(p => p.current_stock <= 0);
    if (statusFilter === "expired") list = list.filter(p => nearestExpiryMap[p.product_id] && nearestExpiryMap[p.product_id] < todayStr);
    if (statusFilter === "expiring") list = list.filter(p => { const e = nearestExpiryMap[p.product_id]; return e && e >= todayStr && e <= in30days; });
    list = [...list].sort((a, b) => {
      if (sortBy === "stock") return a.current_stock - b.current_stock;
      if (sortBy === "recent") return ((lastMoveMap[b.product_id]?.date ?? "") > (lastMoveMap[a.product_id]?.date ?? "") ? 1 : -1);
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [products, search, catFilter, statusFilter, sortBy, lastMoveMap, nearestExpiryMap, todayStr, in30days]);

  const catBg = (cat: string) => (CAT_COLORS[cat] ?? "#6C6B5D") + "1A";
  const catFg = (cat: string) => CAT_COLORS[cat] ?? "#6C6B5D";
  const fmtDT = (s: string) => { const d = new Date(s); return `${d.toLocaleDateString("it-IT")} ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`; };

  function handleScan(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    const found = products.find(p => p.barcode === trimmed);
    if (found) {
      setScanFeedback({ type: "ok", msg: `${found.name} (${found.current_stock} ${found.unit})` });
      openScarico(found);
    } else {
      setNewProdBarcode(trimmed);
    }
    setScanInput("");
    setTimeout(() => setScanFeedback({ type: "idle", msg: "" }), 4000);
  }

  function handleNewProductSaved(saved: SavedProduct) {
    setNewProdBarcode(null);
    const qty = saved.initial_qty || 0;
    showToast(`Prodotto "${saved.name}" creato${qty > 0 ? ` con ${qty} ${saved.unit} in magazzino` : ""}`);
    load();
  }

  // ── Product CRUD ──
  function closeProd() { setShowProd(false); setEditProd(null); setPf({ ...EMPTY_P }); }
  function openNewProd() { setEditProd(null); setPf({ ...EMPTY_P }); setShowProd(true); }
  function openEditProd(p: Product) {
    setEditProd(p);
    setPf({ name: p.name, brand: (p as Product & { brand?: string }).brand ?? "", category: p.category, unit: p.unit, unit_cost: p.unit_cost, min_stock: p.min_stock, supplier_id: p.supplier_id ?? "", notes: p.notes ?? "", barcode: p.barcode ?? "" });
    setShowProd(true);
  }
  async function saveProd() {
    if (!pf.name.trim()) return alert("Inserisci il nome del prodotto.");
    const payload = { name: pf.name.trim(), brand: pf.brand.trim() || null, category: pf.category, unit: pf.unit, unit_cost: pf.unit_cost, min_stock: pf.min_stock, supplier_id: pf.supplier_id || null, notes: pf.notes || null, barcode: pf.barcode.trim() || null, active: true };
    const { error } = editProd ? await supabase.from("products").update(payload).eq("id", editProd.product_id) : await supabase.from("products").insert(payload);
    if (error) return alert("Errore: " + error.message);
    closeProd(); load();
  }
  async function delProd(id: string) { if (!confirm("Eliminare questo prodotto?")) return; const p = products.find(x => x.product_id === id); await supabase.from("products").delete().eq("id", id); logClientActivity("delete", "magazzino", `Prodotto eliminato: ${p?.name ?? "?"}`, { productId: id }); load(); }

  // ── Scarico ──
  function openScarico(p: Product) { setScaricoProd(p); setScaricoQty(1); setScaricoReason(SCARICO_REASONS[0]); setScaricoNotes(""); setShowScarico(true); }
  async function confirmScarico() {
    if (!scaricoProd || scaricoQty <= 0) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("stock_movements").insert({
      product_id: scaricoProd.product_id, type: "out", quantity: scaricoQty,
      notes: [scaricoReason, scaricoNotes].filter(Boolean).join(" — ") || null,
      created_by: user?.id ?? null,
    });
    if (error) return showToast("Errore: " + error.message, "error");
    logClientActivity("update", "magazzino", `Scarico: ${scaricoProd.name} x ${scaricoQty}`, { product: scaricoProd.name, qty: scaricoQty, reason: scaricoReason });
    showToast(`Scarico: ${scaricoProd.name} x ${scaricoQty} — Giacenza: ${scaricoProd.current_stock - scaricoQty}`);
    setShowScarico(false); load();
  }

  // ── Quick Carico ──
  function openQuickCarico(p: Product) { setQuickCaricoProd(p); setQuickCaricoQty(1); setQuickCaricoNotes(""); setQuickCaricoExpiry(""); setShowQuickCarico(true); }
  async function confirmQuickCarico() {
    if (!quickCaricoProd || quickCaricoQty <= 0) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("stock_movements").insert({
      product_id: quickCaricoProd.product_id, type: "in", quantity: quickCaricoQty,
      notes: quickCaricoNotes.trim() || null,
      created_by: user?.id ?? null,
      expiry_date: quickCaricoExpiry || null,
    });
    if (error) return showToast("Errore: " + error.message, "error");
    logClientActivity("update", "magazzino", `Carico: ${quickCaricoProd.name} x ${quickCaricoQty}`, { product: quickCaricoProd.name, qty: quickCaricoQty });
    showToast(`Carico: ${quickCaricoProd.name} x ${quickCaricoQty} — Giacenza: ${quickCaricoProd.current_stock + quickCaricoQty}`);
    setShowQuickCarico(false); load();
  }

  // ── Detail ──
  async function openDetail(p: Product) {
    setDetailProd(p); setShowDetail(true);
    const { data } = await supabase.from("stock_movements").select("*, products(name), profiles(full_name)")
      .eq("product_id", p.product_id).order("created_at", { ascending: false }).limit(30);
    setDetailMoves((data ?? []) as Movement[]);
  }

  // ── Export ──
  function exportCSV() {
    const h = "Prodotto,Barcode,Categoria,Giacenza,Unita,Scorta minima,Costo unitario,Valore\n";
    const r = filtered.map(p => `"${p.name}","${p.barcode ?? ""}","${p.category}",${p.current_stock},"${p.unit}",${p.min_stock},${p.unit_cost},${(p.current_stock * p.unit_cost).toFixed(2)}`).join("\n");
    const blob = new Blob(["\uFEFF" + h + r], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `magazzino-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  // ── Chart helper ──
  function miniChart(moves: Movement[], currentStock: number) {
    if (moves.length === 0) return null;
    const days: number[] = [];
    let stock = currentStock;
    const sorted = [...moves].sort((a, b) => b.created_at.localeCompare(a.created_at));
    days.push(stock);
    for (const m of sorted.slice(0, 13)) {
      stock = m.type === "in" ? stock - m.quantity : stock + m.quantity;
      days.push(Math.max(0, stock));
    }
    days.reverse();
    const max = Math.max(...days, 1);
    return (
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 60 }}>
        {days.map((v, i) => (
          <div key={i} style={{ flex: 1, background: i === days.length - 1 ? "#BFA762" : "#D8CCB8", borderRadius: 3, height: `${(v / max) * 100}%`, minHeight: 2, transition: "height .3s" }} />
        ))}
      </div>
    );
  }

  return (
    <>
      {/* ── Scan Bar ── */}
      <div style={{ background: "#1F3326", padding: "12px 20px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FAF9F5" strokeWidth="2" strokeLinecap="round">
          <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
          <path d="M8 7v10M12 7v10M16 7v10" />
        </svg>
        <input ref={scanRef} value={scanInput} onChange={e => setScanInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleScan(scanInput); } }}
          placeholder="Scansiona barcode per scarico rapido..."
          autoFocus
          style={{ flex: "1 1 200px", background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.18)", borderRadius: 8, padding: "10px 14px", color: "#FAF9F5", fontSize: 15, fontFamily: "inherit" }} />
        <button className="cam-scan-btn" onClick={() => setShowCamScanner(true)} title="Scansiona con fotocamera">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FAF9F5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" />
          </svg>
        </button>
        {scanFeedback.type !== "idle" && (
          <div style={{ color: scanFeedback.type === "ok" ? "#A3D9A5" : "#F5C882", fontWeight: 600, fontSize: 14 }}>{scanFeedback.msg}</div>
        )}
      </div>

      {/* Camera barcode scanner */}
      {showCamScanner && (
        <BarcodeScanner onScan={(code) => handleScan(code)} onClose={() => setShowCamScanner(false)} />
      )}

      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 16 }}>
        <h1 className="serif" style={{ fontSize: 24, fontWeight: 500 }}>Magazzino</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-primary" style={{ padding: "12px 24px", fontSize: 15, fontWeight: 700 }} onClick={() => setShowCarico(true)}>Carico merce</button>
          <button className="btn btn-ghost" onClick={() => { setScaricoProd(null); setShowScarico(true); }}>Scarico rapido</button>
          <button className="btn btn-ghost" onClick={openNewProd}>+ Prodotto</button>
          {!isStaff && <button className="btn btn-ghost" onClick={exportCSV}>Esporta CSV</button>}
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className={`cards ${isStaff ? "cards-3" : "cards-4"}`}>
        <div className="card">
          <div className="label">Prodotti attivi</div>
          <div className="value tabular">{products.length}</div>
        </div>
        {!isStaff && (
          <div className="card accent">
            <div className="label">Valore stock</div>
            <div className="value tabular">{eur(warehouseValue)}</div>
          </div>
        )}
        <div className="card" style={{ cursor: lowCount > 0 ? "pointer" : undefined, borderLeft: lowCount > 0 ? "3px solid #9E3B2E" : undefined }}
          onClick={() => lowCount > 0 && setStatusFilter("low")}>
          <div className="label">Sotto scorta</div>
          <div className="value tabular" style={{ color: lowCount > 0 ? "#9E3B2E" : undefined }}>{lowCount}</div>
          {lowCount > 0 && <div className="meta" style={{ color: "#9E3B2E", fontWeight: 700 }}>Riordino necessario</div>}
        </div>
        <div className="card">
          <div className="label">Movimenti oggi</div>
          <div className="value tabular">{todayMoves}</div>
        </div>
      </div>

      {/* ── Last Inventory Banner ── */}
      {lastInv && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", background: "var(--surface-2)", borderRadius: 10, marginBottom: 20, fontSize: 14 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
          <span>Ultimo inventario: <strong>{fmtDate(lastInv.completed_at)}</strong> — {lastInv.discrepancies_count} differenze</span>
          <Link href="/inventario" style={{ marginLeft: "auto", color: "var(--accent)", fontWeight: 600, textDecoration: "none", fontSize: 13 }}>Vedi report</Link>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="section" style={{ marginBottom: 0 }}>
        <div className="section-body filters" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input placeholder="Cerca prodotto o barcode..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: "1 1 200px", minWidth: 160 }} />
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ minWidth: 150 }}>
            <option value="">Tutte le categorie</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="view-toggle">
            {(["all", "ok", "low", "out", "expiring", "expired"] as const).map(v => (
              <button key={v} className={statusFilter === v ? "active" : ""} onClick={() => setStatusFilter(v)}>
                {{ all: "Tutti", ok: "OK", low: "Sotto scorta", out: "Esauriti", expiring: `In scadenza${expiringCount ? ` (${expiringCount})` : ""}`, expired: `Scaduti${expiredCount ? ` (${expiredCount})` : ""}` }[v]}
              </button>
            ))}
          </div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} style={{ minWidth: 130 }}>
            <option value="name">Ordina: Nome</option>
            <option value="stock">Ordina: Giacenza</option>
            <option value="recent">Ordina: Recente</option>
          </select>
        </div>
      </div>

      {/* ── Stock Table ── */}
      <div className="section">
        <div className="section-head"><h2>Stock attuale ({filtered.length})</h2></div>
        <div className="section-body" style={{ padding: 0, overflowX: "auto" }}>
          {(loading || roleLoading) ? <div className="empty">Caricamento...</div> : filtered.length === 0 ? (
            <div className="empty">
              <div className="serif" style={{ fontSize: 18, marginBottom: 6 }}>Nessun prodotto</div>
              <div>{products.length > 0 ? "Nessun risultato per i filtri selezionati." : "Aggiungi il primo prodotto."}</div>
            </div>
          ) : (
            <table className="tbl" style={{ minWidth: 800 }}>
              <thead><tr>
                <th>Prodotto</th>
                <th className="hide-sm">Barcode</th>
                <th style={{ textAlign: "center" }}>Giacenza</th>
                <th style={{ textAlign: "center" }}>Min.</th>
                <th style={{ textAlign: "center" }}>Stato</th>
                <th className="hide-sm" style={{ textAlign: "center" }}>Scadenza</th>
                <th className="hide-sm">Ultimo mov.</th>
                {!isStaff && <th style={{ textAlign: "right" }}>Valore</th>}
                <th></th>
              </tr></thead>
              <tbody>
                {filtered.map(p => {
                  const isLow = p.min_stock > 0 && p.current_stock < p.min_stock && p.current_stock > 0;
                  const isOut = p.current_stock <= 0;
                  const lm = lastMoveMap[p.product_id];
                  return (
                    <tr key={p.product_id}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                        <span className="badge" style={{ background: catBg(p.category), color: catFg(p.category), marginTop: 4 }}>{p.category}</span>
                      </td>
                      <td className="hide-sm muted" style={{ fontSize: 12, fontFamily: "'Courier New', monospace", letterSpacing: 1 }}>{p.barcode || "—"}</td>
                      <td style={{ textAlign: "center" }}>
                        <span style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 600, color: isOut ? "var(--danger)" : isLow ? "#B68A3E" : "var(--ink)" }}>{p.current_stock}</span>
                        <span className="muted" style={{ fontSize: 12, marginLeft: 4 }}>{p.unit}</span>
                      </td>
                      <td className="tabular muted" style={{ textAlign: "center" }}>{p.min_stock || "—"}</td>
                      <td style={{ textAlign: "center" }}>
                        {isOut ? <span className="badge" style={{ background: "#1F3326", color: "#FAF9F5" }}>Esaurito</span>
                          : isLow ? <span className="badge" style={{ background: "rgba(182,138,62,.12)", color: "#B68A3E" }}>Basso</span>
                          : <span className="badge" style={{ background: "#E3EEE4", color: "#2D5A3D" }}>OK</span>}
                      </td>
                      <td className="hide-sm" style={{ textAlign: "center", fontSize: 12 }}>
                        {(() => {
                          const exp = nearestExpiryMap[p.product_id];
                          if (!exp) return <span className="muted">—</span>;
                          const isExpired = exp < todayStr;
                          const isExpiring = !isExpired && exp <= in30days;
                          return (
                            <div>
                              <div style={{ whiteSpace: "nowrap" }}>{fmtDate(exp)}</div>
                              {isExpired && <span className="badge" style={{ background: "#9E3B2E", color: "#FAF9F5", fontSize: 10, marginTop: 2 }}>Scaduto</span>}
                              {isExpiring && <span className="badge" style={{ background: "rgba(199,123,74,.12)", color: "#C77B4A", fontSize: 10, marginTop: 2 }}>In scadenza</span>}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="hide-sm muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                        {lm ? <>{fmtDT(lm.date)} <span className="badge" style={{ background: lm.type === "in" ? "#E3EEE4" : "#F5EEDB", color: lm.type === "in" ? "#2D5A3D" : "#B68A3E", fontSize: 10 }}>{lm.type === "in" ? "Entrata" : "Uscita"}</span></> : "—"}
                      </td>
                      {!isStaff && <td className="tabular" style={{ textAlign: "right", fontWeight: 600 }}>{eur(p.current_stock * p.unit_cost)}</td>}
                      <td>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                          <button className="btn-ghost" style={{ padding: "5px 8px", borderRadius: 8, fontSize: 12, color: "var(--ok)" }} onClick={() => openQuickCarico(p)} title="Carico rapido">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
                          </button>
                          <button className="btn-ghost" style={{ padding: "5px 8px", borderRadius: 8, fontSize: 12, color: "#B68A3E" }} onClick={() => openScarico(p)} title="Scarico rapido">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14" /></svg>
                          </button>
                          <button className="btn-ghost" style={{ padding: "5px 8px", borderRadius: 8, fontSize: 12 }} onClick={() => openDetail(p)}>Dettaglio</button>
                        </div>
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
          <div className="section-head"><h2>Ultimi movimenti</h2><span className="muted">20 piu recenti</span></div>
          <div className="section-body" style={{ padding: 0, overflowX: "auto" }}>
            <table className="tbl"><thead><tr>
              <th>Data</th><th>Prodotto</th><th>Tipo</th><th style={{ textAlign: "right" }}>Qtà</th><th className="hide-sm">Note</th><th className="hide-sm">Chi</th>
            </tr></thead><tbody>
              {movements.slice(0, 20).map(m => (
                <tr key={m.id}>
                  <td style={{ whiteSpace: "nowrap", fontSize: 13 }}>{fmtDT(m.created_at)}</td>
                  <td><strong>{m.products?.name ?? "?"}</strong></td>
                  <td><span className="badge" style={{ background: m.type === "in" ? "#E3EEE4" : "#F5EEDB", color: m.type === "in" ? "#2D5A3D" : "#B68A3E" }}>{m.type === "in" ? "Entrata" : "Uscita"}</span></td>
                  <td className="tabular" style={{ textAlign: "right", fontWeight: 600 }}>{m.type === "in" ? "+" : "−"}{m.quantity}</td>
                  <td className="hide-sm muted">{m.notes || "—"}</td>
                  <td className="hide-sm muted">{m.profiles?.full_name ?? "—"}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </div>
      )}

      {/* ── Carico Modal ── */}
      {showCarico && <CaricoModal products={products} suppliers={suppliers} supabase={supabase} onClose={() => setShowCarico(false)} onDone={load} showToast={showToast} />}

      {/* ── Scarico Modal ── */}
      {showScarico && (
        <div className="modal-overlay" onClick={() => setShowScarico(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="section-head" style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
              <h2>Scarico rapido</h2>
              <button className="btn-ghost" style={{ padding: "4px 10px", borderRadius: 8 }} onClick={() => setShowScarico(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              {!scaricoProd ? (
                <div className="field">
                  <label>Prodotto</label>
                  <select value="" onChange={e => { const p = products.find(x => x.product_id === e.target.value); if (p) setScaricoProd(p); }}>
                    <option value="">Seleziona...</option>
                    {products.map(p => <option key={p.product_id} value={p.product_id}>{p.name} ({p.current_stock} {p.unit})</option>)}
                  </select>
                </div>
              ) : (
                <>
                  <div style={{ padding: "14px 16px", borderRadius: 10, background: "var(--surface-2)" }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{scaricoProd.name}</div>
                    <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 4 }}>Giacenza: <strong>{scaricoProd.current_stock} {scaricoProd.unit}</strong></div>
                    {nearestExpiryMap[scaricoProd.product_id] && (
                      <div style={{ fontSize: 12, marginTop: 4, color: nearestExpiryMap[scaricoProd.product_id] < todayStr ? "#9E3B2E" : "#C77B4A", fontWeight: 600 }}>
                        Lotto con scadenza piu vicina: {fmtDate(nearestExpiryMap[scaricoProd.product_id])}
                        {nearestExpiryMap[scaricoProd.product_id] < todayStr ? " (scaduto)" : ""}
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-soft)", display: "block", marginBottom: 8 }}>Quantita</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
                      <button className="btn btn-ghost" style={{ width: 44, height: 44, fontSize: 20, padding: 0 }} onClick={() => setScaricoQty(Math.max(1, scaricoQty - 1))}>−</button>
                      <input type="number" min="1" value={scaricoQty} onChange={e => setScaricoQty(Math.max(1, Number(e.target.value)))}
                        style={{ width: 80, textAlign: "center", fontSize: 24, fontWeight: 700, padding: "10px 8px", border: "1px solid var(--line)", borderRadius: 10, fontFamily: "inherit" }} />
                      <button className="btn btn-ghost" style={{ width: 44, height: 44, fontSize: 20, padding: 0 }} onClick={() => setScaricoQty(scaricoQty + 1)}>+</button>
                    </div>
                  </div>
                  <div className="field">
                    <label>Motivo</label>
                    <select value={scaricoReason} onChange={e => setScaricoReason(e.target.value)}>
                      {SCARICO_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Note (opzionale)</label>
                    <input value={scaricoNotes} onChange={e => setScaricoNotes(e.target.value)} placeholder="Note aggiuntive..." />
                  </div>
                  <button className="btn btn-primary" style={{ width: "100%", padding: "14px 22px", fontSize: 15 }} onClick={confirmScarico}>
                    Scarica {scaricoQty} {scaricoProd.unit}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Quick Carico Modal ── */}
      {showQuickCarico && quickCaricoProd && (
        <div className="modal-overlay" onClick={() => setShowQuickCarico(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="section-head" style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
              <h2>Carico rapido</h2>
              <button className="btn-ghost" style={{ padding: "4px 10px", borderRadius: 8 }} onClick={() => setShowQuickCarico(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ padding: "14px 16px", borderRadius: 10, background: "#E3EEE4", border: "1px solid rgba(45,90,61,.2)" }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#2D5A3D" }}>{quickCaricoProd.name}</div>
                <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 4 }}>Giacenza attuale: <strong>{quickCaricoProd.current_stock} {quickCaricoProd.unit}</strong></div>
              </div>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-soft)", display: "block", marginBottom: 8 }}>Quantita da caricare</label>
                <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
                  <button className="btn btn-ghost" style={{ width: 44, height: 44, fontSize: 20, padding: 0 }} onClick={() => setQuickCaricoQty(Math.max(1, quickCaricoQty - 1))}>−</button>
                  <input type="number" min="1" value={quickCaricoQty} onChange={e => setQuickCaricoQty(Math.max(1, Number(e.target.value)))}
                    style={{ width: 80, textAlign: "center", fontSize: 24, fontWeight: 700, padding: "10px 8px", border: "1px solid var(--line)", borderRadius: 10, fontFamily: "inherit" }} />
                  <button className="btn btn-ghost" style={{ width: 44, height: 44, fontSize: 20, padding: 0 }} onClick={() => setQuickCaricoQty(quickCaricoQty + 1)}>+</button>
                </div>
              </div>
              <div className="field">
                <label>Scadenza (opzionale)</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input type="date" value={quickCaricoExpiry} onChange={e => setQuickCaricoExpiry(e.target.value)} style={{ flex: "1 1 140px" }} />
                  {[{ label: "+6m", months: 6 }, { label: "+1a", months: 12 }, { label: "+2a", months: 24 }].map(b => (
                    <button key={b.label} type="button" className="btn btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }}
                      onClick={() => { const d = new Date(); d.setMonth(d.getMonth() + b.months); setQuickCaricoExpiry(d.toISOString().slice(0, 10)); }}>
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>Note (opzionale)</label>
                <input value={quickCaricoNotes} onChange={e => setQuickCaricoNotes(e.target.value)} placeholder="Note aggiuntive..." />
              </div>
              <button className="btn btn-primary" style={{ width: "100%", padding: "14px 22px", fontSize: 15 }} onClick={confirmQuickCarico}>
                Carica {quickCaricoQty} {quickCaricoProd.unit}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Product Form Modal ── */}
      {showProd && (
        <div className="modal-overlay" onClick={closeProd}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="section-head" style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
              <h2>{editProd ? "Modifica prodotto" : "Nuovo prodotto"}</h2>
              <button className="btn-ghost" style={{ padding: "4px 10px", borderRadius: 8 }} onClick={closeProd}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="field"><label>Nome</label><input value={pf.name} onChange={e => setPf({ ...pf, name: e.target.value })} placeholder="Es. Sapone mani 500ml" /></div>
              <div className="grid2">
                <div className="field"><label>Marca</label><input value={pf.brand} onChange={e => setPf({ ...pf, brand: e.target.value })} placeholder="Es. Mulino Bianco" /></div>
                <div className="field"><label>Barcode</label><input value={pf.barcode} onChange={e => setPf({ ...pf, barcode: e.target.value })} placeholder="Scansiona o digita" style={{ fontFamily: "'Courier New', monospace", letterSpacing: 1 }} /></div>
              </div>
              <div className="grid2">
                <div className="field"><label>Categoria</label><select value={pf.category} onChange={e => setPf({ ...pf, category: e.target.value })}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                <div className="field"><label>Unita</label><select value={pf.unit} onChange={e => setPf({ ...pf, unit: e.target.value })}>{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
              </div>
              <div className={isStaff ? "" : "grid2"}>
                {!isStaff && <div className="field"><label>Costo unitario</label><input type="number" min="0" step="0.01" value={pf.unit_cost} onChange={e => setPf({ ...pf, unit_cost: Number(e.target.value) })} /></div>}
                <div className="field"><label>Scorta minima</label><input type="number" min="0" step="1" value={pf.min_stock} onChange={e => setPf({ ...pf, min_stock: Number(e.target.value) })} /></div>
              </div>
              {suppliers.length > 0 && <div className="field"><label>Fornitore</label><select value={pf.supplier_id} onChange={e => setPf({ ...pf, supplier_id: e.target.value })}><option value="">— Nessuno —</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
              <div className="field"><label>Note</label><textarea value={pf.notes} onChange={e => setPf({ ...pf, notes: e.target.value })} placeholder="Note opzionali..." /></div>
              <button className="btn btn-primary" style={{ width: "100%", padding: "14px 22px", fontSize: 15 }} onClick={saveProd}>{editProd ? "Salva modifiche" : "Aggiungi prodotto"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Modal ── */}
      {showDetail && detailProd && (
        <div className="modal-overlay" onClick={() => setShowDetail(false)}>
          <div className="modal-card" style={{ maxWidth: 650, maxHeight: "90vh" }} onClick={e => e.stopPropagation()}>
            <div className="section-head" style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
              <h2>{detailProd.name}</h2>
              <button className="btn-ghost" style={{ padding: "4px 10px", borderRadius: 8 }} onClick={() => setShowDetail(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18, overflowY: "auto" }}>
              {/* Info */}
              <div style={{ display: "grid", gridTemplateColumns: isStaff ? "1fr 1fr" : "1fr 1fr 1fr", gap: 12 }}>
                <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-soft)", fontWeight: 600 }}>Giacenza</div>
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, marginTop: 4 }}>{detailProd.current_stock}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{detailProd.unit}</div>
                </div>
                {!isStaff && (
                  <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-soft)", fontWeight: 600 }}>Valore</div>
                    <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600, marginTop: 4 }}>{eur(detailProd.current_stock * detailProd.unit_cost)}</div>
                  </div>
                )}
                <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-soft)", fontWeight: 600 }}>Scorta min</div>
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, marginTop: 4 }}>{detailProd.min_stock}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className="badge" style={{ background: catBg(detailProd.category), color: catFg(detailProd.category) }}>{detailProd.category}</span>
                {detailProd.barcode && <span className="badge" style={{ fontFamily: "'Courier New', monospace", letterSpacing: 1 }}>{detailProd.barcode}</span>}
                {!isStaff && <span className="badge">{eur(detailProd.unit_cost)}/{detailProd.unit}</span>}
              </div>

              {/* Chart */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 8 }}>Andamento giacenza</div>
                {miniChart(detailMoves, detailProd.current_stock) || <div className="muted" style={{ textAlign: "center", padding: 12 }}>Nessun movimento</div>}
              </div>

              {/* Movement history */}
              {detailMoves.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 8 }}>Storico movimenti</div>
                  <div style={{ maxHeight: 250, overflowY: "auto", borderRadius: 10, border: "1px solid var(--line)" }}>
                    <table className="tbl" style={{ margin: 0 }}><tbody>
                      {detailMoves.map(m => (
                        <tr key={m.id}>
                          <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{fmtDT(m.created_at)}</td>
                          <td><span className="badge" style={{ background: m.type === "in" ? "#E3EEE4" : "#F5EEDB", color: m.type === "in" ? "#2D5A3D" : "#B68A3E", fontSize: 10 }}>{m.type === "in" ? "Entrata" : "Uscita"}</span></td>
                          <td className="tabular" style={{ fontWeight: 600 }}>{m.type === "in" ? "+" : "−"}{m.quantity}</td>
                          <td className="muted" style={{ fontSize: 12 }}>{m.notes || "—"}</td>
                        </tr>
                      ))}
                    </tbody></table>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setShowDetail(false); openEditProd(detailProd); }}>Modifica</button>
                <button className="btn btn-ghost" style={{ flex: 1, color: "var(--danger)" }} onClick={() => { setShowDetail(false); delProd(detailProd.product_id); }}>Elimina</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── New Product Modal (from scan) ── */}
      {newProdBarcode && (
        <NewProductModal
          barcode={newProdBarcode}
          supabase={supabase}
          onSave={handleNewProductSaved}
          onClose={() => setNewProdBarcode(null)}
        />
      )}

      {/* ── Toast ── */}
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
