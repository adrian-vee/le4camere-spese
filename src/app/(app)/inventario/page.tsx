"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { eur, fmtDate } from "@/lib/format";
import NewProductModal, { type SavedProduct } from "@/components/NewProductModal";
import BarcodeScanner from "@/components/BarcodeScanner";
import { useRole } from "@/lib/useRole";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/Toast";
import BottleIndicator from "@/components/BottleIndicator";

type Product = { product_id: string; name: string; category: string; unit: string; unit_cost: number; current_stock: number; barcode: string | null; tracking_type: "units" | "bottle"; bottle_capacity_ml: number | null; standard_pour_ml: number | null };
type Session = { id: string; started_at: string; completed_at: string | null; status: string; operator_id: string | null; notes: string | null; total_products: number; counted_products: number; discrepancies_count: number; discrepancies_value: number; profiles?: { full_name: string } | null };
type Count = { id: string; session_id: string; product_id: string; expected_qty: number; counted_qty: number | null; difference: number | null; value_difference: number | null; counted_at: string | null; notes: string | null; products?: { name: string; category: string; unit: string; unit_cost: number; barcode: string | null } | null };
type BottleNotes = { closed: number; levels: number[] };

function parseBottleNotes(notes: string | null): BottleNotes | null {
  if (!notes) return null;
  try {
    const data = JSON.parse(notes);
    if ("level" in data && !("levels" in data)) {
      return { closed: data.closed ?? 0, levels: data.level > 0 ? [data.level] : [] };
    }
    return { closed: data.closed ?? 0, levels: data.levels ?? [] };
  } catch { return null; }
}

