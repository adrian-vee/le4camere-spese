"use client";

import { useEffect, useMemo, useRef, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { eur, fmtDate, isoToday } from "@/lib/format";
import Link from "next/link";
import CaricoModal from "./CaricoModal";
import NewProductModal, { type SavedProduct } from "@/components/NewProductModal";
import { logClientActivity } from "@/lib/activityLog";
import { useRole } from "@/lib/useRole";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/Toast";
import BarcodeScanner from "@/components/BarcodeScanner";
import BottleIndicator from "@/components/BottleIndicator";
import ScaricoModal from "./ScaricoModal";
import QuickCaricoModal from "./QuickCaricoModal";
import ProductFormModal from "./ProductFormModal";
import type { ProductFormData } from "./ProductFormModal";
import ProductDetailModal from "./ProductDetailModal";
import ScanActionModal from "./ScanActionModal";
import OpenBottleModal from "./OpenBottleModal";
import type { Product, Movement, Supplier, Batch } from "./types";
import { CAT_COLORS, catBg, catFg, fmtDT } from "./types";

type StatusFilter = "all" | "ok" | "low" | "out" | "expiring" | "expired";
type SortBy = "name" | "stock" | "expiry" | "value" | "recent";

function MagazzinoInner() {
  const supabase = createClient();
  const { role, loading: roleLoading } = useRole();
  const isStaff = role === "staff";
  const searchParams = useSearchParams();
  const router = useRouter();

  // ── Data state ──
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastInv, setLastInv] = useState<{ completed_at: string; discrepancies_count: number } | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);

  // ── Filter & view state (initialized from URL) ──
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [catFilter, setCatFilter] = useState(searchParams.get("cat") || "");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>((searchParams.get("status") as StatusFilter) || "all");
  const [sortBy, setSortBy] = useState<SortBy>((searchParams.get("sort") as SortBy) || "name");
  const [viewMode, setViewMode] = useState<"card" | "table">("card");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(12);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [movesOpen, setMovesOpen] = useState(false);

  // ── Modal state ──
  const [showProd, setShowProd] = useState(false);
  const [editProd, setEditProd] = useState<Product | null>(null);
  const [showScarico, setShowScarico] = useState(false);
  const [scaricoProd, setScaricoProd] = useState<Product | null>(null);
  const [showCarico, setShowCarico] = useState(false);
  const [showQuickCarico, setShowQuickCarico] = useState(false);
  const [quickCaricoProd, setQuickCaricoProd] = useState<Product | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailProd, setDetailProd] = useState<Product | null>(null);
  const [detailMoves, setDetailMoves] = useState<Movement[]>([]);
  const [detailBatches, setDetailBatches] = useState<Batch[]>([]);
  const [scanInput, setScanInput] = useState("");
  const [scanFeedback, setScanFeedback] = useState<{ type: "ok" | "warn" | "idle"; msg: string }>({ type: "idle", msg: "" });
  const [scanActionProd, setScanActionProd] = useState<Product | null>(null);
  const { toast, showToast } = useToast();
  const [newProdBarcode, setNewProdBarcode] = useState<string | null>(null);
  const [showShoppingPanel, setShowShoppingPanel] = useState(false);
  const [showCamScanner, setShowCamScanner] = useState(false);
  const [openingBottleId, setOpeningBottleId] = useState<string | null>(null);
  const [openBottleProd, setOpenBottleProd] = useState<Product | null>(null);
  const [allDetailBatches, setAllDetailBatches] = useState<Batch[]>([]);
  const scanRef = useRef<HTMLInputElement>(null);

  // ── Persist filters to URL ──
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (catFilter) params.set("cat", catFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (sortBy !== "name") params.set("sort", sortBy);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [search, catFilter, statusFilter, sortBy, router]);

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
    const today = isoToday();
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
  const todayStr = isoToday();
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

  // ── Category counts ──
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

  function openBottle(p: Product) {
    const pBatches = batchesByProduct[p.product_id] ?? [];
    const closedBatch = pBatches.find(b => !b.is_open && b.quantity_remaining > 0);
    if (!closedBatch) return showToast("Nessuna bottiglia chiusa da aprire", "warn");
    setOpenBottleProd(p);
  }

  async function confirmOpenBottle(level: number) {
    const p = openBottleProd;
    if (!p) return;
    const pBatches = batchesByProduct[p.product_id] ?? [];
    const closedBatch = pBatches.find(b => !b.is_open && b.quantity_remaining > 0);
    if (!closedBatch) return;
    setOpeningBottleId(p.product_id);
    try {
      if (closedBatch.quantity_remaining === 1) {
        await supabase.from("product_batches").update({ is_open: true, fill_level: level }).eq("id", closedBatch.id);
      } else {
        await supabase.from("product_batches").update({ quantity_remaining: closedBatch.quantity_remaining - 1 }).eq("id", closedBatch.id);
        await supabase.from("product_batches").insert({
          product_id: p.product_id, quantity_initial: 1, quantity_remaining: 1,
          expiry_date: closedBatch.expiry_date, source: "manual",
          notes: "Bottiglia aperta", is_open: true, fill_level: level,
        });
      }
      showToast(`Bottiglia aperta — ${p.name} a ${level}/10`);
      setOpenBottleProd(null);
      await load();
    } finally {
      setOpeningBottleId(null);
    }
  }

  async function refreshDetailBatches(productId: string) {
    const { data: pb } = await supabase.from("product_batches").select("*").eq("product_id", productId)
      .order("expiry_date", { ascending: true, nullsFirst: false });
    const all = (pb ?? []) as Batch[];
    setAllDetailBatches(all);
    setDetailBatches(all.filter(b => b.quantity_remaining > 0));
  }

  async function updateBatchLevel(batchId: string, level: number, prodName: string) {
    await supabase.from("product_batches").update({ fill_level: level }).eq("id", batchId);
    showToast(`Livello aggiornato — ${prodName} a ${level}/10`);
    if (detailProd) refreshDetailBatches(detailProd.product_id);
    load();
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
  function closeProd() { setShowProd(false); setEditProd(null); }
  function openNewProd() { setEditProd(null); setShowProd(true); }
  function openEditProd(p: Product) { setEditProd(p); setShowProd(true); }

  async function saveProd(pf: ProductFormData, editProduct: Product | null) {
    const isBottle = pf.tracking_type === "bottle";
    const payload = {
      name: pf.name.trim(), brand: pf.brand.trim() || null, category: pf.category, unit: pf.unit, unit_cost: pf.unit_cost, min_stock: pf.min_stock, supplier_id: pf.supplier_id || null, notes: pf.notes || null, barcode: pf.barcode.trim() || null, active: true, expiry_date: pf.expiry_date || null,
      tracking_type: pf.tracking_type,
      bottle_capacity_ml: isBottle ? pf.bottle_capacity_ml : null,
      standard_pour_ml: isBottle ? pf.standard_pour_ml : null,
    };
    if (editProduct) {
      const { error } = await supabase.from("products").update(payload).eq("id", editProduct.product_id);
      if (error) return showToast("Errore: " + error.message, "error");
    } else {
      const { data: newProd, error } = await supabase.from("products").insert(payload).select("id").single();
      if (error) return showToast("Errore: " + error.message, "error");
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

  async function delProd(id: string) {
    if (!confirm("Eliminare questo prodotto?")) return;
    const p = products.find(x => x.product_id === id);
    await supabase.from("products").delete().eq("id", id);
    logClientActivity("delete", "magazzino", `Prodotto eliminato: ${p?.name ?? "?"}`, { productId: id });
    load();
  }

  // ── Scarico ──
  function openScarico(p: Product) { setScaricoProd(p); setShowScarico(true); }

  async function handleConfirmScarico(prod: Product, qty: number, reason: string, notes: string) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("stock_movements").insert({
      product_id: prod.product_id, type: "out", quantity: qty,
      notes: [reason, notes].filter(Boolean).join(" — ") || null,
      created_by: user?.id ?? null,
    });
    if (error) return showToast("Errore: " + error.message, "error");
    const usedBatches: string[] = [];
    const prodBatches = batchesByProduct[prod.product_id] ?? [];
    let remaining = qty;
    for (const b of prodBatches) {
      if (remaining <= 0) break;
      const deduct = Math.min(remaining, b.quantity_remaining);
      await supabase.from("product_batches").update({ quantity_remaining: b.quantity_remaining - deduct }).eq("id", b.id);
      remaining -= deduct;
      if (b.expiry_date) usedBatches.push(`Lotto scad. ${fmtDate(b.expiry_date)}: -${deduct}`);
      else usedBatches.push(`Lotto s/scadenza: -${deduct}`);
    }
    logClientActivity("update", "magazzino", `Scarico: ${prod.name} x ${qty}`, { product: prod.name, qty, reason });
    const batchInfo = usedBatches.length > 0 ? ` (${usedBatches.join(", ")})` : "";
    showToast(`Scarico: ${prod.name} x ${qty}${batchInfo}`);
    load();
  }

  // ── Quick Carico ──
  function openQuickCarico(p: Product) { setQuickCaricoProd(p); setShowQuickCarico(true); }

  async function handleConfirmQuickCarico(prod: Product, qty: number, notes: string, expiry: string) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("stock_movements").insert({
      product_id: prod.product_id, type: "in", quantity: qty,
      notes: notes.trim() || null, created_by: user?.id ?? null,
      expiry_date: expiry || null,
    });
    if (error) return showToast("Errore: " + error.message, "error");
    await supabase.from("product_batches").insert({
      product_id: prod.product_id, quantity_initial: qty,
      quantity_remaining: qty, expiry_date: expiry || null,
      source: "manual", notes: notes.trim() || null,
    });
    logClientActivity("update", "magazzino", `Carico: ${prod.name} x ${qty}`, { product: prod.name, qty });
    showToast(`Carico: ${prod.name} x ${qty} — Giacenza: ${prod.current_stock + qty}`);
    load();
  }

  // ── Detail ──
  async function openDetail(p: Product) {
    setDetailProd(p); setShowDetail(true);
    const [{ data }, { data: pb }] = await Promise.all([
      supabase.from("stock_movements").select("*, products(name), profiles(full_name)")
        .eq("product_id", p.product_id).order("created_at", { ascending: false }).limit(30),
      supabase.from("product_batches").select("*").eq("product_id", p.product_id)
        .order("expiry_date", { ascending: true, nullsFirst: false }),
    ]);
    setDetailMoves((data ?? []) as Movement[]);
    const all = (pb ?? []) as Batch[];
    setAllDetailBatches(all);
    setDetailBatches(all.filter(b => b.quantity_remaining > 0));
  }

  // ── Export ──
  function exportCSV() {
    const h = "Prodotto,Barcode,Categoria,Giacenza,Unita,Scorta minima,Costo unitario,Valore\n";
    const r = filtered.map(p => `"${p.name}","${p.barcode ?? ""}","${p.category}",${p.current_stock},"${p.unit}",${p.min_stock},${p.unit_cost},${(p.current_stock * p.unit_cost).toFixed(2)}`).join("\n");
    const blob = new Blob(["﻿" + h + r], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `magazzino-${isoToday()}.csv`; a.click(); URL.revokeObjectURL(url);
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
      html += `<h3>${g.supplier}</h3><table><thead><tr><th class="check"></th><th>Prodotto</th><th>Categoria</th><th style="text-align:center">Attuale</th><th style="text-align:center">Minimo</th><th style="text-align:center">Da ordinare</th></tr></thead><tbody>`;
      for (const p of g.items) {
        html += `<tr><td class="check"></td><td><strong>${p.name}</strong></td><td>${p.category}</td><td style="text-align:center">${p.current_stock} ${p.unit}</td><td style="text-align:center">${p.min_stock} ${p.unit}</td><td class="qty">${p.min_stock - p.current_stock} ${p.unit}</td></tr>`;
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
    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(31, 51, 38);
    doc.text("LE 4 CAMERE HOTEL", mx, 20);
    doc.setFont("helvetica", "normal"); doc.setFontSize(14);
    doc.text("Lista della spesa", mx, 28);
    doc.setFontSize(10); doc.setTextColor(108, 107, 93);
    doc.text(dateStr, mx, 34);
    doc.setDrawColor(216, 204, 184); doc.line(mx, 37, pw - mx, 37);
    let startY = 41;
    for (const cat of cats) {
      const items = byCat.get(cat)!;
      if (startY > ph - 40) { doc.addPage(); startY = 20; }
      doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(31, 51, 38);
      doc.text(cat.toUpperCase(), mx, startY); startY += 2;
      const rows = items.map(p => ["", p.name, `${p.current_stock} ${p.unit}`, `${p.min_stock - p.current_stock} ${p.unit}`, p.unit]);
      autoTable(doc, {
        startY, margin: { left: mx, right: mx },
        head: [["", "Prodotto", "Giacenza", "Da comprare", "Unita"]], body: rows, theme: "plain",
        styles: { font: "helvetica", fontSize: 10, cellPadding: 3, textColor: [31, 51, 38], lineColor: [216, 204, 184], lineWidth: 0.2 },
        headStyles: { fontStyle: "bold", fontSize: 8, textColor: [108, 107, 93], fillColor: [243, 235, 221] },
        columnStyles: { 0: { halign: "center", cellWidth: 10, fontSize: 14 }, 1: { fontStyle: "bold", cellWidth: 60 }, 2: { halign: "center", cellWidth: 28 }, 3: { halign: "center", cellWidth: 28, fontStyle: "bold", textColor: [158, 59, 46] }, 4: { halign: "center", cellWidth: 20 } },
        didDrawPage: () => {},
      });
      startY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY + 20;
      startY += 6;
    }
    if (startY > ph - 25) { doc.addPage(); startY = 20; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(31, 51, 38);
    doc.text(`Totale prodotti da comprare: ${lowProducts.length}`, mx, startY + 4);
    const totalPagesN = doc.getNumberOfPages();
    for (let i = 1; i <= totalPagesN; i++) {
      doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(150, 150, 150);
      doc.text(`Generato dal Gestionale Le 4 Camere — ${tsStr}`, mx, ph - 8);
      doc.text(`${i}/${totalPagesN}`, pw - mx, ph - 8, { align: "right" });
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
          placeholder="Scansiona barcode..." autoFocus className="mag-scan-input" />
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
          {!isStaff && <button className="btn btn-ghost" onClick={openNewProd}>
            <span className="mag-btn-label">+ Prodotto</span>
            <span className="mag-btn-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg></span>
          </button>}
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
        <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)} className="mag-sort-select">
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
                    <div className="mag-pcard-stats" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
                      <div className="mag-pcard-stat mag-pcard-stat-main">
                        <div className="mag-pcard-stat-val">{bInfo.closedCount}</div>
                        <div className="mag-pcard-stat-lbl">{bInfo.closedCount === 1 ? "chiusa" : "chiuse"}</div>
                      </div>
                      <div className="mag-pcard-stat">
                        {bInfo.openBottles.length > 0 ? (
                          <><div style={{ display: "flex", gap: 2, justifyContent: "center" }}>
                            {bInfo.openBottles.map((ob, i) => (<BottleIndicator key={i} fillLevel={ob.fill_level} size="sm" showLabel />))}
                          </div><div className="mag-pcard-stat-lbl">{bInfo.openBottles.length === 1 ? "aperta" : "aperte"}</div></>
                        ) : (
                          <><div className="mag-pcard-stat-val-sm muted">—</div><div className="mag-pcard-stat-lbl">aperte</div></>
                        )}
                      </div>
                      <div className="mag-pcard-stat">
                        <div className="mag-pcard-stat-val-sm">{bInfo.doses}</div>
                        <div className="mag-pcard-stat-lbl">dosi ({bInfo.pour}ml)</div>
                      </div>
                      <div className="mag-pcard-stat">
                        {ei ? (
                          <><div className={`mag-pcard-stat-val-sm ${ei.isExpired ? "mag-text-danger" : ei.isExpiring7 ? "mag-text-warn" : ""}`}>{fmtDate(ei.date)}</div><div className="mag-pcard-stat-lbl">Scadenza</div></>
                        ) : (
                          <><div className="mag-pcard-stat-val-sm muted">—</div><div className="mag-pcard-stat-lbl">Scadenza</div></>
                        )}
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
                          <><div className={`mag-pcard-stat-val-sm ${ei.isExpired ? "mag-text-danger" : ei.isExpiring7 ? "mag-text-warn" : ""}`}>{fmtDate(ei.date)}</div><div className="mag-pcard-stat-lbl">Scadenza</div></>
                        ) : (
                          <><div className="mag-pcard-stat-val-sm muted">—</div><div className="mag-pcard-stat-lbl">Scadenza</div></>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="mag-pcard-footer">
                    <span className="muted" style={{ fontSize: 11 }}>
                      {bInfo ? (
                        <>{Math.round(bInfo.totalMl)}ml totali{ei && <> · Scad: <span style={{ color: ei.isExpired ? "#9E3B2E" : ei.isExpiring7 ? "#C77B4A" : ei.isExpiring30 ? "#B68A3E" : "inherit" }}>{fmtDate(ei.date)}</span></>}{bInfo.openBottles.length > 0 && <> · <span style={{ color: "#8A7355", cursor: "pointer", textDecoration: "underline" }} onClick={e => { e.stopPropagation(); openDetail(p); }}>Modifica livello</span></>}</>
                      ) : batchCount > 1 ? (
                        <>{p.current_stock} {p.unit} ({batchCount} lotti){ei && <> · Scad: <span style={{ color: ei.isExpired ? "#9E3B2E" : ei.isExpiring7 ? "#C77B4A" : ei.isExpiring30 ? "#B68A3E" : "inherit" }}>{fmtDate(ei.date)}</span></>}</>
                      ) : (
                        <>{batchCount > 0 && `${batchCount} lotto`}{batchCount > 0 && lm && " · "}{lm && `Ultimo: ${new Date(lm.date).toLocaleDateString("it-IT")}`}</>
                      )}
                    </span>
                    {!isStaff && <span className="mag-pcard-value">{eur(p.current_stock * p.unit_cost)}</span>}
                  </div>
                  <div className="mag-pcard-actions" onClick={e => e.stopPropagation()}>
                    <button className="mag-pill-btn mag-pill-ok" onClick={() => openQuickCarico(p)}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14"/></svg> Carico
                    </button>
                    <button className="mag-pill-btn mag-pill-warn" onClick={() => openScarico(p)}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14"/></svg> Scarico
                    </button>
                    {bInfo && (
                      <button className="mag-pill-btn" style={{ background: "rgba(138,115,85,.1)", color: "#8A7355", border: "1px solid rgba(138,115,85,.25)" }}
                        onClick={() => openBottle(p)} disabled={bInfo.closedCount === 0 || openingBottleId === p.product_id}
                        title={bInfo.closedCount === 0 ? "Nessuna bottiglia chiusa" : "Apri bottiglia"}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 2h6v4H9z"/><rect x="8" y="6" width="8" height="16" rx="2"/><path d="M10 12h4"/></svg>
                        {openingBottleId === p.product_id ? "Apertura..." : bInfo.closedCount === 0 ? "Nessuna chiusa" : "Apri bottiglia"}
                      </button>
                    )}
                    <button className="mag-pill-btn mag-pill-ghost" onClick={() => openDetail(p)}>Dettaglio →</button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
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
                                  {bInfo.openBottles.map((ob, i) => (<BottleIndicator key={i} fillLevel={ob.fill_level} size="sm" />))}
                                </div>
                              )}
                            </div>
                            <div className="muted" style={{ fontSize: 11 }}>{bInfo.doses} dosi · {Math.round(bInfo.totalMl)}ml</div>
                          </div>
                        ) : (
                          <><span style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 600, color: isOut ? "var(--danger)" : isLow ? "#B68A3E" : "var(--ink)" }}>{p.current_stock}</span><span className="muted" style={{ fontSize: 12, marginLeft: 4 }}>{p.unit}</span></>
                        )}
                      </td>
                      <td className="tabular muted" style={{ textAlign: "center" }}>{p.min_stock || "—"}</td>
                      <td style={{ textAlign: "center" }}>{statusBadge(p)}</td>
                      <td className="hide-sm" style={{ textAlign: "center", fontSize: 12 }}>
                        {(() => {
                          const prodB = batchesByProduct[p.product_id];
                          const ei = expiryInfo(p);
                          if (!ei) return <span className="muted">—</span>;
                          const batchCt = prodB ? prodB.length : 0;
                          return (
                            <div>
                              <div style={{ whiteSpace: "nowrap" }}>{fmtDate(ei.date)}</div>
                              {ei.isExpired && <span className="badge" style={{ background: "#9E3B2E", color: "#FAF9F5", fontSize: 10, marginTop: 2 }}>Scaduto</span>}
                              {ei.isExpiring7 && <span className="badge" style={{ background: "rgba(199,123,74,.15)", color: "#C77B4A", fontSize: 10, marginTop: 2 }}>Scade tra {ei.daysLeft}gg</span>}
                              {ei.isExpiring30 && <span className="badge" style={{ background: "rgba(191,167,98,.12)", color: "#96832E", fontSize: 10, marginTop: 2 }}>Scade il {fmtDate(ei.date)}</span>}
                              {batchCt > 1 && <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>{batchCt} lotti</div>}
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
                              {openingBottleId === p.product_id ? <span style={{ fontSize: 11 }}>...</span> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 2h6v4H9z"/><rect x="8" y="6" width="8" height="16" rx="2"/><path d="M10 12h4"/></svg>}
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
                  n === "..." ? <span key={`d${i}`} className="mag-page-dots">...</span> :
                  <button key={n} className={n === safePage ? "active" : ""} onClick={() => setPage(n as number)}>{n}</button>
                )}
            </div>
            <button disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>Successiva →</button>
          </div>
        )}
      </div>

      {/* ── Recent Movements ── */}
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
      {!isStaff && lowCount > 0 && (
        <button className="mag-fab" onClick={() => setShowShoppingPanel(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
          <span>Lista spesa ({lowCount})</span>
        </button>
      )}

      {/* Shopping panel uses mag-panel styling, kept as-is */}
      {!isStaff && showShoppingPanel && (
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

      {/* ── Modals ── */}
      {showCarico && <CaricoModal products={products} suppliers={suppliers} supabase={supabase} onClose={() => setShowCarico(false)} onDone={load} showToast={showToast} />}

      <ScaricoModal
        isOpen={showScarico}
        onClose={() => setShowScarico(false)}
        products={products}
        scaricoProd={scaricoProd}
        setScaricoProd={setScaricoProd}
        nearestExpiryMap={nearestExpiryMap}
        todayStr={todayStr}
        batchesByProduct={batchesByProduct}
        showToast={showToast}
        onConfirm={handleConfirmScarico}
      />

      <QuickCaricoModal
        isOpen={showQuickCarico}
        product={quickCaricoProd}
        onClose={() => { setShowQuickCarico(false); setQuickCaricoProd(null); }}
        onConfirm={handleConfirmQuickCarico}
      />

      {showProd && (
        <ProductFormModal
          isOpen={showProd}
          editProd={editProd}
          suppliers={suppliers}
          isStaff={isStaff}
          onClose={closeProd}
          onSave={saveProd}
          showToast={showToast}
        />
      )}

      <ProductDetailModal
        isOpen={showDetail}
        product={detailProd}
        detailMoves={detailMoves}
        detailBatches={detailBatches}
        allDetailBatches={allDetailBatches}
        isStaff={isStaff}
        openingBottleId={openingBottleId}
        onClose={() => setShowDetail(false)}
        onEdit={openEditProd}
        onDelete={delProd}
        onOpenBottle={openBottle}
        onUpdateBatchLevel={updateBatchLevel}
        bottleStockInfo={bottleStockInfo}
        miniChart={miniChart}
        showToast={showToast}
        refreshDetailBatches={refreshDetailBatches}
      />

      <ScanActionModal
        product={scanActionProd}
        nearestExpiryMap={nearestExpiryMap}
        todayStr={todayStr}
        batchesByProduct={batchesByProduct}
        scanRef={scanRef}
        onClose={() => setScanActionProd(null)}
        onQuickCarico={openQuickCarico}
        onScarico={openScarico}
        onDetail={openDetail}
      />

      <OpenBottleModal
        product={openBottleProd}
        openingBottleId={openingBottleId}
        onClose={() => setOpenBottleProd(null)}
        onConfirm={confirmOpenBottle}
      />

      {/* ── New Product Modal (from scan) ── */}
      {newProdBarcode && (
        <NewProductModal barcode={newProdBarcode} supabase={supabase} onSave={handleNewProductSaved} onClose={() => setNewProdBarcode(null)} />
      )}

      {/* ── Toast ── */}
      <Toast toast={toast} />
    </>
  );
}

export default function MagazzinoPage() {
  return (
    <Suspense fallback={<div className="empty" style={{ padding: 48 }}>Caricamento...</div>}>
      <MagazzinoInner />
    </Suspense>
  );
}
