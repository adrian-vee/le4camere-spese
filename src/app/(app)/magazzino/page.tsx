"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { eur, fmtDate } from "@/lib/format";
import Link from "next/link";
import CaricoModal from "./CaricoModal";
import NewProductModal, { type SavedProduct } from "@/components/NewProductModal";
import DatePickerIT from "@/components/ui/DatePickerIT";
import { logClientActivity } from "@/lib/activityLog";
import { useRole } from "@/lib/useRole";
import BarcodeScanner from "@/components/BarcodeScanner";
import BottleIndicator from "@/components/BottleIndicator";

type Product = {
  product_id: string; name: string; category: string; unit: string;
  unit_cost: number; min_stock: number; supplier_id: string | null;
  notes: string | null; active: boolean; current_stock: number;
  barcode: string | null;
  tracking_type: "units" | "bottle"; bottle_capacity_ml: number | null; standard_pour_ml: number | null;
};
type Movement = {
  id: string; product_id: string; type: "in" | "out"; quantity: number;
  notes: string | null; created_by: string | null; created_at: string;
  expiry_date: string | null;
  products?: { name: string } | null;
  profiles?: { full_name: string } | null;
};
type Supplier = { id: string; name: string };
type Batch = {
  id: string; product_id: string; quantity_initial: number; quantity_remaining: number;
  expiry_date: string | null; source: string; source_delivery_id: string | null;
  notes: string | null; created_at: string;
  fill_level: number | null; is_open: boolean | null;
};

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
const EMPTY_P = { name: "", brand: "", category: "Pulizia", unit: "pz", unit_cost: 0, min_stock: 0, supplier_id: "", notes: "", barcode: "", initial_qty: 0, expiry_date: "", tracking_type: "units" as "units" | "bottle", bottle_capacity_ml: 700, standard_pour_ml: 30 };