export default function InventarioPage() {
  const supabase = createClient();
  const { role } = useRole();
  const isStaff = role === "staff";
  const [view, setView] = useState<"list" | "counting" | "report">("list");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [counts, setCounts] = useState<Count[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showTheoretical, setShowTheoretical] = useState(false);
  const [scanInput, setScanInput] = useState("");
  const { toast, showToast } = useToast();
  const [reportSession, setReportSession] = useState<Session | null>(null);
  const [reportCounts, setReportCounts] = useState<Count[]>([]);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState("");
  const [onlyDiffs, setOnlyDiffs] = useState(false);
  const [newProdBarcode, setNewProdBarcode] = useState<string | null>(null);
  const [showCamScanner, setShowCamScanner] = useState(false);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const scanRef = useRef<HTMLInputElement>(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  const fmtDT = (s: string) => { const d = new Date(s); return `${d.toLocaleDateString("it-IT")} ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`; };

  async function loadSessions() {
    setLoading(true);
    const [{ data: sess }, { data: prods }] = await Promise.all([
      supabase.from("inventory_sessions").select("*, profiles(full_name)").order("started_at", { ascending: false }).limit(20),
      supabase.from("stock_levels").select("product_id, name, category, unit, unit_cost, current_stock, barcode, tracking_type, bottle_capacity_ml, standard_pour_ml").eq("active", true).order("name"),
    ]);
    const all = (sess ?? []) as Session[];
    setSessions(all);
    setProducts((prods ?? []) as Product[]);
    const active = all.find(s => s.status === "in_corso");
    if (active) {
      setActiveSession(active);
      setStartTime(new Date(active.started_at));
      await loadCounts(active.id);
      setView("counting");
    }
    setLoading(false);
  }

  async function loadCounts(sessionId: string) {
    const { data } = await supabase.from("inventory_counts").select("*, products(name, category, unit, unit_cost, barcode)").eq("session_id", sessionId).order("id");
    setCounts((data ?? []) as Count[]);
  }

  useEffect(() => { loadSessions(); /* eslint-disable-next-line */ }, []);

  // Timer
  useEffect(() => {
    if (!startTime || view !== "counting") return;
    const iv = setInterval(() => {
      const diff = Math.floor((Date.now() - startTime.getTime()) / 1000);
      const h = Math.floor(diff / 3600); const m = Math.floor((diff % 3600) / 60); const s = diff % 60;
      setElapsed(`${h > 0 ? h + "h " : ""}${m}m ${s}s`);
    }, 1000);
    return () => clearInterval(iv);
  }, [startTime, view]);

  const countedCount = counts.filter(c => c.counted_qty !== null).length;
  const totalCount = counts.length;
  const progress = totalCount > 0 ? (countedCount / totalCount) * 100 : 0;

  const grouped = useMemo(() => {
    const map: Record<string, Count[]> = {};
    for (const c of counts) {
      const cat = c.products?.category ?? "Altro";
      (map[cat] ??= []).push(c);
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [counts]);

  const allCategories = useMemo(() => {
    const cats: Record<string, number> = {};
    for (const p of products) {
      const cat = p.category || "Altro";
      cats[cat] = (cats[cat] ?? 0) + 1;
    }
    return Object.entries(cats).sort((a, b) => a[0].localeCompare(b[0]));
  }, [products]);

  const categoryProgress = useMemo(() => {
    const result: Record<string, { counted: number; total: number }> = {};
    for (const [cat, items] of grouped) {
      result[cat] = {
        counted: items.filter(c => c.counted_qty !== null).length,
        total: items.length,
      };
    }
    return result;
  }, [grouped]);

  useEffect(() => {
    if (view === "counting" && grouped.length > 0 && activeCategory === null) {
      setActiveCategory(grouped[0][0]);
    }
  }, [view, grouped, activeCategory]);

  async function startNewSession() {
    setSaving(true);
    setShowCategoryPicker(false);
    const filteredProducts = selectedCategories.size > 0
      ? products.filter(p => selectedCategories.has(p.category || "Altro"))
      : products;
    const isPartial = selectedCategories.size > 0 && selectedCategories.size < allCategories.length;
    const sessionNotes = isPartial ? JSON.stringify({ categories: Array.from(selectedCategories) }) : null;
    const { data: { user } } = await supabase.auth.getUser();
    const { data: sess, error: sessErr } = await supabase.from("inventory_sessions").insert({
      operator_id: user?.id ?? null, total_products: filteredProducts.length, status: "in_corso", notes: sessionNotes,
    }).select().single();
    if (sessErr || !sess) { showToast("Errore: " + (sessErr?.message ?? "sconosciuto"), "error"); setSaving(false); return; }

    // For bottle products, calculate expected_qty in ml from batch data
    let batchDataMap: Record<string, { closedCount: number; openMl: number; openLevels: number[] }> = {};
    const bottleProds = filteredProducts.filter(p => p.tracking_type === "bottle");
    if (bottleProds.length > 0) {
      const { data: allBatches } = await supabase.from("product_batches").select("product_id, quantity_remaining, is_open, fill_level")
        .in("product_id", bottleProds.map(p => p.product_id)).gt("quantity_remaining", 0);
      for (const b of (allBatches ?? [])) {
        const entry = batchDataMap[b.product_id] ??= { closedCount: 0, openMl: 0, openLevels: [] };
        const prod = bottleProds.find(p => p.product_id === b.product_id);
        const cap = prod?.bottle_capacity_ml ?? 700;
        if (b.is_open) {
          const lvl = b.fill_level ?? 0;
          entry.openMl += lvl * cap / 10;
          for (let i = 0; i < b.quantity_remaining; i++) entry.openLevels.push(lvl);
        } else {
          entry.closedCount += b.quantity_remaining;
        }
      }
    }

    const rows = filteredProducts.map(p => {
      if (p.tracking_type === "bottle") {
        const bd = batchDataMap[p.product_id];
        const cap = p.bottle_capacity_ml ?? 700;
        const expectedMl = bd ? (bd.closedCount * cap + bd.openMl) : 0;
        const initNotes = JSON.stringify({ closed: bd?.closedCount ?? 0, levels: bd?.openLevels ?? [] });
        return { session_id: sess.id, product_id: p.product_id, expected_qty: Math.round(expectedMl), notes: initNotes };
      }
      return { session_id: sess.id, product_id: p.product_id, expected_qty: p.current_stock };
    });
    if (rows.length > 0) {
      const { error: cErr } = await supabase.from("inventory_counts").insert(rows);
      if (cErr) { showToast("Errore creazione conteggi: " + cErr.message, "error"); setSaving(false); return; }
    }
    setActiveSession(sess as Session);
    setStartTime(new Date());
    await loadCounts(sess.id);
    setView("counting");
    setSaving(false);
  }

  async function updateCount(countId: string, value: number | null) {
    const c = counts.find(x => x.id === countId);
    if (!c) return;
    const counted = value;
    const diff = counted !== null ? counted - c.expected_qty : null;
    const prod = c.products;
    // For bottle products, value is in ml — convert diff to unit cost based on ml per bottle
    const isBottle = products.find(p => p.product_id === c.product_id)?.tracking_type === "bottle";
    let valDiff: number | null = null;
    if (diff !== null && prod) {
      if (isBottle) {
        const cap = products.find(p => p.product_id === c.product_id)?.bottle_capacity_ml ?? 700;
        valDiff = cap > 0 ? (diff / cap) * prod.unit_cost : 0;
      } else {
        valDiff = diff * prod.unit_cost;
      }
    }
    setCounts(prev => prev.map(x => x.id === countId ? { ...x, counted_qty: counted, difference: diff, value_difference: valDiff, counted_at: counted !== null ? new Date().toISOString() : null } : x));
    const { error: countErr } = await supabase.from("inventory_counts").update({
      counted_qty: counted, difference: diff, value_difference: valDiff, counted_at: counted !== null ? new Date().toISOString() : null,
    }).eq("id", countId);
    if (countErr) { showToast("Errore salvataggio conteggio", "error"); return; }
    const newCounted = counts.filter(x => x.id === countId ? counted !== null : x.counted_qty !== null).length;
    const { error: sessErr } = await supabase.from("inventory_sessions").update({ counted_products: newCounted }).eq("id", activeSession?.id ?? "");
    if (sessErr) { showToast("Errore aggiornamento sessione", "error"); }
  }

  async function updateBottleCount(countId: string, closedCount: number, levels: number[]) {
    const c = counts.find(x => x.id === countId);
    if (!c) return;
    const prod = products.find(p => p.product_id === c.product_id);
    const cap = prod?.bottle_capacity_ml ?? 700;
    const openMl = levels.reduce((s, l) => s + l * cap / 10, 0);
    const totalMl = Math.round(closedCount * cap + openMl);
    await updateCount(countId, totalMl);
    const notesJson = JSON.stringify({ closed: closedCount, levels });
    setCounts(prev => prev.map(x => x.id === countId ? { ...x, notes: notesJson } : x));
    const { error: notesErr } = await supabase.from("inventory_counts").update({ notes: notesJson }).eq("id", countId);
    if (notesErr) showToast("Errore salvataggio note bottiglia", "error");
  }

  async function addCountNote(countId: string, note: string) {
    setCounts(prev => prev.map(x => x.id === countId ? { ...x, notes: note || null } : x));
    const { error } = await supabase.from("inventory_counts").update({ notes: note || null }).eq("id", countId);
    if (error) showToast("Errore salvataggio note", "error");
  }

  function handleScan(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    const found = counts.find(c => c.products?.barcode === trimmed);
    if (found) {
      const foundCat = found.products?.category ?? "Altro";
      if (activeCategory !== foundCat) setActiveCategory(foundCat);
      setTimeout(() => {
        const el = inputRefs.current[found.id];
        if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.focus(); }
      }, 50);
    } else {
      setNewProdBarcode(trimmed);
    }
    setScanInput("");
  }

  async function handleNewProductSavedInv(saved: SavedProduct) {
    setNewProdBarcode(null);
    showToast(`Prodotto "${saved.name}" creato`);
    if (!activeSession) return;
    // Add a new inventory_count row for this product
    const { data: countRow, error: cErr } = await supabase.from("inventory_counts").insert({
      session_id: activeSession.id, product_id: saved.id, expected_qty: 0,
    }).select("*, products(name, category, unit, unit_cost, barcode)").single();
    if (cErr || !countRow) { showToast("Errore aggiunta conteggio: " + (cErr?.message ?? ""), "error"); return; }
    // Update session total
    const { error: sessUpErr } = await supabase.from("inventory_sessions").update({ total_products: totalCount + 1 }).eq("id", activeSession.id);
    if (sessUpErr) showToast("Errore aggiornamento sessione", "error");
    setCounts(prev => [...prev, countRow as Count]);
    const newCat = (countRow as Count).products?.category ?? "Altro";
    if (activeCategory !== newCat) setActiveCategory(newCat);
    setTimeout(() => {
      const el = inputRefs.current[countRow.id];
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.focus(); }
    }, 200);
  }

  async function closeSession(force = false) {
    if (!activeSession) return;
    const uncounted = counts.filter(c => c.counted_qty === null).length;
    if (uncounted > 0 && !force) {
      if (!confirm(`${uncounted} prodotti non ancora contati. Chiudere comunque?`)) return;
    }
    const diffs = counts.filter(c => c.counted_qty !== null && c.difference !== null && c.difference !== 0);
    const totalDiffVal = diffs.reduce((s, c) => s + (c.value_difference ?? 0), 0);
    const { error: closeErr } = await supabase.from("inventory_sessions").update({
      status: "completato", completed_at: new Date().toISOString(),
      counted_products: countedCount, discrepancies_count: diffs.length,
      discrepancies_value: Math.round(totalDiffVal * 100) / 100,
    }).eq("id", activeSession.id);
    if (closeErr) { showToast("Errore chiusura sessione", "error"); return; }

    const nextInvDate = new Date();
    nextInvDate.setMonth(nextInvDate.getMonth() + 1);
    nextInvDate.setDate(15);
    const nextInvISO = `${nextInvDate.getFullYear()}-${String(nextInvDate.getMonth() + 1).padStart(2, "0")}-15`;
    const { error: settErr } = await supabase.from("settings").upsert({ key: "inventario_prossima_data", value: nextInvISO }, { onConflict: "key" });
    if (settErr) showToast("Errore aggiornamento prossima data inventario", "error");

    const accuracy = counts.length > 0 ? Math.round(((counts.length - diffs.length) / counts.length) * 100) : 100;
    const { data: admins } = await supabase.from("profiles").select("id").in("role", ["admin", "manager"]);
    for (const a of (admins ?? []) as { id: string }[]) {
      const { error: notifErr } = await supabase.from("notifications").insert({
        user_id: a.id,
        type: "inventory_completed",
        title: `Inventario completato`,
        message: `${countedCount} prodotti, ${diffs.length} differenze, accuratezza ${accuracy}%. Prossimo: ${nextInvISO.split("-").reverse().join("/")}`,
        link: "/inventario",
        read: false,
      });
      if (notifErr) showToast("Errore invio notifica", "error");
    }

    setReportSession({ ...activeSession, status: "completato", completed_at: new Date().toISOString(), discrepancies_count: diffs.length, discrepancies_value: totalDiffVal });
    setReportCounts(counts);
    setActiveSession(null);
    setActiveCategory(null);
    setView("report");
  }

  async function pauseSession() {
    showToast("Inventario in pausa — riprendi quando vuoi");
    setActiveCategory(null);
    setView("list");
    loadSessions();
  }

  async function deleteSession(sessionId: string) {
    if (!confirm("Eliminare questa sessione di inventario? L'operazione è irreversibile.")) return;
    const { error: delCountsErr } = await supabase.from("inventory_counts").delete().eq("session_id", sessionId);
    if (delCountsErr) { showToast("Errore eliminazione conteggi", "error"); return; }
    const { error: delSessErr } = await supabase.from("inventory_sessions").delete().eq("id", sessionId);
    if (delSessErr) { showToast("Errore eliminazione sessione", "error"); return; }
    if (activeSession?.id === sessionId) {
      setActiveSession(null);
      setActiveCategory(null);
      setView("list");
    }
    showToast("Sessione eliminata");
    loadSessions();
  }

  async function viewReport(sess: Session) {
    setReportSession(sess);
    const { data } = await supabase.from("inventory_counts").select("*, products(name, category, unit, unit_cost, barcode)").eq("session_id", sess.id).order("id");
    setReportCounts((data ?? []) as Count[]);
    setView("report");
  }

  async function alignStock() {
    if (!reportSession || !confirm("Allineare il magazzino ai conteggi fisici? Verranno creati movimenti di rettifica.")) return;
    const { data: { user } } = await supabase.auth.getUser();
    const diffs = reportCounts.filter(c => c.counted_qty !== null && c.difference !== null && c.difference !== 0);

    // Separate unit and bottle products
    const unitDiffs = diffs.filter(c => {
      const prod = products.find(p => p.product_id === c.product_id);
      return prod?.tracking_type !== "bottle";
    });
    const bottleDiffs = diffs.filter(c => {
      const prod = products.find(p => p.product_id === c.product_id);
      return prod?.tracking_type === "bottle";
    });

    // Unit product movements (standard)
    const unitMovements = unitDiffs.map(c => ({
      product_id: c.product_id,
      type: (c.difference ?? 0) > 0 ? "in" as const : "out" as const,
      quantity: Math.abs(c.difference ?? 0),
      notes: `Rettifica inventario ${fmtDate(reportSession.started_at)}`,
      created_by: user?.id ?? null,
    }));

    // Bottle product movements (convert ml diff to bottle units)
    const bottleMovements = bottleDiffs.map(c => {
      const prod = products.find(p => p.product_id === c.product_id);
      const cap = prod?.bottle_capacity_ml ?? 700;
      const diffMl = c.difference ?? 0;
      const diffBottles = cap > 0 ? Math.round(Math.abs(diffMl) / cap * 10) / 10 : 0;
      return {
        product_id: c.product_id,
        type: diffMl > 0 ? "in" as const : "out" as const,
        quantity: Math.ceil(Math.abs(diffBottles)),
        notes: `Rettifica inventario ${fmtDate(reportSession.started_at)} (${diffMl > 0 ? "+" : ""}${diffMl}ml)`,
        created_by: user?.id ?? null,
      };
    }).filter(m => m.quantity > 0);

    const allMovements = [...unitMovements, ...bottleMovements];
    if (allMovements.length > 0) {
      const { error } = await supabase.from("stock_movements").insert(allMovements);
      if (error) return showToast("Errore: " + error.message, "error");
    }

    // --- Batch adjustments for unit products ---
    // Collect all product IDs that need negative deductions so we can fetch batches in one query
    const unitNegIds = unitDiffs.filter(c => (c.difference ?? 0) < 0).map(c => c.product_id);
    const unitPosBatches = unitDiffs.filter(c => (c.difference ?? 0) > 0).map(c => {
      const diff = c.difference ?? 0;
      return {
        product_id: c.product_id, quantity_initial: diff,
        quantity_remaining: diff, source: "manual" as const,
        notes: `Rettifica inventario ${fmtDate(reportSession.started_at)}`,
      };
    });

    // Batch insert all positive unit adjustments at once
    if (unitPosBatches.length > 0) {
      const { error } = await supabase.from("product_batches").insert(unitPosBatches);
      if (error) return showToast("Errore batch positivi: " + error.message, "error");
    }

    // Single query for all negative unit product batches
    if (unitNegIds.length > 0) {
      const { data: allNegBatches } = await supabase.from("product_batches").select("*")
        .in("product_id", unitNegIds).gt("quantity_remaining", 0)
        .order("expiry_date", { ascending: true, nullsFirst: false });

      const batchesByProduct = new Map<string, typeof allNegBatches>();
      for (const b of (allNegBatches ?? [])) {
        const arr = batchesByProduct.get(b.product_id) ?? [];
        arr.push(b);
        batchesByProduct.set(b.product_id, arr);
      }

      const batchUpdates: PromiseLike<unknown>[] = [];
      for (const c of unitDiffs.filter(c => (c.difference ?? 0) < 0)) {
        let toDeduct = Math.abs(c.difference ?? 0);
        const prodBatches = batchesByProduct.get(c.product_id) ?? [];
        for (const b of prodBatches) {
          if (toDeduct <= 0) break;
          const deduct = Math.min(toDeduct, b.quantity_remaining);
          batchUpdates.push(
            supabase.from("product_batches").update({ quantity_remaining: b.quantity_remaining - deduct }).eq("id", b.id).then()
          );
          toDeduct -= deduct;
        }
      }
      if (batchUpdates.length > 0) await Promise.all(batchUpdates);
    }

    // --- Batch adjustments for bottle products ---
    // Single query for all bottle product batches
    const bottleIds = bottleDiffs.map(c => c.product_id);
    let bottleBatchesByProduct = new Map<string, any[]>();
    if (bottleIds.length > 0) {
      const { data: allBottleBatches } = await supabase.from("product_batches").select("*")
        .in("product_id", bottleIds).gt("quantity_remaining", 0)
        .order("created_at", { ascending: true });
      for (const b of (allBottleBatches ?? [])) {
        const arr = bottleBatchesByProduct.get(b.product_id) ?? [];
        arr.push(b);
        bottleBatchesByProduct.set(b.product_id, arr);
      }
    }

    const bottleUpdates: PromiseLike<unknown>[] = [];
    const bottleInserts: Record<string, unknown>[] = [];

    for (const c of bottleDiffs) {
      const bNotes = parseBottleNotes(c.notes);
      if (!bNotes) continue;

      const prodBatches = bottleBatchesByProduct.get(c.product_id) ?? [];
      const openBatches = prodBatches.filter((b: any) => b.is_open);
      const countedLevels = bNotes.levels;

      // Match existing open batches to counted levels
      for (let i = 0; i < Math.min(openBatches.length, countedLevels.length); i++) {
        const lvl = countedLevels[i];
        if (lvl === 0) {
          bottleUpdates.push(
            supabase.from("product_batches").update({ quantity_remaining: 0, fill_level: 0 }).eq("id", openBatches[i].id).then()
          );
        } else {
          bottleUpdates.push(
            supabase.from("product_batches").update({ fill_level: lvl }).eq("id", openBatches[i].id).then()
          );
        }
      }
      // Remove extra open batches not in count
      for (let i = countedLevels.length; i < openBatches.length; i++) {
        bottleUpdates.push(
          supabase.from("product_batches").update({ quantity_remaining: 0 }).eq("id", openBatches[i].id).then()
        );
      }
      // Create new open batches if count has more than system
      for (let i = openBatches.length; i < countedLevels.length; i++) {
        if (countedLevels[i] > 0) {
          bottleInserts.push({
            product_id: c.product_id, quantity_initial: 1, quantity_remaining: 1,
            source: "manual", is_open: true, fill_level: countedLevels[i],
            notes: `Rettifica inventario ${fmtDate(reportSession.started_at)}`,
          });
        }
      }

      // Adjust closed bottle count
      const closedBatches = prodBatches.filter((b: any) => !b.is_open);
      const currentClosed = closedBatches.reduce((s: number, b: any) => s + b.quantity_remaining, 0);
      const countedClosed = bNotes.closed;
      if (countedClosed > currentClosed) {
        bottleInserts.push({
          product_id: c.product_id, quantity_initial: countedClosed - currentClosed,
          quantity_remaining: countedClosed - currentClosed, source: "manual",
          is_open: false, fill_level: null,
          notes: `Rettifica inventario ${fmtDate(reportSession.started_at)}`,
        });
      } else if (countedClosed < currentClosed) {
        let toDeduct = currentClosed - countedClosed;
        for (const b of closedBatches) {
          if (toDeduct <= 0) break;
          const deduct = Math.min(toDeduct, b.quantity_remaining);
          bottleUpdates.push(
            supabase.from("product_batches").update({ quantity_remaining: b.quantity_remaining - deduct }).eq("id", b.id).then()
          );
          toDeduct -= deduct;
        }
      }
    }

    // Fire all bottle updates in parallel and batch-insert all new bottle batches
    const bottleOps: PromiseLike<unknown>[] = [];
    if (bottleUpdates.length > 0) bottleOps.push(Promise.all(bottleUpdates));
    if (bottleInserts.length > 0) bottleOps.push(supabase.from("product_batches").insert(bottleInserts).then());
    if (bottleOps.length > 0) await Promise.all(bottleOps);

    showToast(`Magazzino allineato: ${allMovements.length} rettifiche applicate`);
  }

  function escHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function generatePDF() {
    if (!reportSession) return;
    const diffs = reportCounts.filter(c => c.counted_qty !== null);
    const discrepancies = diffs.filter(c => (c.difference ?? 0) !== 0);
    const totalAmmanchi = discrepancies.filter(c => (c.difference ?? 0) < 0).reduce((s, c) => s + Math.abs(c.value_difference ?? 0), 0);
    const totalEccedenze = discrepancies.filter(c => (c.difference ?? 0) > 0).reduce((s, c) => s + (c.value_difference ?? 0), 0);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Inventario ${escHtml(fmtDate(reportSession.started_at))}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',system-ui,sans-serif;font-size:11px;color:#1F3326;padding:30px}
.header{text-align:center;margin-bottom:24px;border-bottom:2px solid #1F3326;padding-bottom:16px}
.header h1{font-size:20px;font-weight:700;letter-spacing:2px}.header h2{font-size:14px;font-weight:400;margin-top:4px;color:#6C6B5D}
.meta{display:flex;justify-content:space-between;margin-bottom:16px;font-size:11px;color:#6C6B5D}
table{width:100%;border-collapse:collapse;margin-bottom:16px}th{background:#F3EBDD;text-align:left;padding:6px 8px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #D8CCB8}
td{padding:6px 8px;border-bottom:1px solid #D8CCB8;font-size:11px}.num{text-align:right;font-variant-numeric:tabular-nums}
.neg{color:#9E3B2E;font-weight:700}.pos{color:#BFA762;font-weight:700}.summary{background:#F3EBDD;border-radius:8px;padding:14px;margin-bottom:20px}
.summary td{border:none;padding:4px 8px}.footer{margin-top:30px;font-size:10px;color:#6C6B5D;text-align:center;border-top:1px solid #D8CCB8;padding-top:12px}
.signatures{display:flex;justify-content:space-between;margin-top:40px;padding-top:8px}.sig{width:200px;border-top:1px solid #1F3326;text-align:center;padding-top:6px;font-size:10px}
@media print{body{padding:15px}@page{margin:15mm}}
</style></head><body>
<div class="header"><h1>LE 4 CAMERE</h1><div style="font-size:11px;letter-spacing:3px;color:#BFA762;margin:4px 0">HOTEL ★★★</div><h2>Inventario Magazzino</h2></div>
<div class="meta"><div>Data: ${escHtml(fmtDate(reportSession.started_at))}${reportSession.completed_at ? " — " + escHtml(fmtDate(reportSession.completed_at)) : ""}</div><div>Operatore: ${escHtml(reportSession.profiles?.full_name ?? "—")}</div></div>
${(() => {
  const pdfGrouped: Record<string, typeof diffs> = {};
  for (const c of diffs) { const cat = c.products?.category ?? "Altro"; (pdfGrouped[cat] ??= []).push(c); }
  return Object.entries(pdfGrouped).sort((a, b) => a[0].localeCompare(b[0])).map(([cat, rows]) =>
    `<h3 style="font-size:12px;margin:16px 0 6px;color:#1F3326;border-bottom:1px solid #D8CCB8;padding-bottom:4px">${escHtml(cat)} (${rows.length})</h3>
<table><thead><tr><th>Prodotto</th><th class="num">Teorico</th><th class="num">Contato</th><th class="num">Diff.</th><th class="num">Val. diff.</th></tr></thead><tbody>
${rows.map(c => {
  const cls = (c.difference ?? 0) < 0 ? "neg" : (c.difference ?? 0) > 0 ? "pos" : "";
  return `<tr><td>${escHtml(c.products?.name ?? "?")}</td><td class="num">${c.expected_qty}</td><td class="num">${c.counted_qty}</td><td class="num ${cls}">${(c.difference ?? 0) > 0 ? "+" : ""}${c.difference ?? 0}</td><td class="num ${cls}">${escHtml(eur(c.value_difference ?? 0))}</td></tr>`;
}).join("")}
</tbody></table>`
  ).join("");
})()}
<table class="summary"><tbody>
<tr><td><strong>Prodotti contati</strong></td><td class="num">${diffs.length} / ${reportCounts.length}</td><td><strong>Con differenze</strong></td><td class="num">${discrepancies.length}</td></tr>
<tr><td><strong>Totale ammanchi</strong></td><td class="num neg">${eur(-totalAmmanchi)}</td><td><strong>Totale eccedenze</strong></td><td class="num pos">+${eur(totalEccedenze)}</td></tr>
</tbody></table>
<div class="signatures"><div class="sig">Firma operatore</div><div class="sig">Firma responsabile</div></div>
<div class="footer">Documento generato dal Gestionale Le 4 Camere — ${new Date().toLocaleString("it-IT")}</div>
</body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
  }

  const invStyles = <style>{`
    .inv-kpi-list{grid-template-columns:repeat(3,1fr)}
    .inv-kpi-report{grid-template-columns:repeat(5,1fr)}
    @media(max-width:1023px){.inv-kpi-report{grid-template-columns:repeat(3,1fr)}}
    @media(max-width:820px){.inv-kpi-list{grid-template-columns:1fr 1fr}.inv-kpi-report{grid-template-columns:1fr 1fr}}
    @media(max-width:520px){.inv-kpi-list{grid-template-columns:1fr}.inv-kpi-report{grid-template-columns:1fr}}
    @media(max-width:1023px){.inv-bottom-bar{bottom:72px!important}}
  `}</style>;

  if (loading) return <div className="empty">Caricamento...</div>;

  // ── LIST VIEW ──
  if (view === "list") return (
    <>
      {invStyles}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <h1 className="serif" style={{ fontSize: 24, fontWeight: 500 }}>Inventario</h1>
        <button className="btn btn-primary" style={{ padding: "12px 24px", fontSize: 15, fontWeight: 700 }} onClick={() => { setSelectedCategories(new Set(allCategories.map(([c]) => c))); setShowCategoryPicker(true); }} disabled={saving}>
          {saving ? "Creazione..." : "Nuovo inventario"}
        </button>
      </div>
      {/* KPI Summary */}
      {sessions.length > 0 && (() => {
        const completed = sessions.filter(s => s.status === "completato");
        const lastCompleted = completed[0];
        const daysSinceLast = lastCompleted ? Math.floor((Date.now() - new Date(lastCompleted.completed_at!).getTime()) / 864e5) : null;
        const avgAccuracy = completed.length > 0
          ? completed.reduce((s, c) => s + (c.total_products > 0 ? ((c.total_products - c.discrepancies_count) / c.total_products) * 100 : 100), 0) / completed.length
          : null;
        const totalShortfall = completed.reduce((s, c) => s + Math.abs(c.discrepancies_value), 0);
        return (
          <div className="cards inv-kpi-list" style={{ marginBottom: 24 }}>
            <div className="card" style={{ borderLeft: `3px solid ${daysSinceLast !== null && daysSinceLast > 30 ? "#9E3B2E" : "#2D5A3D"}` }}>
              <div className="label">Ultimo inventario</div>
              <div className="value tabular">{daysSinceLast !== null ? `${daysSinceLast} giorni fa` : "Mai"}</div>
            </div>
            <div className="card" style={{ borderLeft: "3px solid #4F7B8C" }}>
              <div className="label">Accuratezza media</div>
              <div className="value tabular" style={{ color: avgAccuracy !== null && avgAccuracy < 95 ? "#9E3B2E" : "var(--ok)" }}>{avgAccuracy !== null ? `${avgAccuracy.toFixed(1)}%` : "—"}</div>
            </div>
            {!isStaff && (
              <div className="card" style={{ borderLeft: "3px solid #BFA762" }}>
                <div className="label">Differenze cumulate</div>
                <div className="value tabular" style={{ color: totalShortfall > 0 ? "#9E3B2E" : undefined }}>{eur(totalShortfall)}</div>
              </div>
            )}
          </div>
        );
      })()}

      {sessions.length === 0 ? (
        <div className="empty">
          <div className="serif" style={{ fontSize: 18, marginBottom: 6 }}>Nessun inventario</div>
          <div>Avvia il primo inventario per verificare le giacenze del magazzino.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {(isStaff ? sessions.slice(0, 1) : sessions).map(s => {
            const isActive = s.status === "in_corso";
            return (
              <div key={s.id} className="card" style={{ borderLeft: `3px solid ${isActive ? "#4F7B8C" : "#2D5A3D"}`, cursor: "pointer" }}
                onClick={() => isActive ? (setActiveSession(s), setStartTime(new Date(s.started_at)), loadCounts(s.id).then(() => setView("counting"))) : viewReport(s)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{fmtDate(s.started_at)}</div>
                    <div className="muted" style={{ marginTop: 4 }}>Operatore: {s.profiles?.full_name ?? "—"}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="badge" style={{ background: isActive ? "#E3EEF5" : "#E3EEE4", color: isActive ? "#4F7B8C" : "#2D5A3D" }}>
                      {isActive ? "In corso" : "Completato"}
                    </span>
                    {(() => { try { const n = s.notes ? JSON.parse(s.notes) : null; if (n?.categories) return <span className="badge" style={{ background: "#FDF6E3", color: "#C77B4A", fontSize: 11 }}>Parziale · {n.categories.length} cat.</span>; } catch {} return null; })()}
                    {!isStaff && (
                      <button className="btn-ghost" style={{ padding: "4px 10px", borderRadius: 8, fontSize: 12, color: "#9E3B2E" }}
                        onClick={e => { e.stopPropagation(); deleteSession(s.id); }}>
                        Elimina
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 24, marginTop: 12, fontSize: 13 }}>
                  <div><span className="muted">Prodotti:</span> <strong>{s.counted_products}/{s.total_products}</strong></div>
                  {s.status === "completato" && (
                    <>
                      <div><span className="muted">Differenze:</span> <strong style={{ color: s.discrepancies_count > 0 ? "#9E3B2E" : "var(--ok)" }}>{s.discrepancies_count}</strong></div>
                      {!isStaff && <div><span className="muted">Valore diff:</span> <strong style={{ color: s.discrepancies_value !== 0 ? "#9E3B2E" : undefined }}>{eur(s.discrepancies_value)}</strong></div>}
                    </>
                  )}
                </div>
                {isActive && (
                  <div className="bar-track" style={{ marginTop: 10 }}>
                    <div className="bar-fill" style={{ width: `${s.total_products > 0 ? (s.counted_products / s.total_products) * 100 : 0}%`, background: "#4F7B8C", height: "100%", borderRadius: 6, transition: "width .3s" }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {/* Category Picker Modal */}
      {showCategoryPicker && (
        <div className="modal-overlay" onClick={() => setShowCategoryPicker(false)} style={{ animation: "catPickerFadeIn .2s ease-out" }}>
          <div onClick={e => e.stopPropagation()} style={{
            maxWidth: 500, width: "calc(100vw - 32px)", background: "#fff", borderRadius: 16,
            boxShadow: "0 20px 60px rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.08)",
            display: "flex", flexDirection: "column", maxHeight: "calc(100dvh - 48px)",
            animation: "catPickerSlideIn .25s cubic-bezier(.16,1,.3,1)",
          }}>
            {/* Header */}
            <div style={{ padding: "24px 24px 16px", borderBottom: "1px solid #D8CCB8" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h2 className="serif" style={{ fontSize: 22, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 20 }}>📋</span> Nuovo inventario
                  </h2>
                  <p className="muted" style={{ fontSize: 13, margin: "6px 0 0" }}>Scegli quali categorie inventariare</p>
                </div>
                <button onClick={() => setShowCategoryPicker(false)} style={{
                  background: "none", border: "none", cursor: "pointer", padding: 4, marginTop: -2, marginRight: -4,
                  color: "#6C6B5D", fontSize: 20, lineHeight: 1, borderRadius: 8, transition: "background .15s",
                }} onMouseEnter={e => (e.currentTarget.style.background = "#F3EBDD")} onMouseLeave={e => (e.currentTarget.style.background = "none")}>✕</button>
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 14 }}>
                <button onClick={() => setSelectedCategories(new Set(allCategories.map(([c]) => c)))}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#BFA762", padding: 0 }}>
                  Seleziona tutte
                </button>
                <button onClick={() => setSelectedCategories(new Set())}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#BFA762", padding: 0 }}>
                  Deseleziona tutte
                </button>
              </div>
            </div>

            {/* Categories list */}
            <div style={{ padding: "16px 24px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              {allCategories.map(([cat, count]) => {
                const selected = selectedCategories.has(cat);
                return (
                  <div key={cat} role="checkbox" aria-checked={selected} tabIndex={0}
                    onClick={() => {
                      setSelectedCategories(prev => {
                        const next = new Set(prev);
                        if (next.has(cat)) next.delete(cat); else next.add(cat);
                        return next;
                      });
                    }}
                    onKeyDown={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setSelectedCategories(prev => { const next = new Set(prev); if (next.has(cat)) next.delete(cat); else next.add(cat); return next; }); } }}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                      background: selected ? "rgba(243,235,221,.5)" : "#fff",
                      border: selected ? "2px solid #1F3326" : "1px solid #D8CCB8",
                      borderRadius: 10, cursor: "pointer", transition: "all .15s ease",
                      marginLeft: selected ? 0 : 1, marginRight: selected ? 0 : 1,
                      marginTop: selected ? 0 : 1, marginBottom: selected ? 0 : 1,
                    }}
                    onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "#F3EBDD"; }}
                    onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "#fff"; }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                      border: selected ? "none" : "2px solid #D8CCB8",
                      background: selected ? "#1F3326" : "#fff",
                      display: "grid", placeItems: "center", transition: "all .15s",
                    }}>
                      {selected && (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 15, color: "#1F3326" }}>{cat}</span>
                    <span style={{
                      background: "#F3EBDD", color: "#6C6B5D", fontSize: 13, fontWeight: 600,
                      padding: "4px 12px", borderRadius: 20, whiteSpace: "nowrap",
                    }}>{count} prodott{count === 1 ? "o" : "i"}</span>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div style={{ padding: "16px 24px 24px", borderTop: "1px solid #D8CCB8" }}>
              <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
                {selectedCategories.size}/{allCategories.length} categorie · {products.filter(p => selectedCategories.has(p.category || "Altro")).length} prodotti
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setShowCategoryPicker(false)} style={{
                  background: "transparent", border: "1px solid #D8CCB8", color: "#1F3326",
                  borderRadius: 10, padding: "12px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer",
                  transition: "background .15s",
                }} onMouseEnter={e => (e.currentTarget.style.background = "#F3EBDD")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>Annulla</button>
                <button disabled={selectedCategories.size === 0 || saving} onClick={startNewSession} style={{
                  background: selectedCategories.size === 0 ? "#aaa" : "#1F3326", color: "#fff",
                  border: "none", borderRadius: 10, padding: "12px 24px", fontSize: 14, fontWeight: 700,
                  cursor: selectedCategories.size === 0 ? "not-allowed" : "pointer",
                  transition: "opacity .15s", opacity: saving ? 0.7 : 1,
                }}>{saving ? "Creazione..." : "Avvia inventario →"}</button>
              </div>
            </div>
          </div>
          <style>{`
            @keyframes catPickerFadeIn { from { opacity: 0 } to { opacity: 1 } }
            @keyframes catPickerSlideIn { from { opacity: 0; transform: scale(.96) translateY(8px) } to { opacity: 1; transform: scale(1) translateY(0) } }
          `}</style>
        </div>
      )}

      <Toast toast={toast} />
    </>
  );

  // ── COUNTING VIEW ──
  if (view === "counting") return (
    <>
      {invStyles}
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h1 className="serif" style={{ fontSize: 24, fontWeight: 500 }}>Conta inventario</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={showTheoretical} onChange={e => setShowTheoretical(e.target.checked)} style={{ accentColor: "#1F3326" }} />
            Mostra giacenza teorica
          </label>
        </div>
      </div>

      {/* Progress */}
      <div className="card" style={{ marginBottom: 20, borderLeft: "3px solid #4F7B8C" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <span style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600 }}>{countedCount}</span>
            <span style={{ fontSize: 16, color: "var(--ink-soft)" }}> / {totalCount} prodotti</span>
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
            {elapsed && <div className="muted">Tempo: <strong>{elapsed}</strong></div>}
            <div style={{ fontWeight: 700, color: progress === 100 ? "var(--ok)" : "#4F7B8C" }}>{Math.round(progress)}%</div>
          </div>
        </div>
        <div className="bar-track" style={{ marginTop: 10 }}>
          <div style={{ width: `${progress}%`, background: progress === 100 ? "var(--ok)" : "#4F7B8C", height: "100%", borderRadius: 6, transition: "width .5s ease" }} />
        </div>
      </div>

      {/* Scan */}
      <div style={{ background: "#1F3326", padding: "10px 16px", borderRadius: 10, marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FAF9F5" strokeWidth="2" strokeLinecap="round">
          <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
          <path d="M8 7v10M12 7v10M16 7v10" />
        </svg>
        <input ref={scanRef} value={scanInput} onChange={e => setScanInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleScan(scanInput); } }}
          placeholder="Scansiona barcode per saltare al prodotto..."
          style={{ flex: 1, background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.18)", borderRadius: 8, padding: "8px 12px", color: "#FAF9F5", fontSize: 14, fontFamily: "inherit" }} />
        <button className="cam-scan-btn" onClick={() => setShowCamScanner(true)} title="Scansiona con fotocamera">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FAF9F5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" />
          </svg>
        </button>
      </div>
      {showCamScanner && (
        <BarcodeScanner onScan={(code) => handleScan(code)} onClose={() => setShowCamScanner(false)} />
      )}

      {/* Category tabs */}
      {grouped.length > 1 && (
        <div ref={tabsRef} style={{
          display: "flex", gap: 6, overflowX: "auto", marginBottom: 16, paddingBottom: 4,
          WebkitOverflowScrolling: "touch", scrollbarWidth: "thin",
        }}>
          {grouped.map(([cat]) => {
            const cp = categoryProgress[cat];
            const isActive = activeCategory === cat;
            const isDone = cp && cp.counted === cp.total;
            return (
              <button key={cat} type="button"
                onClick={() => setActiveCategory(cat)}
                style={{
                  flex: "0 0 auto", padding: "8px 14px", borderRadius: 10,
                  border: isActive ? "2px solid #1F3326" : "1px solid var(--line)",
                  background: isActive ? "#1F3326" : isDone ? "rgba(45,90,61,.08)" : "var(--surface)",
                  color: isActive ? "#FAF9F5" : "var(--ink)",
                  fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                  display: "flex", alignItems: "center", gap: 8, transition: "all .15s",
                }}>
                <span>{cat}</span>
                <span style={{
                  fontSize: 11, padding: "2px 7px", borderRadius: 12, fontWeight: 700,
                  background: isActive ? "rgba(255,255,255,.2)" : isDone ? "#2D5A3D" : "#E8E6E1",
                  color: isActive ? "#FAF9F5" : isDone ? "#FAF9F5" : "#6C6B5D",
                }}>{cp?.counted ?? 0}/{cp?.total ?? 0}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Per-category progress bar */}
      {activeCategory && categoryProgress[activeCategory] && (
        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <div className="bar-track" style={{ flex: 1 }}>
            <div style={{
              width: `${categoryProgress[activeCategory].total > 0 ? (categoryProgress[activeCategory].counted / categoryProgress[activeCategory].total) * 100 : 0}%`,
              background: categoryProgress[activeCategory].counted === categoryProgress[activeCategory].total ? "#2D5A3D" : "#1F3326",
              height: "100%", borderRadius: 6, transition: "width .4s ease",
            }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: categoryProgress[activeCategory].counted === categoryProgress[activeCategory].total ? "#2D5A3D" : "#6C6B5D", whiteSpace: "nowrap" }}>
            {categoryProgress[activeCategory].counted === categoryProgress[activeCategory].total ? "Completata" : `${categoryProgress[activeCategory].counted}/${categoryProgress[activeCategory].total}`}
          </span>
        </div>
      )}

      {/* Product list by category */}
      {grouped.filter(([cat]) => !activeCategory || cat === activeCategory).map(([cat, items]) => (
        <div key={cat} className="section" style={{ marginBottom: 16 }}>
          <div className="section-head" style={{ padding: "12px 18px" }}>
            <h2 style={{ fontSize: 14 }}>{cat}</h2>
            <span className="muted">{items.filter(c => c.counted_qty !== null).length}/{items.length}</span>
          </div>
          <div style={{ padding: 0 }}>
            {items.map(c => {
              const isCounted = c.counted_qty !== null;
              const hasDiff = isCounted && c.difference !== null && c.difference !== 0;
              const borderColor = !isCounted ? "transparent" : hasDiff ? ((c.difference ?? 0) < 0 ? "#9E3B2E" : "#BFA762") : "#2D5A3D";
              const prod = products.find(p => p.product_id === c.product_id);
              const isBottle = prod?.tracking_type === "bottle";
              const bNotes = isBottle ? parseBottleNotes(c.notes) : null;
              const bCap = prod?.bottle_capacity_ml ?? 700;
              const bPour = prod?.standard_pour_ml ?? 30;
              return (
                <div key={c.id} style={{
                  display: "flex", alignItems: isBottle ? "flex-start" : "center", gap: 12, padding: "12px 18px",
                  borderBottom: "1px solid var(--line)", borderLeft: `3px solid ${borderColor}`,
                  background: isCounted ? (hasDiff ? "rgba(158,59,46,.03)" : "rgba(45,90,61,.03)") : "transparent",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.products?.name ?? "?"}</div>
                    <div style={{ fontSize: 12, color: "var(--ink-soft)", display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span>{c.products?.unit}</span>
                      {isBottle && <span className="badge" style={{ background: "rgba(138,115,85,.12)", color: "#8A7355", fontSize: 10, padding: "2px 6px" }}>Bottiglia {bCap}ml</span>}
                      {showTheoretical && <span>Teorico: <strong>{isBottle ? `${c.expected_qty}ml (~${Math.floor(c.expected_qty / bPour)} dosi)` : c.expected_qty}</strong></span>}
                      {c.products?.barcode && <span style={{ fontFamily: "'Courier New', monospace", fontSize: 11 }}>{c.products.barcode}</span>}
                    </div>
                  </div>
                  {isBottle ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 180 }}>
                      {/* Closed bottles */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ fontSize: 11, color: "var(--ink-soft)", fontWeight: 600, minWidth: 48 }}>Chiuse</div>
                        <input
                          ref={el => { inputRefs.current[c.id] = el; }}
                          type="number" min="0" step="1"
                          value={bNotes?.closed ?? ""}
                          placeholder="0"
                          onChange={e => {
                            const closed = e.target.value === "" ? 0 : Number(e.target.value);
                            updateBottleCount(c.id, closed, bNotes?.levels ?? []);
                          }}
                          style={{
                            width: 56, textAlign: "center", padding: "8px 4px",
                            border: `2px solid ${isCounted ? borderColor : "var(--line)"}`,
                            borderRadius: 8, fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600,
                            background: isCounted ? "var(--surface)" : "var(--surface-2)", color: "var(--ink)",
                          }}
                        />
                        {(bNotes?.closed ?? 0) > 0 && (
                          <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>{(bNotes?.closed ?? 0) * bCap}ml</span>
                        )}
                      </div>
                      {/* Open bottles — one level selector per open bottle */}
                      {(bNotes?.levels ?? []).map((lvl, idx) => (
                        <div key={idx} style={{ padding: "6px 0", borderTop: idx === 0 ? "1px solid var(--line)" : undefined }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                            <div style={{ fontSize: 11, color: "#8A7355", fontWeight: 600, minWidth: 48 }}>
                              Aperta{(bNotes?.levels.length ?? 0) > 1 ? ` #${idx + 1}` : ""}
                            </div>
                            <div className="bottle-level-selector">
                              {Array.from({ length: 11 }, (_, i) => (
                                <button key={i} type="button"
                                  className={`bottle-level-btn${lvl === i ? " active" : ""}`}
                                  style={{ height: 10 + i * 2.5 }}
                                  onClick={() => {
                                    const newLevels = [...(bNotes?.levels ?? [])];
                                    newLevels[idx] = i;
                                    updateBottleCount(c.id, bNotes?.closed ?? 0, newLevels);
                                  }}>
                                  {i}
                                </button>
                              ))}
                            </div>
                            <button type="button" className="btn-ghost" style={{ padding: "2px 6px", fontSize: 12, color: "#9E3B2E", borderRadius: 6 }}
                              onClick={() => {
                                const newLevels = (bNotes?.levels ?? []).filter((_, i) => i !== idx);
                                updateBottleCount(c.id, bNotes?.closed ?? 0, newLevels);
                              }}>✕</button>
                          </div>
                          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginTop: 4 }}>
                            <BottleIndicator fillLevel={lvl} size="md" showLabel capacityMl={bCap} />
                            <div style={{ fontSize: 11, color: "var(--ink-soft)", paddingBottom: 2 }}>
                              ~{Math.round(lvl * bCap / 10)}ml · ~{Math.floor(lvl * bCap / 10 / bPour)} dosi
                            </div>
                          </div>
                        </div>
                      ))}
                      {/* Add open bottle */}
                      <button type="button" className="btn-ghost" style={{ fontSize: 12, padding: "4px 10px", color: "#8A7355", border: "1px dashed rgba(138,115,85,.3)", borderRadius: 8, alignSelf: "flex-start" }}
                        onClick={() => updateBottleCount(c.id, bNotes?.closed ?? 0, [...(bNotes?.levels ?? []), 10])}>
                        + Aggiungi bottiglia aperta
                      </button>
                      {/* Total */}
                      {isCounted && (
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#8A7355", borderTop: "1px solid var(--line)", paddingTop: 6 }}>
                          Totale: {c.counted_qty}ml · ~{Math.floor((c.counted_qty ?? 0) / bPour)} dosi
                        </div>
                      )}
                    </div>
                  ) : (
                    <input
                      ref={el => { inputRefs.current[c.id] = el; }}
                      type="number" min="0" step="1"
                      value={c.counted_qty ?? ""}
                      placeholder="—"
                      onChange={e => {
                        const val = e.target.value === "" ? null : Number(e.target.value);
                        updateCount(c.id, val);
                      }}
                      onKeyDown={e => {
                        if (e.key === "Enter" || e.key === "Tab") {
                          const idx = items.findIndex(x => x.id === c.id);
                          const next = items[idx + 1];
                          if (next) { e.preventDefault(); inputRefs.current[next.id]?.focus(); }
                        }
                      }}
                      style={{
                        width: 80, textAlign: "center", padding: "10px 8px",
                        border: `2px solid ${isCounted ? borderColor : "var(--line)"}`,
                        borderRadius: 10, fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 600,
                        background: isCounted ? "var(--surface)" : "var(--surface-2)", color: "var(--ink)",
                      }}
                    />
                  )}
                  {isCounted && c.difference !== null && c.difference !== 0 && (
                    <div style={{ minWidth: 50, textAlign: "right", fontSize: 14, fontWeight: 700, color: (c.difference ?? 0) < 0 ? "#9E3B2E" : "#BFA762" }}>
                      {isBottle ? `${(c.difference ?? 0) > 0 ? "+" : ""}${c.difference}ml` : `${(c.difference ?? 0) > 0 ? "+" : ""}${c.difference}`}
                    </div>
                  )}
                  {isCounted && c.difference === 0 && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2D5A3D" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Next category button */}
      {activeCategory && categoryProgress[activeCategory]?.counted === categoryProgress[activeCategory]?.total && (() => {
        const nextCat = grouped.find(([cat]) => {
          if (cat === activeCategory) return false;
          const cp = categoryProgress[cat];
          return cp && cp.counted < cp.total;
        });
        if (!nextCat) return null;
        return (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <button className="btn btn-primary" style={{ padding: "12px 24px", fontSize: 14, borderRadius: 10 }}
              onClick={() => { setActiveCategory(nextCat[0]); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
              Vai a: {nextCat[0]} ({categoryProgress[nextCat[0]]?.counted}/{categoryProgress[nextCat[0]]?.total})
            </button>
          </div>
        );
      })()}

      {/* Bottom action bar */}
      <div className="inv-bottom-bar" style={{
        position: "sticky", bottom: 0, left: 0, right: 0, padding: "14px 20px",
        background: "var(--surface)", borderTop: "1px solid var(--line)",
        display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap",
        boxShadow: "0 -4px 16px rgba(0,0,0,.06)", borderRadius: "12px 12px 0 0",
      }}>
        <button className="btn-ghost" style={{ padding: "10px 16px", borderRadius: 10, fontSize: 13, color: "#9E3B2E", fontWeight: 600 }}
          onClick={() => activeSession && deleteSession(activeSession.id)}>Annulla inventario</button>
        <button className="btn btn-ghost" onClick={pauseSession}>Pausa</button>
        <button className="btn btn-primary" style={{ padding: "12px 28px", fontSize: 15 }}
          onClick={() => closeSession()} disabled={countedCount === 0}>
          Chiudi inventario
        </button>
      </div>

      {newProdBarcode && (
        <NewProductModal
          barcode={newProdBarcode}
          supabase={supabase}
          onSave={handleNewProductSavedInv}
          onClose={() => setNewProdBarcode(null)}
        />
      )}

      <Toast toast={toast} />
    </>
  );

  // ── REPORT VIEW ──
  if (view === "report" && reportSession) {
    const counted = reportCounts.filter(c => c.counted_qty !== null);
    const discrepancies = counted.filter(c => (c.difference ?? 0) !== 0).sort((a, b) => Math.abs(b.value_difference ?? 0) - Math.abs(a.value_difference ?? 0));
    const totalAmmanchi = discrepancies.filter(c => (c.difference ?? 0) < 0).reduce((s, c) => s + Math.abs(c.value_difference ?? 0), 0);
    const totalEccedenze = discrepancies.filter(c => (c.difference ?? 0) > 0).reduce((s, c) => s + (c.value_difference ?? 0), 0);
    const accuracy = counted.length > 0 ? ((counted.length - discrepancies.length) / counted.length) * 100 : 100;
    const tableRows = onlyDiffs ? discrepancies : counted;
    const reportGrouped: [string, Count[]][] = (() => {
      const map: Record<string, Count[]> = {};
      for (const c of tableRows) {
        const cat = c.products?.category ?? "Altro";
        (map[cat] ??= []).push(c);
      }
      return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
    })();
    let parsedSessionCategories: string[] | null = null;
    try { const n = reportSession.notes ? JSON.parse(reportSession.notes) : null; if (n?.categories) parsedSessionCategories = n.categories; } catch {}

    return (
      <>
        {invStyles}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 className="serif" style={{ fontSize: 24, fontWeight: 500 }}>Report inventario</h1>
            <div className="muted" style={{ marginTop: 4 }}>
              {fmtDate(reportSession.started_at)}{reportSession.completed_at ? " — " + fmtDate(reportSession.completed_at) : ""}
              {parsedSessionCategories && <span className="badge" style={{ marginLeft: 8, background: "#FDF6E3", color: "#C77B4A", fontSize: 11 }}>Inventario parziale · {parsedSessionCategories.length} categorie</span>}
            </div>
            {parsedSessionCategories && (
              <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
                {parsedSessionCategories.map(c => <span key={c} className="badge" style={{ background: "#F3EBDD", color: "#6C6B5D", fontSize: 11 }}>{c}</span>)}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => { setView("list"); loadSessions(); }}>Torna alla lista</button>
            {!isStaff && <button className="btn btn-ghost" onClick={generatePDF}>Scarica PDF</button>}
            {!isStaff && reportSession.status === "completato" && discrepancies.length > 0 && (
              <button className="btn btn-primary" onClick={alignStock}>Allinea magazzino</button>
            )}
          </div>
        </div>

        {/* Summary cards */}
        <div className="cards inv-kpi-report" style={{ marginBottom: 24 }}>
          <div className="card"><div className="label">Prodotti contati</div><div className="value tabular">{counted.length}/{reportCounts.length}</div></div>
          <div className="card" style={{ borderLeft: "3px solid #4F7B8C" }}>
            <div className="label">Accuratezza</div><div className="value tabular" style={{ color: accuracy < 95 ? "#9E3B2E" : "var(--ok)" }}>{accuracy.toFixed(1)}%</div>
          </div>
          <div className="card"><div className="label">Con differenze</div><div className="value tabular" style={{ color: discrepancies.length > 0 ? "#9E3B2E" : "var(--ok)" }}>{discrepancies.length}</div></div>
          {!isStaff && (
            <div className="card" style={{ borderLeft: totalAmmanchi > 0 ? "3px solid #9E3B2E" : undefined }}>
              <div className="label">Ammanchi</div><div className="value tabular" style={{ color: "#9E3B2E" }}>{eur(-totalAmmanchi)}</div>
            </div>
          )}
          {!isStaff && (
            <div className="card" style={{ borderLeft: totalEccedenze > 0 ? "3px solid #BFA762" : undefined }}>
              <div className="label">Eccedenze</div><div className="value tabular" style={{ color: "#BFA762" }}>+{eur(totalEccedenze)}</div>
            </div>
          )}
        </div>

        {/* Results grouped by category */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>{onlyDiffs ? `Differenze trovate (${discrepancies.length})` : `Tutti i conteggi (${counted.length})`}</h2>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
            <input type="checkbox" checked={onlyDiffs} onChange={e => setOnlyDiffs(e.target.checked)} style={{ accentColor: "#1F3326" }} />
            Solo differenze
          </label>
        </div>

        {reportGrouped.length > 0 ? reportGrouped.map(([cat, catRows]) => {
          const catDiffs = catRows.filter(c => (c.difference ?? 0) !== 0);
          return (
            <div key={cat} className="section" style={{ marginBottom: 16 }}>
              <div className="section-head" style={{ padding: "10px 18px" }}>
                <h2 style={{ fontSize: 14 }}>{cat}</h2>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  {catDiffs.length > 0 && <span className="badge" style={{ background: "rgba(158,59,46,.1)", color: "#9E3B2E", fontSize: 11 }}>{catDiffs.length} diff.</span>}
                  <span className="muted" style={{ fontSize: 12 }}>{catRows.length} prodotti</span>
                </div>
              </div>
              <div className="section-body" style={{ padding: 0, overflowX: "auto" }}>
                <table className="tbl">
                  <thead><tr><th>Prodotto</th><th className="num" style={{ textAlign: "right" }}>Teorico</th><th className="num" style={{ textAlign: "right" }}>Contato</th><th className="num" style={{ textAlign: "right" }}>Diff.</th>{!isStaff && <th className="num" style={{ textAlign: "right" }}>Val. diff.</th>}</tr></thead>
                  <tbody>
                    {catRows.map(c => {
                      const hasDiff = (c.difference ?? 0) !== 0;
                      const diffColor = (c.difference ?? 0) < 0 ? "#9E3B2E" : (c.difference ?? 0) > 0 ? "#BFA762" : "var(--ok)";
                      const rProd = products.find(p => p.product_id === c.product_id);
                      const rIsBottle = rProd?.tracking_type === "bottle";
                      const rPour = rProd?.standard_pour_ml ?? 30;
                      const mlSuffix = rIsBottle ? "ml" : "";
                      return (
                        <tr key={c.id} style={{ borderLeft: hasDiff ? `3px solid ${diffColor}` : undefined }}>
                          <td>
                            <strong>{c.products?.name ?? "?"}</strong>
                            {rIsBottle && <span className="badge" style={{ marginLeft: 6, background: "rgba(138,115,85,.12)", color: "#8A7355", fontSize: 9, padding: "1px 5px" }}>Bottiglia</span>}
                          </td>
                          <td className="tabular" style={{ textAlign: "right" }}>{c.expected_qty}{mlSuffix}{rIsBottle ? <span className="muted" style={{ fontSize: 10 }}> (~{Math.floor(c.expected_qty / rPour)} dosi)</span> : null}</td>
                          <td className="tabular" style={{ textAlign: "right", fontWeight: 600 }}>{c.counted_qty}{mlSuffix}{rIsBottle && c.counted_qty != null ? <span className="muted" style={{ fontSize: 10 }}> (~{Math.floor(c.counted_qty / rPour)} dosi)</span> : null}</td>
                          <td className="tabular" style={{ textAlign: "right", fontWeight: 700, color: diffColor }}>
                            {hasDiff ? `${(c.difference ?? 0) > 0 ? "+" : ""}${c.difference}${mlSuffix}` : "0"}
                            {rIsBottle && hasDiff ? <span style={{ fontSize: 10, fontWeight: 400 }}> (~{Math.floor(Math.abs(c.difference ?? 0) / rPour)} dosi)</span> : null}
                          </td>
                          {!isStaff && (
                            <td className="tabular" style={{ textAlign: "right", fontWeight: hasDiff ? 700 : 400, color: hasDiff ? diffColor : undefined }}>
                              {hasDiff ? eur(c.value_difference ?? 0) : "—"}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }) : (
          <div className="section">
            <div className="section-body" style={{ textAlign: "center", padding: "40px 20px" }}>
              <div className="serif" style={{ fontSize: 20, color: "var(--ok)", marginBottom: 6 }}>Nessuna differenza</div>
              <div className="muted">Tutte le giacenze corrispondono ai conteggi fisici.</div>
            </div>
          </div>
        )}

        <Toast toast={toast} />
      </>
    );
  }

  return null;
}
