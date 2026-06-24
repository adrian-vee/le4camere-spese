"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { eur, fmtDate, isoToday } from "@/lib/format";
import NewProductModal, { type SavedProduct } from "@/components/NewProductModal";
import BarcodeScanner from "@/components/BarcodeScanner";
import { useRouter } from "next/navigation";
import { useRole } from "@/lib/useRole";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/Toast";
import { Modal } from "@/components/ui/Modal";
import BottleIndicator from "@/components/BottleIndicator";
import InventarioReportView from "./InventarioReportView";

type Product = { product_id: string; name: string; category: string; unit: string; unit_cost: number; current_stock: number; barcode: string | null; tracking_type: "units" | "bottle"; bottle_capacity_ml: number | null; standard_pour_ml: number | null };
type Session = { id: string; started_at: string; completed_at: string | null; status: string; operator_id: string | null; notes: string | null; total_products: number; counted_products: number; discrepancies_count: number; discrepancies_value: number; profiles?: { full_name: string } | null; aligned?: boolean };
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
  const router = useRouter();
  const { role, isManager, loading: roleLoading } = useRole();
  const isStaff = role === "staff";

  useEffect(() => {
    if (!roleLoading && !isManager) {
      router.replace("/");
    }
  }, [roleLoading, isManager, router]);

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
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

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
      if (collapsedCategories.has(foundCat)) {
        setCollapsedCategories(prev => { const n = new Set(prev); n.delete(foundCat); return n; });
      }
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
    if (collapsedCategories.has(newCat)) {
      setCollapsedCategories(prev => { const n = new Set(prev); n.delete(newCat); return n; });
    }
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

    // Anti-duplicate: check if already aligned
    const { data: sessCheck } = await supabase
      .from("inventory_sessions")
      .select("aligned")
      .eq("id", reportSession.id)
      .single();
    if (sessCheck?.aligned) {
      showToast("Magazzino già allineato per questa sessione");
      return;
    }

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
    const unitNegIds = unitDiffs.filter(c => (c.difference ?? 0) < 0).map(c => c.product_id);
    const unitPosBatches = unitDiffs.filter(c => (c.difference ?? 0) > 0).map(c => {
      const diff = c.difference ?? 0;
      return {
        product_id: c.product_id, quantity_initial: diff,
        quantity_remaining: diff, source: "manual" as const,
        notes: `Rettifica inventario ${fmtDate(reportSession.started_at)}`,
      };
    });

    if (unitPosBatches.length > 0) {
      const { error } = await supabase.from("product_batches").insert(unitPosBatches);
      if (error) return showToast("Errore batch positivi: " + error.message, "error");
    }

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

    // Mark session as aligned to prevent duplicate alignment
    await supabase.from("inventory_sessions").update({ aligned: true }).eq("id", reportSession.id);
    setReportSession({ ...reportSession, aligned: true });

    showToast(`Magazzino allineato: ${allMovements.length} rettifiche applicate`);
  }

  // ─── STYLES ───
  const invStyles = <style>{`
    .inv-kpi-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:14px}
    .inv-kpi-list{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
    .inv-kpi-report{display:grid;grid-template-columns:repeat(5,1fr);gap:14px}
    .inv-product-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;padding:16px}
    .inv-cat-header{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;cursor:pointer;user-select:none;transition:background .15s}
    .inv-cat-header:hover{background:rgba(191,167,98,.06)}
    .inv-pill-bar{display:flex;gap:6px;overflow-x:auto;padding:6px 0 10px;scrollbar-width:thin}
    .inv-pill-bar::-webkit-scrollbar{height:4px}
    .inv-pill-bar::-webkit-scrollbar-thumb{background:#D8CCB8;border-radius:4px}
    .inv-card{background:#fff;border:1px solid #D8CCB8;border-radius:12px;padding:16px;overflow:hidden;box-shadow:0 2px 8px rgba(31,51,38,.04);transition:border-color .2s,box-shadow .2s}
    .inv-card:hover{box-shadow:0 4px 12px rgba(31,51,38,.08)}
    .inv-card.counted{border-left:3px solid #2d6a4f}
    .inv-card.has-diff{border-left:3px solid #C4453C}
    .inv-card.has-surplus{border-left:3px solid #BFA762}
    .inv-mark-btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;margin-top:12px;padding:8px 0;border:1px dashed #D8CCB8;border-radius:8px;background:none;color:#6C6B5D;font-family:'Albert Sans',sans-serif;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s}
    .inv-mark-btn:hover{background:#F3EBDD;border-color:#2d6a4f;color:#2d6a4f}
    .inv-input{width:100%;height:44px;text-align:center;border:2px solid #D8CCB8;border-radius:10px;font-family:'Fraunces',serif;font-size:22px;font-weight:600;color:#1F3326;background:#FAF9F5;transition:border-color .2s,box-shadow .2s;outline:none}
    .inv-input:focus{border-color:#BFA762;box-shadow:0 0 0 3px rgba(191,167,98,.15)}
    .inv-input.counted{border-color:#2d6a4f;background:#fff}
    .inv-input.has-diff{border-color:#C4453C}
    .inv-sess-card{background:#fff;border:1px solid #D8CCB8;border-radius:16px;padding:20px;box-shadow:0 2px 8px rgba(31,51,38,.04);cursor:pointer;transition:all .2s}
    .inv-sess-card:hover{box-shadow:0 4px 16px rgba(31,51,38,.08);border-color:#BFA762}
    .inv-chevron{transition:transform .2s ease}
    .inv-chevron.collapsed{transform:rotate(-90deg)}
    @media(max-width:1023px){
      .inv-kpi-grid{grid-template-columns:repeat(3,1fr)}
      .inv-kpi-report{grid-template-columns:repeat(3,1fr)}
      .inv-bottom-bar{bottom:72px!important}
    }
    @media(max-width:820px){
      .inv-kpi-grid{grid-template-columns:1fr 1fr}
      .inv-kpi-list{grid-template-columns:1fr 1fr}
      .inv-kpi-report{grid-template-columns:1fr 1fr}
    }
    @media(max-width:600px){
      .inv-product-grid{grid-template-columns:1fr;padding:12px}
      .inv-kpi-grid{grid-template-columns:1fr}
      .inv-kpi-list{grid-template-columns:1fr}
      .inv-kpi-report{grid-template-columns:1fr}
    }
  `}</style>;

  function toggleCategory(cat: string) {
    setCollapsedCategories(prev => {
      const n = new Set(prev);
      if (n.has(cat)) n.delete(cat); else n.add(cat);
      return n;
    });
  }

  if (roleLoading || !isManager) {
    return <div style={{ padding: 40, textAlign: "center", color: "#6C6B5D", fontFamily: "'Albert Sans', sans-serif" }}>Caricamento...</div>;
  }

  if (loading) return <div className="empty">Caricamento...</div>;

  // ── LIST VIEW ──
  if (view === "list") return (
    <>
      {invStyles}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, color: "#1F3326", margin: 0 }}>Inventario</h1>
          <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#6C6B5D", margin: "4px 0 0" }}>Gestione inventari e controllo giacenze</p>
        </div>
        <button onClick={() => { setSelectedCategories(new Set(allCategories.map(([c]) => c))); setShowCategoryPicker(true); }} disabled={saving}
          style={{
            background: "#1F3326", color: "#fff", border: "none", borderRadius: 10, padding: "14px 28px",
            fontSize: 15, fontWeight: 700, fontFamily: "'Albert Sans', sans-serif", cursor: saving ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", gap: 8, opacity: saving ? .7 : 1, transition: "opacity .15s",
          }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
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
          <div className="inv-kpi-list" style={{ marginBottom: 28 }}>
            {[
              { label: "Ultimo inventario", value: daysSinceLast !== null ? `${daysSinceLast}` : "—", sub: daysSinceLast !== null ? "giorni fa" : "", color: daysSinceLast !== null && daysSinceLast > 30 ? "#9E3B2E" : "#2D5A3D" },
              { label: "Accuratezza media", value: avgAccuracy !== null ? `${avgAccuracy.toFixed(1)}%` : "—", sub: "", color: avgAccuracy !== null && avgAccuracy < 95 ? "#9E3B2E" : "#4F7B8C" },
              ...(!isStaff ? [{ label: "Differenze cumulate", value: eur(totalShortfall), sub: "", color: totalShortfall > 0 ? "#9E3B2E" : "#BFA762" }] : []),
            ].map((kpi, i) => (
              <div key={i} style={{
                background: "#fff", border: "1px solid #D8CCB8", borderRadius: 16, padding: "18px 20px",
                borderTop: `3px solid ${kpi.color}`, boxShadow: "0 2px 8px rgba(31,51,38,.04)",
              }}>
                <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 12, color: "#6C6B5D", textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>{kpi.label}</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: kpi.color, lineHeight: 1 }}>{kpi.value}</div>
                {kpi.sub && <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 12, color: "#6C6B5D", marginTop: 2 }}>{kpi.sub}</div>}
              </div>
            ))}
          </div>
        );
      })()}

      {sessions.length === 0 ? (
        <div style={{
          background: "#fff", border: "1px solid #D8CCB8", borderRadius: 16, padding: "60px 24px",
          textAlign: "center", boxShadow: "0 2px 8px rgba(31,51,38,.04)",
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#D8CCB8" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 16 }}>
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
            <rect x="9" y="3" width="6" height="4" rx="1"/>
            <line x1="9" y1="12" x2="15" y2="12"/>
            <line x1="9" y1="16" x2="13" y2="16"/>
          </svg>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, color: "#1F3326", marginBottom: 6 }}>Nessun inventario</div>
          <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#6C6B5D" }}>Avvia il primo inventario per verificare le giacenze del magazzino.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {(isStaff ? sessions.slice(0, 1) : sessions).map(s => {
            const isActive = s.status === "in_corso";
            const prog = s.total_products > 0 ? (s.counted_products / s.total_products) * 100 : 0;
            return (
              <div key={s.id} className="inv-sess-card"
                style={{ borderLeft: `4px solid ${isActive ? "#4F7B8C" : "#2D5A3D"}` }}
                onClick={() => isActive ? (setActiveSession(s), setStartTime(new Date(s.started_at)), loadCounts(s.id).then(() => setView("counting"))) : viewReport(s)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ fontFamily: "'Albert Sans', sans-serif", fontWeight: 700, fontSize: 16, color: "#1F3326" }}>{fmtDate(s.started_at)}</div>
                    <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: "#6C6B5D", marginTop: 4 }}>Operatore: {s.profiles?.full_name ?? "—"}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                      fontFamily: "'Albert Sans', sans-serif",
                      background: isActive ? "#E3EEF5" : "#E3EEE4",
                      color: isActive ? "#4F7B8C" : "#2D5A3D",
                    }}>
                      {isActive ? "In corso" : "Completato"}
                    </span>
                    {(() => { try { const n = s.notes ? JSON.parse(s.notes) : null; if (n?.categories) return <span style={{ padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 600, fontFamily: "'Albert Sans', sans-serif", background: "#FDF6E3", color: "#C77B4A" }}>Parziale · {n.categories.length} cat.</span>; } catch {} return null; })()}
                    {!isStaff && (
                      <button style={{
                        background: "none", border: "1px solid rgba(158,59,46,.2)", borderRadius: 8,
                        padding: "4px 10px", fontSize: 12, color: "#9E3B2E", cursor: "pointer",
                        fontFamily: "'Albert Sans', sans-serif", fontWeight: 600,
                      }}
                        onClick={e => { e.stopPropagation(); deleteSession(s.id); }}>
                        Elimina
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 24, marginTop: 14, fontSize: 13, fontFamily: "'Albert Sans', sans-serif", color: "#6C6B5D" }}>
                  <div>Prodotti: <strong style={{ color: "#1F3326" }}>{s.counted_products}/{s.total_products}</strong></div>
                  {s.status === "completato" && (
                    <>
                      <div>Differenze: <strong style={{ color: s.discrepancies_count > 0 ? "#9E3B2E" : "#2D5A3D" }}>{s.discrepancies_count}</strong></div>
                      {!isStaff && <div>Valore diff: <strong style={{ color: s.discrepancies_value !== 0 ? "#9E3B2E" : undefined }}>{eur(s.discrepancies_value)}</strong></div>}
                    </>
                  )}
                </div>
                {isActive && (
                  <div style={{ marginTop: 12, background: "#F3EBDD", borderRadius: 8, height: 8, overflow: "hidden" }}>
                    <div style={{ width: `${prog}%`, background: "#4F7B8C", height: "100%", borderRadius: 8, transition: "width .3s" }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Category Picker Modal */}
      <Modal isOpen={showCategoryPicker} onClose={() => setShowCategoryPicker(false)} title="Nuovo inventario" maxWidth={500}>
        <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: "#6C6B5D", margin: "-8px 0 12px" }}>Scegli quali categorie inventariare</p>
        <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
          <button onClick={() => setSelectedCategories(new Set(allCategories.map(([c]) => c)))}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#BFA762", padding: 0, fontFamily: "'Albert Sans', sans-serif" }}>
            Seleziona tutte
          </button>
          <button onClick={() => setSelectedCategories(new Set())}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#BFA762", padding: 0, fontFamily: "'Albert Sans', sans-serif" }}>
            Deseleziona tutte
          </button>
        </div>

        <div style={{ overflowY: "auto", maxHeight: "calc(100dvh - 320px)", display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
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
                <span style={{ flex: 1, fontWeight: 600, fontSize: 15, color: "#1F3326", fontFamily: "'Albert Sans', sans-serif" }}>{cat}</span>
                <span style={{
                  background: "#F3EBDD", color: "#6C6B5D", fontSize: 13, fontWeight: 600,
                  padding: "4px 12px", borderRadius: 20, whiteSpace: "nowrap", fontFamily: "'Albert Sans', sans-serif",
                }}>{count} prodott{count === 1 ? "o" : "i"}</span>
              </div>
            );
          })}
        </div>

        <div style={{ borderTop: "1px solid #D8CCB8", paddingTop: 16 }}>
          <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: "#6C6B5D", marginBottom: 14 }}>
            {selectedCategories.size}/{allCategories.length} categorie · {products.filter(p => selectedCategories.has(p.category || "Altro")).length} prodotti
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setShowCategoryPicker(false)} style={{
              background: "transparent", border: "1px solid #D8CCB8", color: "#1F3326",
              borderRadius: 10, padding: "12px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer",
              fontFamily: "'Albert Sans', sans-serif", transition: "background .15s",
            }} onMouseEnter={e => (e.currentTarget.style.background = "#F3EBDD")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>Annulla</button>
            <button disabled={selectedCategories.size === 0 || saving} onClick={startNewSession} style={{
              background: selectedCategories.size === 0 ? "#aaa" : "#1F3326", color: "#fff",
              border: "none", borderRadius: 10, padding: "12px 24px", fontSize: 14, fontWeight: 700,
              fontFamily: "'Albert Sans', sans-serif",
              cursor: selectedCategories.size === 0 ? "not-allowed" : "pointer",
              transition: "opacity .15s", opacity: saving ? 0.7 : 1,
            }}>{saving ? "Creazione..." : "Avvia inventario"}</button>
          </div>
        </div>
      </Modal>

      <Toast toast={toast} />
    </>
  );

  // ── COUNTING VIEW ──
  if (view === "counting") {
    const categoriesWithDiffs = new Set(
      counts.filter(c => c.counted_qty !== null && c.difference !== null && c.difference !== 0).map(c => c.products?.category ?? "Altro")
    );

    return (
      <>
        {invStyles}
        {/* Dashboard Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, color: "#1F3326", margin: 0 }}>Conta inventario</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: "'Albert Sans', sans-serif" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: "#6C6B5D" }}>
                <input type="checkbox" checked={showTheoretical} onChange={e => setShowTheoretical(e.target.checked)} style={{ accentColor: "#1F3326" }} />
                Mostra teorico
              </label>
            </div>
          </div>

          {/* KPI Dashboard */}
          <div style={{
            background: "#fff", borderRadius: 16, padding: "22px 24px", marginBottom: 16,
            border: "1px solid #D8CCB8", boxShadow: "0 2px 8px rgba(31,51,38,.04)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, color: "#1F3326", lineHeight: 1 }}>{countedCount}</span>
                <span style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 16, color: "#888" }}>/ {totalCount} prodotti</span>
              </div>
              <div style={{ display: "flex", gap: 20, fontFamily: "'Albert Sans', sans-serif", fontSize: 13 }}>
                {elapsed && (
                  <div style={{ color: "#888" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" style={{ verticalAlign: "-2px", marginRight: 4 }}>
                      <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                    </svg>
                    {elapsed}
                  </div>
                )}
                <div style={{ color: progress === 100 ? "#2d6a4f" : "#1F3326", fontWeight: 700 }}>
                  {Math.round(progress)}%
                </div>
              </div>
            </div>
            {/* Progress bar */}
            <div style={{ background: "#F3EBDD", borderRadius: 8, height: 10, overflow: "hidden" }}>
              <div style={{
                width: `${progress}%`, height: "100%", borderRadius: 8,
                background: "#BFA762",
                transition: "width .5s ease",
              }} />
            </div>
            {/* Mini KPIs */}
            <div style={{ display: "flex", gap: 28, marginTop: 16, flexWrap: "wrap" }}>
              {[
                { label: "Categorie", value: `${grouped.filter(([cat]) => categoryProgress[cat]?.counted === categoryProgress[cat]?.total).length}/${grouped.length}`, color: "#1F3326" },
                { label: "Da contare", value: `${totalCount - countedCount}`, color: "#1F3326" },
                { label: "Con differenze", value: `${counts.filter(c => c.counted_qty !== null && c.difference !== null && c.difference !== 0).length}`, color: counts.filter(c => c.counted_qty !== null && c.difference !== null && c.difference !== 0).length > 0 ? "#C4453C" : "#2d6a4f" },
              ].map((k, i) => (
                <div key={i} style={{ fontFamily: "'Albert Sans', sans-serif" }}>
                  <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: .5 }}>{k.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 600, color: k.color, fontFamily: "'Fraunces', serif", lineHeight: 1.2 }}>{k.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Scan bar */}
        <div style={{
          background: "#F3EBDD", padding: "10px 16px", borderRadius: 12, marginBottom: 14,
          border: "1px solid #D8CCB8", display: "flex", alignItems: "center", gap: 10,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="2" strokeLinecap="round">
            <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
            <path d="M8 7v10M12 7v10M16 7v10" />
          </svg>
          <input ref={scanRef} value={scanInput} onChange={e => setScanInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleScan(scanInput); } }}
            placeholder="Scansiona barcode..."
            style={{
              flex: 1, background: "#fff", border: "1px solid #D8CCB8",
              borderRadius: 8, padding: "8px 12px", color: "#1F3326", fontSize: 14,
              fontFamily: "'Albert Sans', sans-serif", outline: "none",
            }} />
          <button onClick={() => setShowCamScanner(true)} title="Scansiona con fotocamera"
            style={{ background: "#fff", border: "1px solid #D8CCB8", borderRadius: 8, padding: "7px 10px", cursor: "pointer", display: "flex" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" />
            </svg>
          </button>
        </div>
        {showCamScanner && <BarcodeScanner onScan={(code) => handleScan(code)} onClose={() => setShowCamScanner(false)} />}

        {/* Category pills */}
        {grouped.length > 1 && (
          <div ref={tabsRef} className="inv-pill-bar" style={{ position: "sticky", top: 0, zIndex: 10, background: "#FAF9F5", marginBottom: 8 }}>
            {grouped.map(([cat]) => {
              const cp = categoryProgress[cat];
              const isAct = activeCategory === cat;
              const isDone = cp && cp.counted === cp.total;
              const hasCatDiffs = categoriesWithDiffs.has(cat);
              return (
                <button key={cat} type="button"
                  onClick={() => {
                    setActiveCategory(cat);
                    if (collapsedCategories.has(cat)) toggleCategory(cat);
                  }}
                  style={{
                    flex: "0 0 auto", padding: "8px 16px", borderRadius: 20,
                    border: isAct ? "2px solid #1F3326" : isDone ? "1px solid #2d6a4f" : "1px solid #D8CCB8",
                    background: isAct ? "#1F3326" : isDone ? "#2d6a4f" : "#F3EBDD",
                    color: isAct ? "#FAF9F5" : isDone ? "#fff" : "#1F3326",
                    fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                    fontFamily: "'Albert Sans', sans-serif",
                    display: "flex", alignItems: "center", gap: 8, transition: "all .15s",
                  }}>
                  {isDone && !isAct && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
                  {hasCatDiffs && !isDone && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#C4453C", flexShrink: 0 }} />}
                  <span>{cat}</span>
                  <span style={{
                    fontSize: 11, padding: "2px 8px", borderRadius: 12, fontWeight: 700,
                    background: isAct ? "rgba(255,255,255,.2)" : isDone ? "rgba(255,255,255,.25)" : "rgba(31,51,38,.08)",
                    color: isAct ? "#BFA762" : isDone ? "#fff" : "#6C6B5D",
                  }}>{cp?.counted ?? 0}/{cp?.total ?? 0}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Category sections */}
        {grouped.filter(([cat]) => !activeCategory || cat === activeCategory).map(([cat, items]) => {
          const cp = categoryProgress[cat];
          const isDone = cp && cp.counted === cp.total;
          const isCollapsed = collapsedCategories.has(cat);
          const catProg = cp ? (cp.total > 0 ? (cp.counted / cp.total) * 100 : 0) : 0;

          return (
            <div key={cat} style={{
              background: "#fff", border: "1px solid #D8CCB8", borderRadius: 16,
              marginBottom: 12, overflow: "hidden", boxShadow: "0 2px 8px rgba(31,51,38,.04)",
            }}>
              {/* Category header */}
              <div className="inv-cat-header" onClick={() => toggleCategory(cat)}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <svg className={`inv-chevron${isCollapsed ? " collapsed" : ""}`} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6C6B5D" strokeWidth="2" strokeLinecap="round">
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                  <div>
                    <div style={{ fontFamily: "'Albert Sans', sans-serif", fontWeight: 700, fontSize: 15, color: "#1F3326" }}>{cat}</div>
                    <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 12, color: "#6C6B5D", marginTop: 2 }}>
                      {cp?.counted ?? 0} di {cp?.total ?? 0} contati
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {isDone && (
                    <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "#E3EEE4", color: "#2D5A3D", fontFamily: "'Albert Sans', sans-serif" }}>
                      Completata
                    </span>
                  )}
                  {/* Mini progress */}
                  <div style={{ width: 60, background: "#F3EBDD", borderRadius: 6, height: 6, overflow: "hidden" }}>
                    <div style={{
                      width: `${catProg}%`, height: "100%", borderRadius: 6,
                      background: isDone ? "#2D5A3D" : "#4F7B8C", transition: "width .4s ease",
                    }} />
                  </div>
                </div>
              </div>

              {/* Product cards grid */}
              {!isCollapsed && (
                <div className="inv-product-grid">
                  {items.map(c => {
                    const isCounted = c.counted_qty !== null;
                    const hasDiff = isCounted && c.difference !== null && c.difference !== 0;
                    const diffNeg = (c.difference ?? 0) < 0;
                    const prod = products.find(p => p.product_id === c.product_id);
                    const isBottle = prod?.tracking_type === "bottle";
                    const bNotes = isBottle ? parseBottleNotes(c.notes) : null;
                    const bCap = prod?.bottle_capacity_ml ?? 700;
                    const bPour = prod?.standard_pour_ml ?? 30;

                    const cardClass = `inv-card${isCounted && !hasDiff ? " counted" : ""}${hasDiff ? (diffNeg ? " has-diff" : " has-surplus") : ""}`;

                    return (
                      <div key={c.id} className={cardClass}>
                        {/* Product header */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 8 }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{
                              fontFamily: "'Albert Sans', sans-serif", fontWeight: 500, fontSize: 14, color: "#1F3326",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {c.products?.name ?? "?"}
                            </div>
                            <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 11, color: "#888", marginTop: 2, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                              <span>{c.products?.unit}</span>
                              {isBottle && (
                                <span style={{ padding: "1px 8px", borderRadius: 10, fontSize: 10, fontWeight: 600, background: "rgba(138,115,85,.12)", color: "#8A7355" }}>
                                  {bCap}ml
                                </span>
                              )}
                              {c.products?.barcode && (
                                <span style={{ fontFamily: "'Courier New', monospace", fontSize: 10, color: "#999" }}>{c.products.barcode}</span>
                              )}
                            </div>
                          </div>
                          {/* Status indicator */}
                          {isCounted && !hasDiff && (
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                              background: "rgba(45,106,79,.1)", color: "#2d6a4f",
                              fontFamily: "'Albert Sans', sans-serif",
                            }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2d6a4f" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                              Contato
                            </span>
                          )}
                          {hasDiff && (
                            <div style={{
                              fontFamily: "'Albert Sans', sans-serif", fontSize: 13, fontWeight: 700,
                              color: diffNeg ? "#C4453C" : "#BFA762", whiteSpace: "nowrap",
                            }}>
                              {isBottle
                                ? `${(c.difference ?? 0) > 0 ? "+" : ""}${c.difference}ml`
                                : `${(c.difference ?? 0) > 0 ? "+" : ""}${c.difference}`
                              }
                            </div>
                          )}
                        </div>

                        {/* Theoretical qty */}
                        {showTheoretical && (
                          <div style={{
                            fontFamily: "'Albert Sans', sans-serif", fontSize: 12, color: "#6C6B5D",
                            background: "#F3EBDD", borderRadius: 8, padding: "6px 10px", marginBottom: 12,
                          }}>
                            Teorico: <strong>{isBottle ? `${c.expected_qty}ml (~${Math.floor(c.expected_qty / bPour)} dosi)` : c.expected_qty}</strong>
                          </div>
                        )}

                        {/* Input section */}
                        {isBottle ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {/* Closed bottles */}
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 12, color: "#6C6B5D", fontWeight: 600, minWidth: 50 }}>Chiuse</div>
                              <input
                                ref={el => { inputRefs.current[c.id] = el; }}
                                type="number" min="0" step="1"
                                inputMode="numeric"
                                value={bNotes?.closed ?? ""}
                                placeholder="0"
                                onChange={e => {
                                  const closed = e.target.value === "" ? 0 : Number(e.target.value);
                                  updateBottleCount(c.id, closed, bNotes?.levels ?? []);
                                }}
                                className={`inv-input${isCounted ? (hasDiff ? " has-diff" : " counted") : ""}`}
                                style={{ width: 64, height: 44, fontSize: 18 }}
                              />
                              {(bNotes?.closed ?? 0) > 0 && (
                                <span style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 11, color: "#6C6B5D" }}>
                                  = {(bNotes?.closed ?? 0) * bCap}ml
                                </span>
                              )}
                            </div>

                            {/* Open bottles */}
                            {(bNotes?.levels ?? []).map((lvl, idx) => (
                              <div key={idx} style={{ borderTop: "1px solid #F3EBDD", paddingTop: 10 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, overflow: "hidden" }}>
                                  <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 12, color: "#8A7355", fontWeight: 600, minWidth: 50, flexShrink: 0 }}>
                                    Aperta{(bNotes?.levels.length ?? 0) > 1 ? ` #${idx + 1}` : ""}
                                  </div>
                                  <div className="bottle-level-selector" style={{ overflow: "hidden", flexShrink: 1, minWidth: 0 }}>
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
                                  <button type="button" style={{
                                    background: "none", border: "1px solid rgba(158,59,46,.2)", borderRadius: 6,
                                    padding: "2px 8px", fontSize: 12, color: "#9E3B2E", cursor: "pointer",
                                    flexShrink: 0, lineHeight: 1.2,
                                  }}
                                    onClick={() => {
                                      const newLevels = (bNotes?.levels ?? []).filter((_, i) => i !== idx);
                                      updateBottleCount(c.id, bNotes?.closed ?? 0, newLevels);
                                    }}>✕</button>
                                </div>
                                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginTop: 4 }}>
                                  <BottleIndicator fillLevel={lvl} size="md" showLabel capacityMl={bCap} />
                                  <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 11, color: "#6C6B5D", paddingBottom: 2 }}>
                                    ~{Math.round(lvl * bCap / 10)}ml · ~{Math.floor(lvl * bCap / 10 / bPour)} dosi
                                  </div>
                                </div>
                              </div>
                            ))}

                            {/* Add open bottle */}
                            <button type="button" style={{
                              fontFamily: "'Albert Sans', sans-serif", fontSize: 12, padding: "6px 12px",
                              color: "#8A7355", background: "none",
                              border: "1px dashed rgba(138,115,85,.3)", borderRadius: 8,
                              alignSelf: "flex-start", cursor: "pointer",
                            }}
                              onClick={() => updateBottleCount(c.id, bNotes?.closed ?? 0, [...(bNotes?.levels ?? []), 10])}>
                              + Aggiungi bottiglia aperta
                            </button>

                            {/* Total */}
                            {isCounted && (
                              <div style={{
                                fontFamily: "'Albert Sans', sans-serif", fontSize: 12, fontWeight: 700, color: "#8A7355",
                                borderTop: "1px solid #F3EBDD", paddingTop: 8,
                              }}>
                                Totale: {c.counted_qty}ml · ~{Math.floor((c.counted_qty ?? 0) / bPour)} dosi
                              </div>
                            )}
                          </div>
                        ) : (
                          <input
                            ref={el => { inputRefs.current[c.id] = el; }}
                            type="number" min="0" step="1"
                            inputMode="numeric"
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
                            className={`inv-input${isCounted ? (hasDiff ? " has-diff" : " counted") : ""}`}
                          />
                        )}

                        {/* Mark as counted button */}
                        {!isCounted && (
                          <button type="button" className="inv-mark-btn"
                            onClick={() => {
                              if (isBottle) {
                                updateBottleCount(c.id, bNotes?.closed ?? 0, bNotes?.levels ?? []);
                              } else {
                                updateCount(c.id, c.expected_qty);
                              }
                            }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                            Segna come contato
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Next category button */}
        {activeCategory && categoryProgress[activeCategory]?.counted === categoryProgress[activeCategory]?.total && (() => {
          const nextCat = grouped.find(([cat]) => {
            if (cat === activeCategory) return false;
            const cp = categoryProgress[cat];
            return cp && cp.counted < cp.total;
          });
          if (!nextCat) return null;
          return (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <button onClick={() => { setActiveCategory(nextCat[0]); if (collapsedCategories.has(nextCat[0])) toggleCategory(nextCat[0]); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                style={{
                  background: "#1F3326", color: "#FAF9F5", border: "none", borderRadius: 12,
                  padding: "14px 28px", fontSize: 15, fontWeight: 700, cursor: "pointer",
                  fontFamily: "'Albert Sans', sans-serif",
                  display: "inline-flex", alignItems: "center", gap: 8,
                }}>
                Vai a: {nextCat[0]}
                <span style={{ fontSize: 12, opacity: .7 }}>({categoryProgress[nextCat[0]]?.counted}/{categoryProgress[nextCat[0]]?.total})</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
            </div>
          );
        })()}

        {/* Bottom action bar */}
        <div className="inv-bottom-bar" style={{
          position: "sticky", bottom: 0, left: 0, right: 0, padding: "16px 20px",
          background: "#fff", borderTop: "1px solid #D8CCB8",
          display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap",
          boxShadow: "0 -2px 12px rgba(0,0,0,.06)",
          zIndex: 20,
        }}>
          <button onClick={() => activeSession && deleteSession(activeSession.id)}
            style={{
              background: "#fff", border: "1px solid #C4453C", borderRadius: 10,
              padding: "10px 18px", fontSize: 13, color: "#C4453C", fontWeight: 600, cursor: "pointer",
              fontFamily: "'Albert Sans', sans-serif",
            }}>
            Annulla
          </button>
          <button onClick={pauseSession}
            style={{
              background: "#F3EBDD", border: "1px solid #D8CCB8", borderRadius: 10,
              padding: "10px 18px", fontSize: 13, color: "#1F3326", fontWeight: 600, cursor: "pointer",
              fontFamily: "'Albert Sans', sans-serif",
            }}>
            Pausa
          </button>
          <button onClick={() => closeSession()} disabled={countedCount === 0}
            style={{
              background: countedCount === 0 ? "#aaa" : "#1F3326", color: "#fff",
              border: "none", borderRadius: 10, padding: "12px 32px", fontSize: 15, fontWeight: 700,
              cursor: countedCount === 0 ? "not-allowed" : "pointer",
              fontFamily: "'Albert Sans', sans-serif",
              display: "flex", alignItems: "center", gap: 8,
            }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
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
  }

  // ── REPORT VIEW ──
  if (view === "report" && reportSession) {
    return (
      <InventarioReportView
        reportSession={reportSession}
        reportCounts={reportCounts}
        products={products}
        isStaff={isStaff}
        onlyDiffs={onlyDiffs}
        setOnlyDiffs={setOnlyDiffs}
        onBack={() => { setView("list"); loadSessions(); }}
        onAlignStock={alignStock}
        invStyles={invStyles}
        toastNode={<Toast toast={toast} />}
      />
    );
  }

  return null;
}