export default function MagazzinoPage() {
  const supabase = createClient();
  const { role, loading: roleLoading } = useRole();
  const isStaff = role === "staff";

  // ── Data state ──
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastInv, setLastInv] = useState<{ completed_at: string; discrepancies_count: number } | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);

  // ── Filter & view state ──
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "ok" | "low" | "out" | "expiring" | "expired">("all");
  const [sortBy, setSortBy] = useState<"name" | "stock" | "expiry" | "value" | "recent">("name");
  const [viewMode, setViewMode] = useState<"card" | "table">("card");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(12);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [movesOpen, setMovesOpen] = useState(false);

  // ── Modal state ──
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
  const [detailBatches, setDetailBatches] = useState<Batch[]>([]);
  const [scanInput, setScanInput] = useState("");
  const [scanFeedback, setScanFeedback] = useState<{ type: "ok" | "warn" | "idle"; msg: string }>({ type: "idle", msg: "" });
  const [scanActionProd, setScanActionProd] = useState<Product | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "warn" | "error" } | null>(null);
  const [newProdBarcode, setNewProdBarcode] = useState<string | null>(null);
  const [showShoppingPanel, setShowShoppingPanel] = useState(false);
  const [showCamScanner, setShowCamScanner] = useState(false);
  const [openingBottleId, setOpeningBottleId] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  // ── Init ──
  useEffect(() => {
    const saved = localStorage.getItem("mag_view") as "card" | "table" | null;
    if (saved) setViewMode(saved);
    const check = () => setPerPage(window.innerWidth < 768 ? 6 : 12);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => { localStorage.setItem("mag_view", viewMode); }, [viewMode]);
  useEffect(() => { setPage(1); }, [search, catFilter, statusFilter, sortBy]);

  function showToast(msg: string, type: "ok" | "warn" | "error" = "ok") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Computed maps ──
  const lastMoveMap = useMemo(() => {
    const map: Record<string, { date: string; type: string }> = {};
    for (const m of movements) {
      if (!map[m.product_id]) map[m.product_id] = { date: m.created_at, type: m.type };
    }
    return map;
  }, [movements]);

  const nearestExpiryMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const b of batches) {
      if (b.quantity_remaining > 0 && b.expiry_date) {
        if (!map[b.product_id] || b.expiry_date < map[b.product_id]) {
          map[b.product_id] = b.expiry_date;
        }
      }
    }
    return map;
  }, [batches]);

  const batchesByProduct = useMemo(() => {
    const map: Record<string, Batch[]> = {};
    for (const b of batches) {
      if (b.quantity_remaining > 0) {
        (map[b.product_id] ??= []).push(b);
      }
    }
    for (const pid of Object.keys(map)) {
      map[pid].sort((a, b) => {
        if (!a.expiry_date && !b.expiry_date) return 0;
        if (!a.expiry_date) return 1;
        if (!b.expiry_date) return -1;
        return a.expiry_date.localeCompare(b.expiry_date);
      });
    }
    return map;
  }, [batches]);

  // ── Load ──
  const load = useCallback(async () => {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: p }, { data: m }, { data: s }, { data: inv }, { data: bt }] = await Promise.all([
      supabase.from("stock_levels").select("*").eq("active", true).order("name"),
      supabase.from("stock_movements").select("*, products(name), profiles(full_name)").order("created_at", { ascending: false }).limit(500),
      supabase.from("suppliers").select("id, name").order("name"),
      supabase.from("inventory_sessions").select("completed_at, discrepancies_count").eq("status", "completato").order("completed_at", { ascending: false }).limit(1),
      supabase.from("product_batches").select("*").gt("quantity_remaining", 0).order("expiry_date", { ascending: true, nullsFirst: false }),
    ]);
    setProducts((p ?? []) as Product[]);
    setMovements((m ?? []) as Movement[]);
    setSuppliers((s ?? []) as Supplier[]);
    setLastInv((inv && inv.length > 0) ? inv[0] as { completed_at: string; discrepancies_count: number } : null);
    setBatches((bt ?? []) as Batch[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── KPI values ──
  const warehouseValue = products.reduce((s, p) => s + p.current_stock * p.unit_cost, 0);
  const lowCount = products.filter(p => p.min_stock > 0 && p.current_stock < p.min_stock).length;
  const todayStr = new Date().toISOString().slice(0, 10);
  const in30days = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const expiredCount = products.filter(p => nearestExpiryMap[p.product_id] && nearestExpiryMap[p.product_id] < todayStr).length;
  const expiringCount = products.filter(p => { const e = nearestExpiryMap[p.product_id]; return e && e >= todayStr && e <= in30days; }).length;

  // ── Filtered + sorted list ──
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
      if (sortBy === "expiry") return (nearestExpiryMap[a.product_id] ?? "9999").localeCompare(nearestExpiryMap[b.product_id] ?? "9999");
      if (sortBy === "value") return (b.current_stock * b.unit_cost) - (a.current_stock * a.unit_cost);
      if (sortBy === "recent") return ((lastMoveMap[b.product_id]?.date ?? "") > (lastMoveMap[a.product_id]?.date ?? "") ? 1 : -1);
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [products, search, catFilter, statusFilter, sortBy, lastMoveMap, nearestExpiryMap, todayStr, in30days]);

  // ── Category counts (exclude catFilter from computation) ──
  const catCounts = useMemo(() => {
    let list = products;
    if (search) { const q = search.toLowerCase(); list = list.filter(p => p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(q))); }
    if (statusFilter === "ok") list = list.filter(p => p.current_stock > 0 && (p.min_stock === 0 || p.current_stock >= p.min_stock));
    if (statusFilter === "low") list = list.filter(p => p.current_stock > 0 && p.min_stock > 0 && p.current_stock < p.min_stock);
    if (statusFilter === "out") list = list.filter(p => p.current_stock <= 0);
    if (statusFilter === "expired") list = list.filter(p => nearestExpiryMap[p.product_id] && nearestExpiryMap[p.product_id] < todayStr);
    if (statusFilter === "expiring") list = list.filter(p => { const e = nearestExpiryMap[p.product_id]; return e && e >= todayStr && e <= in30days; });
    const counts: Record<string, number> = {};
    let total = 0;
    for (const p of list) { counts[p.category] = (counts[p.category] ?? 0) + 1; total++; }
    return { counts, total };
  }, [products, search, statusFilter, nearestExpiryMap, todayStr, in30days]);

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  // ── Critical products for alert banner ──
  const criticalProducts = useMemo(() => {
    const items: (Product & { reason: "low" | "expiring" | "expired" })[] = [];
    for (const p of products) {
      if (p.min_stock > 0 && p.current_stock < p.min_stock) items.push({ ...p, reason: "low" });
      const exp = nearestExpiryMap[p.product_id];
      if (exp && exp < todayStr) items.push({ ...p, reason: "expired" });
      else if (exp && exp >= todayStr && exp <= in30days) items.push({ ...p, reason: "expiring" });
    }
    return items;
  }, [products, nearestExpiryMap, todayStr, in30days]);

  // ── Helpers ──
  const catBg = (cat: string) => (CAT_COLORS[cat] ?? "#6C6B5D") + "1A";
  const catFg = (cat: string) => CAT_COLORS[cat] ?? "#6C6B5D";
  const fmtDT = (s: string) => { const d = new Date(s); return `${d.toLocaleDateString("it-IT")} ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`; };

  function statusBadge(p: Product) {
    const isOut = p.current_stock <= 0;
    const isLow = p.min_stock > 0 && p.current_stock < p.min_stock && p.current_stock > 0;
    const exp = nearestExpiryMap[p.product_id];
    const isExpired = exp && exp < todayStr;
    if (isExpired) return <span className="mag-badge mag-badge-expired">Scaduto</span>;
    if (isOut) return <span className="mag-badge mag-badge-out">Esaurito</span>;
    if (isLow) return <span className="mag-badge mag-badge-low">Basso</span>;
    return <span className="mag-badge mag-badge-ok">OK</span>;
  }

  function expiryInfo(p: Product) {
    const exp = nearestExpiryMap[p.product_id];
    if (!exp) return null;
    const daysLeft = Math.round((new Date(exp).getTime() - new Date(todayStr).getTime()) / 86400000);
    return { date: exp, daysLeft, isExpired: daysLeft < 0, isExpiring7: daysLeft >= 0 && daysLeft <= 7, isExpiring30: daysLeft > 7 && daysLeft <= 30 };
  }

  function bottleStockInfo(p: Product) {
    if (p.tracking_type !== "bottle") return null;
    const pBatches = batchesByProduct[p.product_id] ?? [];
    const cap = p.bottle_capacity_ml ?? 700;
    const pour = p.standard_pour_ml ?? 30;
    let closedCount = 0;
    const openBottles: { id: string; fill_level: number }[] = [];
    for (const b of pBatches) {
      if (b.is_open) {
        if ((b.fill_level ?? 0) > 0) openBottles.push({ id: b.id, fill_level: b.fill_level ?? 0 });
      } else {
        closedCount += b.quantity_remaining;
      }
    }
    const totalMl = (closedCount * cap) + openBottles.reduce((s, ob) => s + (ob.fill_level * cap / 10), 0);
    const doses = pour > 0 ? Math.floor(totalMl / pour) : 0;
    return { closedCount, openBottles, totalMl, doses, cap, pour };
  }

  async function openBottle(p: Product) {
    const pBatches = batchesByProduct[p.product_id] ?? [];
    const closedBatch = pBatches.find(b => !b.is_open && b.quantity_remaining > 0);
    if (!closedBatch) return showToast("Nessuna bottiglia chiusa da aprire", "warn");
    setOpeningBottleId(p.product_id);
    try {
      const cap = p.bottle_capacity_ml ?? 700;
      if (closedBatch.quantity_remaining === 1) {
        await supabase.from("product_batches").update({ is_open: true, fill_level: 10 }).eq("id", closedBatch.id);
      } else {
        await supabase.from("product_batches").update({ quantity_remaining: closedBatch.quantity_remaining - 1 }).eq("id", closedBatch.id);
        await supabase.from("product_batches").insert({
          product_id: p.product_id, quantity_initial: 1, quantity_remaining: 1,
          expiry_date: closedBatch.expiry_date, source: "manual",
          notes: "Bottiglia aperta", is_open: true, fill_level: 10,
        });
      }
      showToast(`\u{1F37E} Bottiglia aperta — ${p.name}`);
      await load();
    } finally {
      setOpeningBottleId(null);
    }
  }

  // ── Scan ──
  function handleScan(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    const found = products.find(p => p.barcode === trimmed);
    if (found) {
      setScanFeedback({ type: "ok", msg: `${found.name} (${found.current_stock} ${found.unit})` });
      setScanActionProd(found);
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
    setPf({ name: p.name, brand: (p as Product & { brand?: string }).brand ?? "", category: p.category, unit: p.unit, unit_cost: p.unit_cost, min_stock: p.min_stock, supplier_id: p.supplier_id ?? "", notes: p.notes ?? "", barcode: p.barcode ?? "", initial_qty: 0, expiry_date: "", tracking_type: p.tracking_type ?? "units", bottle_capacity_ml: p.bottle_capacity_ml ?? 700, standard_pour_ml: p.standard_pour_ml ?? 30 });
    setShowProd(true);
  }
  async function saveProd() {
    if (!pf.name.trim()) return alert("Inserisci il nome del prodotto.");
    const isBottle = pf.tracking_type === "bottle";
    const payload = {
      name: pf.name.trim(), brand: pf.brand.trim() || null, category: pf.category, unit: pf.unit, unit_cost: pf.unit_cost, min_stock: pf.min_stock, supplier_id: pf.supplier_id || null, notes: pf.notes || null, barcode: pf.barcode.trim() || null, active: true, expiry_date: pf.expiry_date || null,
      tracking_type: pf.tracking_type,
      bottle_capacity_ml: isBottle ? pf.bottle_capacity_ml : null,
      standard_pour_ml: isBottle ? pf.standard_pour_ml : null,
    };
    if (editProd) {
      const { error } = await supabase.from("products").update(payload).eq("id", editProd.product_id);
      if (error) return alert("Errore: " + error.message);
    } else {
      const { data: newProd, error } = await supabase.from("products").insert(payload).select("id").single();
      if (error) return alert("Errore: " + error.message);
      if (pf.initial_qty > 0 && newProd) {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("stock_movements").insert({
          product_id: newProd.id, type: "in", quantity: pf.initial_qty,
          notes: "Carico iniziale", created_by: user?.id ?? null,
          expiry_date: pf.expiry_date || null,
        });
        await supabase.from("product_batches").insert({
          product_id: newProd.id, quantity_initial: pf.initial_qty,
          quantity_remaining: pf.initial_qty, expiry_date: pf.expiry_date || null,
          source: "manual", notes: "Carico iniziale",
          is_open: false, fill_level: null,
        });
      }
    }
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
    const usedBatches: string[] = [];
    const prodBatches = batchesByProduct[scaricoProd.product_id] ?? [];
    let remaining = scaricoQty;
    for (const b of prodBatches) {
      if (remaining <= 0) break;
      const deduct = Math.min(remaining, b.quantity_remaining);
      await supabase.from("product_batches").update({ quantity_remaining: b.quantity_remaining - deduct }).eq("id", b.id);
      remaining -= deduct;
      if (b.expiry_date) usedBatches.push(`Lotto scad. ${fmtDate(b.expiry_date)}: -${deduct}`);
      else usedBatches.push(`Lotto s/scadenza: -${deduct}`);
    }
    logClientActivity("update", "magazzino", `Scarico: ${scaricoProd.name} x ${scaricoQty}`, { product: scaricoProd.name, qty: scaricoQty, reason: scaricoReason });
    const batchInfo = usedBatches.length > 0 ? ` (${usedBatches.join(", ")})` : "";
    showToast(`Scarico: ${scaricoProd.name} x ${scaricoQty}${batchInfo}`);
    setShowScarico(false); load();
  }

  // ── Quick Carico ──
  function openQuickCarico(p: Product) { setQuickCaricoProd(p); setQuickCaricoQty(1); setQuickCaricoNotes(""); setQuickCaricoExpiry(""); setShowQuickCarico(true); }
  async function confirmQuickCarico() {
    if (!quickCaricoProd || quickCaricoQty <= 0) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("stock_movements").insert({
      product_id: quickCaricoProd.product_id, type: "in", quantity: quickCaricoQty,
      notes: quickCaricoNotes.trim() || null, created_by: user?.id ?? null,
      expiry_date: quickCaricoExpiry || null,
    });
    if (error) return showToast("Errore: " + error.message, "error");
    await supabase.from("product_batches").insert({
      product_id: quickCaricoProd.product_id, quantity_initial: quickCaricoQty,
      quantity_remaining: quickCaricoQty, expiry_date: quickCaricoExpiry || null,
      source: "manual", notes: quickCaricoNotes.trim() || null,
    });
    logClientActivity("update", "magazzino", `Carico: ${quickCaricoProd.name} x ${quickCaricoQty}`, { product: quickCaricoProd.name, qty: quickCaricoQty });
    showToast(`Carico: ${quickCaricoProd.name} x ${quickCaricoQty} — Giacenza: ${quickCaricoProd.current_stock + quickCaricoQty}`);
    setShowQuickCarico(false); load();
  }

  // ── Detail ──
  async function openDetail(p: Product) {
    setDetailProd(p); setShowDetail(true);
    const [{ data }, { data: pb }] = await Promise.all([
      supabase.from("stock_movements").select("*, products(name), profiles(full_name)")
        .eq("product_id", p.product_id).order("created_at", { ascending: false }).limit(30),
      supabase.from("product_batches").select("*").eq("product_id", p.product_id)
        .gt("quantity_remaining", 0).order("expiry_date", { ascending: true, nullsFirst: false }),
    ]);
    setDetailMoves((data ?? []) as Movement[]);
    setDetailBatches((pb ?? []) as Batch[]);
  }

  // ── Export ──
  function exportCSV() {
    const h = "Prodotto,Barcode,Categoria,Giacenza,Unita,Scorta minima,Costo unitario,Valore\n";
    const r = filtered.map(p => `"${p.name}","${p.barcode ?? ""}","${p.category}",${p.current_stock},"${p.unit}",${p.min_stock},${p.unit_cost},${(p.current_stock * p.unit_cost).toFixed(2)}`).join("\n");
    const blob = new Blob(["﻿" + h + r], { type: "text/csv;charset=utf-8" });
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

  // ── Shopping list data ──
  const shoppingGroups = useMemo(() => {
    const lowProducts = products.filter(p => p.min_stock > 0 && p.current_stock < p.min_stock);
    const grouped = new Map<string, { supplier: string; items: Product[] }>();
    for (const p of lowProducts) {
      const suppName = p.supplier_id ? (suppliers.find(s => s.id === p.supplier_id)?.name ?? "Senza fornitore") : "Senza fornitore";
      if (!grouped.has(suppName)) grouped.set(suppName, { supplier: suppName, items: [] });
      grouped.get(suppName)!.items.push(p);
    }
    return [...grouped.values()].sort((a, b) => a.supplier === "Senza fornitore" ? 1 : b.supplier === "Senza fornitore" ? -1 : a.supplier.localeCompare(b.supplier));
  }, [products, suppliers]);

  function printShoppingList() {
    const w = window.open("", "_blank");
    if (!w) return;
    let html = `<html><head><title>Lista della Spesa</title><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Albert Sans',sans-serif;padding:32px;color:#1F3326;font-size:13px}
      h1{font-family:'Fraunces',serif;font-size:22px;margin-bottom:4px}
      .date{color:#6C6B5D;font-size:13px;margin-bottom:20px}
      h3{font-size:15px;margin:16px 0 8px;padding-bottom:6px;border-bottom:1px solid #D8CCB8}
      table{width:100%;border-collapse:collapse;margin-bottom:16px}
      th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#6C6B5D;padding:6px 8px;border-bottom:1px solid #D8CCB8}
      td{padding:8px;border-bottom:1px solid #F3EBDD;font-size:13px}
      .qty{text-align:center;font-weight:700;color:#9E3B2E}
      .check{width:20px}
    </style></head><body>
    <h1>Lista della Spesa</h1>
    <div class="date">${new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>`;
    for (const g of shoppingGroups) {
      html += `<h3>${g.supplier}</h3><table><thead><tr><th class="check">✓</th><th>Prodotto</th><th>Categoria</th><th style="text-align:center">Attuale</th><th style="text-align:center">Minimo</th><th style="text-align:center">Da ordinare</th></tr></thead><tbody>`;
      for (const p of g.items) {
        html += `<tr><td class="check">☐</td><td><strong>${p.name}</strong></td><td>${p.category}</td><td style="text-align:center">${p.current_stock} ${p.unit}</td><td style="text-align:center">${p.min_stock} ${p.unit}</td><td class="qty">${p.min_stock - p.current_stock} ${p.unit}</td></tr>`;
      }
      html += `</tbody></table>`;
    }
    html += `</body></html>`;
    w.document.write(html);
    w.document.close();
    w.print();
  }

  async function downloadShoppingPDF() {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

    const lowProducts = products.filter(p => p.min_stock > 0 && p.current_stock < p.min_stock);
    if (lowProducts.length === 0) return;

    const byCat = new Map<string, Product[]>();
    for (const p of lowProducts) {
      (byCat.get(p.category) ?? (byCat.set(p.category, []), byCat.get(p.category)!)).push(p);
    }
    const cats = [...byCat.keys()].sort((a, b) => a.localeCompare(b));

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const mx = 16;
    const now = new Date();
    const dateStr = now.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const tsStr = `${now.toLocaleDateString("it-IT")} ${now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(31, 51, 38);
    doc.text("LE 4 CAMERE HOTEL", mx, 20);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(14);
    doc.text("Lista della spesa", mx, 28);

    doc.setFontSize(10);
    doc.setTextColor(108, 107, 93);
    doc.text(dateStr, mx, 34);

    doc.setDrawColor(216, 204, 184);
    doc.line(mx, 37, pw - mx, 37);

    let startY = 41;

    for (const cat of cats) {
      const items = byCat.get(cat)!;

      if (startY > ph - 40) { doc.addPage(); startY = 20; }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(31, 51, 38);
      doc.text(cat.toUpperCase(), mx, startY);
      startY += 2;

      const rows = items.map(p => [
        "☐",
        p.name,
        `${p.current_stock} ${p.unit}`,
        `${p.min_stock - p.current_stock} ${p.unit}`,
        p.unit,
      ]);

      autoTable(doc, {
        startY,
        margin: { left: mx, right: mx },
        head: [["", "Prodotto", "Giacenza", "Da comprare", "Unita"]],
        body: rows,
        theme: "plain",
        styles: { font: "helvetica", fontSize: 10, cellPadding: 3, textColor: [31, 51, 38], lineColor: [216, 204, 184], lineWidth: 0.2 },
        headStyles: { fontStyle: "bold", fontSize: 8, textColor: [108, 107, 93], fillColor: [243, 235, 221] },
        columnStyles: {
          0: { halign: "center", cellWidth: 10, fontSize: 14 },
          1: { fontStyle: "bold", cellWidth: 60 },
          2: { halign: "center", cellWidth: 28 },
          3: { halign: "center", cellWidth: 28, fontStyle: "bold", textColor: [158, 59, 46] },
          4: { halign: "center", cellWidth: 20 },
        },
        didDrawPage: () => {},
      });

      startY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY + 20;
      startY += 6;
    }

    if (startY > ph - 25) { doc.addPage(); startY = 20; }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(31, 51, 38);
    doc.text(`Totale prodotti da comprare: ${lowProducts.length}`, mx, startY + 4);

    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Generato dal Gestionale Le 4 Camere — ${tsStr}`, mx, ph - 8);
      doc.text(`${i}/${totalPages}`, pw - mx, ph - 8, { align: "right" });
    }

    doc.save(`lista-spesa-${now.toISOString().slice(0, 10)}.pdf`);
  }

  /* ╔═══════════════════════════════════╗
     ║           R E N D E R             ║
     ╚═══════════════════════════════════╝ */

  return (
    <>
      {/* ── Scanner Bar ── */}
      <div className="mag-scan-bar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FAF9F5" strokeWidth="2" strokeLinecap="round">
          <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
          <path d="M8 7v10M12 7v10M16 7v10" />
        </svg>
        <input ref={scanRef} value={scanInput} onChange={e => setScanInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleScan(scanInput); } }}
          placeholder="Scansiona barcode..." autoFocus
          className="mag-scan-input" />
        <button className="cam-scan-btn" onClick={() => setShowCamScanner(true)} title="Scansiona con fotocamera">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FAF9F5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" />
          </svg>
        </button>
        {scanFeedback.type !== "idle" && (
          <div style={{ color: scanFeedback.type === "ok" ? "#A3D9A5" : "#F5C882", fontWeight: 600, fontSize: 14 }}>{scanFeedback.msg}</div>
        )}
      </div>

      {showCamScanner && <BarcodeScanner onScan={(code) => handleScan(code)} onClose={() => setShowCamScanner(false)} />}

      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 16 }}>
        <h1 className="serif" style={{ fontSize: 24, fontWeight: 500 }}>Magazzino</h1>
        <div className="magazzino-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/fornitori?arrivo=1" className="btn btn-primary" style={{ padding: "12px 24px", fontSize: 15, fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span className="mag-btn-label">Arrivo fornitore</span>
            <span className="mag-btn-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 18V6a2 2 0 00-2-2H4a2 2 0 00-2 2v11a1 1 0 001 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 001-1v-3.65a1 1 0 00-.22-.624l-3.48-4.35A1 1 0 0017.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg></span>
          </Link>
          <button className="btn btn-ghost" style={{ padding: "12px 24px", fontSize: 15, fontWeight: 700 }} onClick={() => setShowCarico(true)}>
            <span className="mag-btn-label">Carico merce</span>
            <span className="mag-btn-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 16h6m-3-3v6"/><path d="M21 10V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l2-1.14"/><path d="M7.5 4.21l9 5.2M2 7l10 5.8L22 7"/><path d="M12 22V12.8"/></svg></span>
          </button>
          <button className="btn btn-ghost" onClick={() => { setScaricoProd(null); setShowScarico(true); }}>
            <span className="mag-btn-label">Scarico rapido</span>
            <span className="mag-btn-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 16h6"/><path d="M21 10V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l2-1.14"/><path d="M7.5 4.21l9 5.2M2 7l10 5.8L22 7"/><path d="M12 22V12.8"/></svg></span>
          </button>
          <button className="btn btn-ghost" onClick={openNewProd}>
            <span className="mag-btn-label">+ Prodotto</span>
            <span className="mag-btn-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg></span>
          </button>
          {!isStaff && <button className="btn btn-ghost" onClick={exportCSV}><span className="mag-btn-label">Esporta CSV</span><span className="mag-btn-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></span></button>}
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="cards cards-4">
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
        <div className="card mag-kpi-clickable" style={lowCount > 0 ? { borderLeft: "3px solid #9E3B2E" } : undefined}
          onClick={() => { if (lowCount > 0) { setStatusFilter("low"); setCatFilter(""); } }}>
          <div className="label">Sotto scorta</div>
          <div className="value tabular" style={lowCount > 0 ? { color: "#9E3B2E" } : undefined}>{lowCount}</div>
          {lowCount > 0 && <div className="meta" style={{ color: "#9E3B2E", fontWeight: 700 }}>Riordino necessario</div>}
        </div>
        <div className="card mag-kpi-clickable" style={(expiringCount + expiredCount) > 0 ? { borderLeft: "3px solid #C77B4A" } : undefined}
          onClick={() => { if (expiringCount + expiredCount > 0) { setStatusFilter("expiring"); setCatFilter(""); } }}>
          <div className="label">In scadenza</div>
          <div className="value tabular" style={(expiringCount + expiredCount) > 0 ? { color: "#C77B4A" } : undefined}>{expiringCount + expiredCount}</div>
          {expiredCount > 0 && <div className="meta" style={{ color: "#9E3B2E", fontWeight: 700 }}>{expiredCount} scaduti</div>}
        </div>
      </div>

      {/* ── Alert Banner ── */}
      {criticalProducts.length > 0 && (
        <div className="mag-alert-banner">
          <button className="mag-alert-summary" onClick={() => setAlertsOpen(!alertsOpen)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C77B4A" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>
              {lowCount > 0 && <strong>{lowCount} sotto scorta</strong>}
              {lowCount > 0 && (expiringCount > 0 || expiredCount > 0) && " · "}
              {expiringCount > 0 && <strong>{expiringCount} in scadenza</strong>}
              {expiringCount > 0 && expiredCount > 0 && " · "}
              {expiredCount > 0 && <strong style={{ color: "#9E3B2E" }}>{expiredCount} scaduti</strong>}
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: "auto", transform: alertsOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }}><path d="M6 9l6 6 6-6"/></svg>
          </button>
          {alertsOpen && (
            <div className="mag-alert-list">
              {criticalProducts.slice(0, 20).map((p, i) => (
                <div key={`${p.product_id}-${p.reason}-${i}`} className="mag-alert-item">
                  <span className={`mag-badge mag-badge-${p.reason === "low" ? "low" : p.reason === "expired" ? "expired" : "expiring"}`} style={{ fontSize: 10 }}>
                    {p.reason === "low" ? "Basso" : p.reason === "expired" ? "Scaduto" : "In scad."}
                  </span>
                  <span className="mag-alert-name">{p.name}</span>
                  {p.reason === "low" && <span className="mag-alert-qty">{p.current_stock}/{p.min_stock} {p.unit}</span>}
                  {p.reason !== "low" && nearestExpiryMap[p.product_id] && <span className="mag-alert-qty">{fmtDate(nearestExpiryMap[p.product_id])}</span>}
                  <div className="mag-alert-actions">
                    <button onClick={() => openQuickCarico(p)} title="Carico">+</button>
                    <button onClick={() => openScarico(p)} title="Scarico">−</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Last Inventory ── */}
      {lastInv && (
        <div className="mag-inv-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
          <span>Ultimo inventario: <strong>{fmtDate(lastInv.completed_at)}</strong> — {lastInv.discrepancies_count} differenze</span>
          <Link href="/inventario" style={{ marginLeft: "auto", color: "var(--accent)", fontWeight: 600, textDecoration: "none", fontSize: 13 }}>Vedi report</Link>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="mag-filters-bar">
        <input placeholder="Cerca prodotto o barcode..." value={search} onChange={e => setSearch(e.target.value)} className="mag-search" />
        <div className="view-toggle mag-status-pills">
          {(["all", "ok", "low", "out", "expiring", "expired"] as const).map(v => (
            <button key={v} className={statusFilter === v ? "active" : ""} onClick={() => setStatusFilter(v)}>
              {{ all: "Tutti", ok: "OK", low: "Sotto scorta", out: "Esauriti", expiring: `In scad.${expiringCount ? ` (${expiringCount})` : ""}`, expired: `Scaduti${expiredCount ? ` (${expiredCount})` : ""}` }[v]}
            </button>
          ))}
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} className="mag-sort-select">
          <option value="name">Nome</option>
          <option value="stock">Giacenza</option>
          <option value="expiry">Scadenza</option>
          {!isStaff && <option value="value">Valore</option>}
          <option value="recent">Recente</option>
        </select>
        <div className="mag-view-switch">
          <button className={viewMode === "card" ? "active" : ""} onClick={() => setViewMode("card")} title="Vista card">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          </button>
          <button className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")} title="Vista tabella">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
        </div>
      </div>

      {/* ── Category Tabs ── */}
      <div className="mag-cat-tabs">
        <button className={`mag-cat-tab ${catFilter === "" ? "active" : ""}`} onClick={() => setCatFilter("")}>
          Tutti ({catCounts.total})
        </button>
        {Object.entries(catCounts.counts).sort((a, b) => a[0].localeCompare(b[0])).map(([cat, count]) => (
          <button key={cat} className={`mag-cat-tab ${catFilter === cat ? "active" : ""}`}
            onClick={() => setCatFilter(catFilter === cat ? "" : cat)}
            style={catFilter === cat ? undefined : { borderColor: catFg(cat) + "40" }}>
            <span className="mag-cat-dot" style={{ background: catFg(cat) }} />
            {cat} ({count})
          </button>
        ))}
      </div>

      {/* ── Product Grid / Table ── */}
      <div className="mag-products-section">
        <div className="mag-products-header">
          <span className="mag-products-count">{filtered.length} prodotti</span>
          {totalPages > 1 && <span className="muted" style={{ fontSize: 13 }}>Pagina {safePage} di {totalPages}</span>}
        </div>

        {(loading || roleLoading) ? (
          <div className="empty" style={{ padding: 48 }}>Caricamento...</div>
        ) : filtered.length === 0 ? (
          <div className="empty" style={{ padding: 48 }}>
            <div className="serif" style={{ fontSize: 18, marginBottom: 6 }}>Nessun prodotto</div>
            <div>{products.length > 0 ? "Nessun risultato per i filtri selezionati." : "Aggiungi il primo prodotto."}</div>
          </div>
        ) : viewMode === "card" ? (
          /* ── Card View ── */
          <div className="mag-card-grid">
            {paginated.map(p => {
              const ei = expiryInfo(p);
              const lm = lastMoveMap[p.product_id];
              const batchCount = batchesByProduct[p.product_id]?.length ?? 0;
              const bInfo = bottleStockInfo(p);
              return (
                <div key={p.product_id} className="mag-pcard" onClick={() => openDetail(p)}
                  style={bInfo && bInfo.openBottles.length > 0 ? { borderLeft: "3px solid #BFA762" } : undefined}>
                  <div className="mag-pcard-top">
                    <div>
                      <div className="mag-pcard-name">{p.name}</div>
                      <div className="mag-pcard-meta">
                        <span className="badge" style={{ background: catBg(p.category), color: catFg(p.category) }}>{p.category}</span>
                        {bInfo && bInfo.openBottles.length > 0 ? (
                          <span className="badge" style={{ background: "#F3EBDD", color: "#8A7355", border: "1px solid #BFA762" }}>{"\u{1F37E}"} Aperta</span>
                        ) : bInfo ? (
                          <span className="badge" style={{ background: "rgba(138,115,85,.12)", color: "#8A7355" }}>Bottiglia</span>
                        ) : null}
                        {p.barcode && <span className="mag-pcard-barcode">{p.barcode}</span>}
                      </div>
                    </div>
                    {statusBadge(p)}
                  </div>

                  {bInfo ? (
                    <div className="mag-pcard-stats">
                      <div className="mag-pcard-stat mag-pcard-stat-main">
                        <div className="mag-pcard-stat-val">{bInfo.closedCount}</div>
                        <div className="mag-pcard-stat-lbl">{bInfo.closedCount === 1 ? "chiusa" : "chiuse"}</div>
                      </div>
                      <div className="mag-pcard-stat">
                        {bInfo.openBottles.length > 0 ? (
                          <>
                            <div style={{ display: "flex", gap: 2, justifyContent: "center" }}>
                              {bInfo.openBottles.map((ob, i) => (
                                <BottleIndicator key={i} fillLevel={ob.fill_level} size="sm" showLabel />
                              ))}
                            </div>
                            <div className="mag-pcard-stat-lbl">{bInfo.openBottles.length === 1 ? "aperta" : "aperte"}</div>
                          </>
                        ) : (
                          <>
                            <div className="mag-pcard-stat-val-sm muted">—</div>
                            <div className="mag-pcard-stat-lbl">aperte</div>
                          </>
                        )}
                      </div>
                      <div className="mag-pcard-stat">
                        <div className="mag-pcard-stat-val-sm">{bInfo.doses}</div>
                        <div className="mag-pcard-stat-lbl">dosi ({bInfo.pour}ml)</div>
                      </div>
                    </div>
                  ) : (
                    <div className="mag-pcard-stats">
                      <div className="mag-pcard-stat mag-pcard-stat-main">
                        <div className="mag-pcard-stat-val">{p.current_stock}</div>
                        <div className="mag-pcard-stat-lbl">{p.unit}</div>
                      </div>
                      <div className="mag-pcard-stat">
                        <div className="mag-pcard-stat-val-sm">{p.min_stock || "—"}</div>
                        <div className="mag-pcard-stat-lbl">Min.</div>
                      </div>
                      <div className="mag-pcard-stat">
                        {ei ? (
                          <>
                            <div className={`mag-pcard-stat-val-sm ${ei.isExpired ? "mag-text-danger" : ei.isExpiring7 ? "mag-text-warn" : ""}`}>
                              {fmtDate(ei.date)}
                            </div>
                            <div className="mag-pcard-stat-lbl">Scadenza</div>
                          </>
                        ) : (
                          <>
                            <div className="mag-pcard-stat-val-sm muted">—</div>
                            <div className="mag-pcard-stat-lbl">Scadenza</div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="mag-pcard-footer">
                    <span className="muted" style={{ fontSize: 11 }}>
                      {bInfo ? `${Math.round(bInfo.totalMl)}ml totali` : (
                        <>
                          {batchCount > 0 && `${batchCount} lott${batchCount === 1 ? "o" : "i"}`}
                          {batchCount > 0 && lm && " · "}
                          {lm && `Ultimo: ${new Date(lm.date).toLocaleDateString("it-IT")}`}
                        </>
                      )}
                    </span>
                    {!isStaff && <span className="mag-pcard-value">{eur(p.current_stock * p.unit_cost)}</span>}
                  </div>

                  <div className="mag-pcard-actions" onClick={e => e.stopPropagation()}>
                    <button className="mag-pill-btn mag-pill-ok" onClick={() => openQuickCarico(p)}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14"/></svg>
                      Carico
                    </button>
                    <button className="mag-pill-btn mag-pill-warn" onClick={() => openScarico(p)}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14"/></svg>
                      Scarico
                    </button>
                    {bInfo && (
                      <button className="mag-pill-btn" style={{ background: "rgba(138,115,85,.1)", color: "#8A7355", border: "1px solid rgba(138,115,85,.25)" }}
                        onClick={() => openBottle(p)} disabled={bInfo.closedCount === 0 || openingBottleId === p.product_id}
                        title={bInfo.closedCount === 0 ? "Nessuna bottiglia chiusa" : "Apri bottiglia"}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 2h6v4H9z"/><rect x="8" y="6" width="8" height="16" rx="2"/><path d="M10 12h4"/></svg>
                        {openingBottleId === p.product_id ? "Apertura..." : bInfo.closedCount === 0 ? "Nessuna chiusa" : "Apri bottiglia"}
                      </button>
                    )}
                    <button className="mag-pill-btn mag-pill-ghost" onClick={() => openDetail(p)}>
                      Dettaglio →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ── Table View ── */
          <div style={{ overflowX: "auto" }}>
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
                {paginated.map(p => {
                  const isLow = p.min_stock > 0 && p.current_stock < p.min_stock && p.current_stock > 0;
                  const isOut = p.current_stock <= 0;
                  const lm = lastMoveMap[p.product_id];
                  const bInfo = bottleStockInfo(p);
                  return (
                    <tr key={p.product_id}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                        <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                          <span className="badge" style={{ background: catBg(p.category), color: catFg(p.category) }}>{p.category}</span>
                          {bInfo && <span className="badge" style={{ background: "rgba(138,115,85,.12)", color: "#8A7355" }}>Bottiglia</span>}
                        </div>
                      </td>
                      <td className="hide-sm muted" style={{ fontSize: 12, fontFamily: "'Courier New', monospace", letterSpacing: 1 }}>{p.barcode || "—"}</td>
                      <td style={{ textAlign: "center" }}>
                        {bInfo ? (
                          <div>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                              <span style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600 }}>{bInfo.closedCount}</span>
                              {bInfo.openBottles.length > 0 && (
                                <div style={{ display: "flex", gap: 1, alignItems: "flex-end" }}>
                                  <span style={{ fontSize: 12, color: "#8A7355", marginRight: 2 }}>+</span>
                                  {bInfo.openBottles.map((ob, i) => (
                                    <BottleIndicator key={i} fillLevel={ob.fill_level} size="sm" />
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="muted" style={{ fontSize: 11 }}>{bInfo.doses} dosi · {Math.round(bInfo.totalMl)}ml</div>
                          </div>
                        ) : (
                          <>
                            <span style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 600, color: isOut ? "var(--danger)" : isLow ? "#B68A3E" : "var(--ink)" }}>{p.current_stock}</span>
                            <span className="muted" style={{ fontSize: 12, marginLeft: 4 }}>{p.unit}</span>
                          </>
                        )}
                      </td>
                      <td className="tabular muted" style={{ textAlign: "center" }}>{p.min_stock || "—"}</td>
                      <td style={{ textAlign: "center" }}>{statusBadge(p)}</td>
                      <td className="hide-sm" style={{ textAlign: "center", fontSize: 12 }}>
                        {(() => {
                          const prodB = batchesByProduct[p.product_id];
                          const ei = expiryInfo(p);
                          if (!ei) return <span className="muted">—</span>;
                          const batchCount = prodB ? prodB.length : 0;
                          return (
                            <div>
                              <div style={{ whiteSpace: "nowrap" }}>{fmtDate(ei.date)}</div>
                              {ei.isExpired && <span className="badge" style={{ background: "#9E3B2E", color: "#FAF9F5", fontSize: 10, marginTop: 2 }}>Scaduto</span>}
                              {ei.isExpiring7 && <span className="badge" style={{ background: "rgba(199,123,74,.15)", color: "#C77B4A", fontSize: 10, marginTop: 2 }}>Scade tra {ei.daysLeft}gg</span>}
                              {ei.isExpiring30 && <span className="badge" style={{ background: "rgba(191,167,98,.12)", color: "#96832E", fontSize: 10, marginTop: 2 }}>Scade il {fmtDate(ei.date)}</span>}
                              {batchCount > 1 && <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>{batchCount} lotti</div>}
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
                          {bInfo && (
                            <button className="btn-ghost" style={{ padding: "5px 8px", borderRadius: 8, fontSize: 12, color: "#8A7355", opacity: (bInfo.closedCount === 0 || openingBottleId === p.product_id) ? 0.4 : 1 }}
                              onClick={() => openBottle(p)} disabled={bInfo.closedCount === 0 || openingBottleId === p.product_id}
                              title={openingBottleId === p.product_id ? "Apertura..." : bInfo.closedCount === 0 ? "Nessuna bottiglia chiusa" : "Apri bottiglia"}>
                              {openingBottleId === p.product_id ? (
                                <span style={{ fontSize: 11 }}>...</span>
                              ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 2h6v4H9z"/><rect x="8" y="6" width="8" height="16" rx="2"/><path d="M10 12h4"/></svg>
                              )}
                            </button>
                          )}
                          <button className="btn-ghost" style={{ padding: "5px 8px", borderRadius: 8, fontSize: 12 }} onClick={() => openDetail(p)}>Dettaglio</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="mag-pagination">
            <button disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>← Precedente</button>
            <div className="mag-page-nums">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(n => n === 1 || n === totalPages || Math.abs(n - safePage) <= 1)
                .reduce<(number | "...")[]>((acc, n, idx, arr) => {
                  if (idx > 0 && n - (arr[idx - 1]) > 1) acc.push("...");
                  acc.push(n);
                  return acc;
                }, [])
                .map((n, i) =>
                  n === "..." ? <span key={`d${i}`} className="mag-page-dots">…</span> :
                  <button key={n} className={n === safePage ? "active" : ""} onClick={() => setPage(n as number)}>{n}</button>
                )}
            </div>
            <button disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>Successiva →</button>
          </div>
        )}
      </div>

      {/* ── Recent Movements (collapsible) ── */}
      {movements.length > 0 && (
        <div className="section" style={{ marginTop: 24 }}>
          <div className="section-head" style={{ cursor: "pointer" }} onClick={() => setMovesOpen(!movesOpen)}>
            <h2>Ultimi movimenti</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="muted" style={{ fontSize: 13 }}>20 piu recenti</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2" style={{ transform: movesOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }}><path d="M6 9l6 6 6-6"/></svg>
            </div>
          </div>
          {movesOpen && (
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
          )}
        </div>
      )}

      {/* ── Shopping List FAB + Panel ── */}
      {lowCount > 0 && (
        <button className="mag-fab" onClick={() => setShowShoppingPanel(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
          <span>Lista spesa ({lowCount})</span>
        </button>
      )}

      {showShoppingPanel && (
        <div className="mag-panel-overlay" onClick={() => setShowShoppingPanel(false)}>
          <div className="mag-panel" onClick={e => e.stopPropagation()}>
            <div className="mag-panel-head">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                <h2>Lista della spesa</h2>
                <button className="btn-ghost" style={{ padding: "4px 10px", borderRadius: 8, flexShrink: 0 }} onClick={() => setShowShoppingPanel(false)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button className="btn btn-ghost" style={{ fontSize: 13, padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "center" }} onClick={downloadShoppingPDF}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg>
                  Scarica PDF
                </button>
                <button className="btn btn-ghost" style={{ fontSize: 13, padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "center" }} onClick={printShoppingList}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                  Stampa
                </button>
              </div>
            </div>
            <div className="mag-panel-body">
              {shoppingGroups.map(g => (
                <div key={g.supplier} className="mag-shop-group">
                  <div className="mag-shop-supplier">{g.supplier}</div>
                  {g.items.map(p => (
                    <div key={p.product_id} className="mag-shop-item">
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                        <span className="badge" style={{ background: catBg(p.category), color: catFg(p.category), fontSize: 10 }}>{p.category}</span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="muted" style={{ fontSize: 12 }}>{p.current_stock}/{p.min_stock} {p.unit}</div>
                        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600, color: "#9E3B2E" }}>
                          {p.min_stock - p.current_stock} {p.unit}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
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
                  <DatePickerIT value={quickCaricoExpiry} onChange={v => setQuickCaricoExpiry(v)} />
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
              <div className="field">
                <label>Tipo gestione</label>
                <select value={pf.tracking_type} onChange={e => setPf({ ...pf, tracking_type: e.target.value as "units" | "bottle" })}>
                  <option value="units">Unità (standard)</option>
                  <option value="bottle">Bottiglia con livello</option>
                </select>
              </div>
              {pf.tracking_type === "bottle" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "14px 16px", borderRadius: 10, background: "rgba(138,115,85,.06)", border: "1px solid rgba(138,115,85,.15)" }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Capacità bottiglia (ml)</label>
                    <input type="number" min="1" step="1" value={pf.bottle_capacity_ml} onChange={e => setPf({ ...pf, bottle_capacity_ml: Math.max(1, Number(e.target.value)) })} />
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      {[700, 750, 1000, 1500].map(v => (
                        <button key={v} type="button" className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12, fontWeight: pf.bottle_capacity_ml === v ? 700 : 400, background: pf.bottle_capacity_ml === v ? "rgba(138,115,85,.15)" : undefined }}
                          onClick={() => setPf({ ...pf, bottle_capacity_ml: v })}>{v}</button>
                      ))}
                    </div>
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>ML per dose standard</label>
                    <input type="number" min="1" step="1" value={pf.standard_pour_ml} onChange={e => setPf({ ...pf, standard_pour_ml: Math.max(1, Number(e.target.value)) })} />
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      {[30, 40, 45, 50].map(v => (
                        <button key={v} type="button" className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12, fontWeight: pf.standard_pour_ml === v ? 700 : 400, background: pf.standard_pour_ml === v ? "rgba(138,115,85,.15)" : undefined }}
                          onClick={() => setPf({ ...pf, standard_pour_ml: v })}>{v}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: "#8A7355", fontWeight: 600 }}>
                    ~{Math.floor(pf.bottle_capacity_ml / pf.standard_pour_ml)} dosi per bottiglia
                  </div>
                </div>
              )}
              <div className={isStaff ? "" : "grid2"}>
                {!isStaff && <div className="field"><label>Costo unitario</label><input type="number" min="0" step="0.01" value={pf.unit_cost} onChange={e => setPf({ ...pf, unit_cost: Number(e.target.value) })} /></div>}
                <div className="field"><label>Scorta minima</label><input type="number" min="0" step="1" value={pf.min_stock} onChange={e => setPf({ ...pf, min_stock: Number(e.target.value) })} /></div>
              </div>
              {!editProd && (
                <div className="grid2">
                  <div className="field"><label>Quantita iniziale</label><input type="number" min="0" step="1" value={pf.initial_qty} onChange={e => setPf({ ...pf, initial_qty: Math.max(0, Number(e.target.value)) })} placeholder="Es: 24" /></div>
                  <div className="field"><label>Scadenza (opzionale)</label><DatePickerIT value={pf.expiry_date} onChange={v => setPf({ ...pf, expiry_date: v })} /></div>
                </div>
              )}
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
              {(() => {
                const dBInfo = bottleStockInfo(detailProd);
                if (dBInfo) {
                  return (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                      <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-soft)", fontWeight: 600 }}>Chiuse</div>
                        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, marginTop: 4 }}>{dBInfo.closedCount}</div>
                      </div>
                      <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-soft)", fontWeight: 600 }}>Aperte</div>
                        {dBInfo.openBottles.length > 0 ? (
                          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 6 }}>
                            {dBInfo.openBottles.map((ob, i) => (
                              <BottleIndicator key={i} fillLevel={ob.fill_level} size="sm" showLabel capacityMl={dBInfo.cap} />
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, marginTop: 4 }}>0</div>
                        )}
                      </div>
                      <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-soft)", fontWeight: 600 }}>Totale ml</div>
                        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600, marginTop: 4 }}>{Math.round(dBInfo.totalMl)}</div>
                      </div>
                      <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-soft)", fontWeight: 600 }}>Dosi</div>
                        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, marginTop: 4 }}>{dBInfo.doses}</div>
                        <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{dBInfo.pour}ml/dose</div>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
              {detailProd.tracking_type !== "bottle" && (
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
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className="badge" style={{ background: catBg(detailProd.category), color: catFg(detailProd.category) }}>{detailProd.category}</span>
                {detailProd.tracking_type === "bottle" && <span className="badge" style={{ background: "rgba(138,115,85,.12)", color: "#8A7355" }}>Bottiglia</span>}
                {detailProd.barcode && <span className="badge" style={{ fontFamily: "'Courier New', monospace", letterSpacing: 1 }}>{detailProd.barcode}</span>}
                {!isStaff && <span className="badge">{eur(detailProd.unit_cost)}/{detailProd.unit}</span>}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 8 }}>Andamento giacenza</div>
                {miniChart(detailMoves, detailProd.current_stock) || <div className="muted" style={{ textAlign: "center", padding: 12 }}>Nessun movimento</div>}
              </div>
              {detailBatches.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 8 }}>
                    {detailProd.tracking_type === "bottle" ? "Bottiglie in magazzino" : "Lotti in magazzino"}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {detailBatches.map(b => {
                      const daysLeft = b.expiry_date ? Math.round((new Date(b.expiry_date).getTime() - Date.now()) / 86400000) : null;
                      const isExpired = daysLeft !== null && daysLeft < 0;
                      const isExpiring7 = daysLeft !== null && !isExpired && daysLeft <= 7;
                      const isExpiring30 = daysLeft !== null && !isExpired && !isExpiring7 && daysLeft <= 30;
                      return (
                        <div key={b.id} style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                          borderRadius: 8, background: b.is_open ? "#FDFAF3" : "var(--surface-2)",
                          borderLeft: `3px solid ${b.is_open ? "#BFA762" : isExpired ? "#9E3B2E" : isExpiring7 ? "#C77B4A" : isExpiring30 ? "#BFA762" : "#2D5A3D"}`,
                        }}>
                          {b.is_open ? (
                            <div style={{ minWidth: 50, display: "flex", justifyContent: "center" }}>
                              <BottleIndicator
                                fillLevel={b.fill_level ?? 0}
                                size="md"
                                showLabel
                                capacityMl={detailProd.bottle_capacity_ml ?? undefined}
                              />
                            </div>
                          ) : (
                            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600, minWidth: 50, textAlign: "center" }}>{b.quantity_remaining}</div>
                          )}
                          <div style={{ flex: 1, fontSize: 12 }}>
                            {b.is_open ? (
                              <span className="badge" style={{ background: "#F3EBDD", color: "#8A7355", border: "1px solid #BFA762", fontSize: 11, padding: "3px 10px", marginBottom: 4, display: "inline-block" }}>{"\u{1F37E}"} Bottiglia aperta</span>
                            ) : detailProd.tracking_type === "bottle" ? (
                              <span className="badge" style={{ background: "var(--surface-2)", color: "var(--ink-soft)", border: "1px solid var(--line)", fontSize: 11, padding: "3px 10px", marginBottom: 4, display: "inline-block" }}>{"\u{1F4E6}"} Chiusa</span>
                            ) : null}
                            {b.is_open && (
                              <div style={{ fontSize: 11, color: "#8A7355", marginBottom: 2 }}>Aperta il {fmtDate(b.created_at)}</div>
                            )}
                            {b.expiry_date ? (
                              <div>
                                Scadenza: <strong>{fmtDate(b.expiry_date)}</strong>
                                {isExpired && <span className="badge" style={{ background: "#9E3B2E", color: "#FAF9F5", fontSize: 10, marginLeft: 6 }}>Scaduto</span>}
                                {isExpiring7 && <span className="badge" style={{ background: "rgba(199,123,74,.15)", color: "#C77B4A", fontSize: 10, marginLeft: 6 }}>{daysLeft}gg</span>}
                                {isExpiring30 && <span className="badge" style={{ background: "rgba(191,167,98,.12)", color: "#96832E", fontSize: 10, marginLeft: 6 }}>{daysLeft}gg</span>}
                              </div>
                            ) : <div className="muted">Senza scadenza</div>}
                            <div className="muted" style={{ fontSize: 11 }}>{b.source === "delivery" ? "Fornitore" : b.source === "migration" ? "Migrazione" : "Manuale"} — {fmtDate(b.created_at)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
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
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(() => { const dBInfo = bottleStockInfo(detailProd); const isOpening = openingBottleId === detailProd.product_id; return dBInfo ? (
                  <button className="btn" style={{ flex: "1 1 100%", background: dBInfo.closedCount === 0 ? "var(--surface-2)" : "rgba(138,115,85,.1)", color: dBInfo.closedCount === 0 ? "var(--ink-soft)" : "#8A7355", border: `1px solid ${dBInfo.closedCount === 0 ? "var(--line)" : "rgba(138,115,85,.25)"}`, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: (dBInfo.closedCount === 0 || isOpening) ? 0.6 : 1 }}
                    onClick={() => { openBottle(detailProd); }}
                    disabled={dBInfo.closedCount === 0 || isOpening}
                    title={dBInfo.closedCount === 0 ? "Nessuna bottiglia chiusa" : `Apri bottiglia — ${dBInfo.closedCount} chiuse disponibili`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 2h6v4H9z"/><rect x="8" y="6" width="8" height="16" rx="2"/><path d="M10 12h4"/></svg>
                    {isOpening ? "Apertura..." : dBInfo.closedCount === 0 ? "Nessuna bottiglia chiusa" : `Apri bottiglia (${dBInfo.closedCount} ${dBInfo.closedCount === 1 ? "chiusa" : "chiuse"})`}
                  </button>
                ) : null; })()}
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setShowDetail(false); openEditProd(detailProd); }}>Modifica</button>
                <button className="btn btn-ghost" style={{ flex: 1, color: "var(--danger)" }} onClick={() => { setShowDetail(false); delProd(detailProd.product_id); }}>Elimina</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Scan Action Choice ── */}
      {scanActionProd && (
        <div className="modal-overlay" onClick={() => setScanActionProd(null)}>
          <div className="modal-card" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "24px 24px 0" }}>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{scanActionProd.name}</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
                <span className="badge" style={{ background: catBg(scanActionProd.category), color: catFg(scanActionProd.category) }}>{scanActionProd.category}</span>
                {scanActionProd.barcode && <span className="badge" style={{ fontFamily: "'Courier New', monospace", letterSpacing: 1 }}>{scanActionProd.barcode}</span>}
              </div>
              <div style={{ display: "flex", gap: 16, padding: "14px 18px", background: "var(--surface-2)", borderRadius: 10, marginBottom: 6 }}>
                <div style={{ textAlign: "center", flex: 1 }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-soft)", fontWeight: 600 }}>Giacenza</div>
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600, marginTop: 2 }}>{scanActionProd.current_stock} <span style={{ fontSize: 13, fontWeight: 400, color: "var(--ink-soft)" }}>{scanActionProd.unit}</span></div>
                </div>
                {(() => {
                  const pb = batchesByProduct[scanActionProd.product_id];
                  if (!pb || pb.length === 0) return null;
                  return (
                    <div style={{ textAlign: "center", flex: 1, borderLeft: "1px solid var(--line)", paddingLeft: 16 }}>
                      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-soft)", fontWeight: 600 }}>Lotti</div>
                      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600, marginTop: 2 }}>{pb.length}</div>
                      {nearestExpiryMap[scanActionProd.product_id] && (
                        <div style={{ fontSize: 11, color: nearestExpiryMap[scanActionProd.product_id] < todayStr ? "#9E3B2E" : "#C77B4A", fontWeight: 600, marginTop: 2 }}>
                          Scad. {fmtDate(nearestExpiryMap[scanActionProd.product_id])}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
            <div style={{ padding: "16px 24px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 2 }}>Cosa vuoi fare?</div>
              <button className="btn" style={{ width: "100%", padding: "14px 20px", fontSize: 15, fontWeight: 700, background: "#2D5A3D", color: "#FAF9F5", borderRadius: 10, border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}
                onClick={() => { const p = scanActionProd; setScanActionProd(null); openQuickCarico(p); setTimeout(() => scanRef.current?.focus(), 100); }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                Carico merce
              </button>
              <button className="btn" style={{ width: "100%", padding: "14px 20px", fontSize: 15, fontWeight: 700, background: "#1F3326", color: "#FAF9F5", borderRadius: 10, border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}
                onClick={() => { const p = scanActionProd; setScanActionProd(null); openScarico(p); setTimeout(() => scanRef.current?.focus(), 100); }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14" /></svg>
                Scarico rapido
              </button>
              <button className="btn btn-ghost" style={{ width: "100%", padding: "12px 20px", fontSize: 14 }}
                onClick={() => { const p = scanActionProd; setScanActionProd(null); openDetail(p); }}>
                Dettaglio prodotto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Product Modal (from scan) ── */}
      {newProdBarcode && (
        <NewProductModal barcode={newProdBarcode} supabase={supabase} onSave={handleNewProductSaved} onClose={() => setNewProdBarcode(null)} />
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
