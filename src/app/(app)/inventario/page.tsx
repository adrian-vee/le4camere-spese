"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { eur, fmtDate } from "@/lib/format";
import NewProductModal, { type SavedProduct } from "@/components/NewProductModal";
import BarcodeScanner from "@/components/BarcodeScanner";
import { useRole } from "@/lib/useRole";

type Product = { product_id: string; name: string; category: string; unit: string; unit_cost: number; current_stock: number; barcode: string | null };
type Session = { id: string; started_at: string; completed_at: string | null; status: string; operator_id: string | null; notes: string | null; total_products: number; counted_products: number; discrepancies_count: number; discrepancies_value: number; profiles?: { full_name: string } | null };
type Count = { id: string; session_id: string; product_id: string; expected_qty: number; counted_qty: number | null; difference: number | null; value_difference: number | null; counted_at: string | null; notes: string | null; products?: { name: string; category: string; unit: string; unit_cost: number; barcode: string | null } | null };

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
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "error" } | null>(null);
  const [reportSession, setReportSession] = useState<Session | null>(null);
  const [reportCounts, setReportCounts] = useState<Count[]>([]);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState("");
  const [onlyDiffs, setOnlyDiffs] = useState(false);
  const [newProdBarcode, setNewProdBarcode] = useState<string | null>(null);
  const [showCamScanner, setShowCamScanner] = useState(false);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const scanRef = useRef<HTMLInputElement>(null);

  function showToast(msg: string, type: "ok" | "error" = "ok") { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); }
  const fmtDT = (s: string) => { const d = new Date(s); return `${d.toLocaleDateString("it-IT")} ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`; };

  async function loadSessions() {
    setLoading(true);
    const [{ data: sess }, { data: prods }] = await Promise.all([
      supabase.from("inventory_sessions").select("*, profiles(full_name)").order("started_at", { ascending: false }).limit(20),
      supabase.from("stock_levels").select("product_id, name, category, unit, unit_cost, current_stock, barcode").eq("active", true).order("name"),
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

  async function startNewSession() {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: sess, error: sessErr } = await supabase.from("inventory_sessions").insert({
      operator_id: user?.id ?? null, total_products: products.length, status: "in_corso",
    }).select().single();
    if (sessErr || !sess) { showToast("Errore: " + (sessErr?.message ?? "sconosciuto"), "error"); setSaving(false); return; }

    const rows = products.map(p => ({
      session_id: sess.id, product_id: p.product_id, expected_qty: p.current_stock,
    }));
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
    const valDiff = diff !== null && c.products ? diff * c.products.unit_cost : null;
    setCounts(prev => prev.map(x => x.id === countId ? { ...x, counted_qty: counted, difference: diff, value_difference: valDiff, counted_at: counted !== null ? new Date().toISOString() : null } : x));
    await supabase.from("inventory_counts").update({
      counted_qty: counted, difference: diff, value_difference: valDiff, counted_at: counted !== null ? new Date().toISOString() : null,
    }).eq("id", countId);
    // Update session progress
    const newCounted = counts.filter(x => x.id === countId ? counted !== null : x.counted_qty !== null).length;
    await supabase.from("inventory_sessions").update({ counted_products: newCounted }).eq("id", activeSession?.id ?? "");
  }

  async function addCountNote(countId: string, note: string) {
    setCounts(prev => prev.map(x => x.id === countId ? { ...x, notes: note || null } : x));
    await supabase.from("inventory_counts").update({ notes: note || null }).eq("id", countId);
  }

  function handleScan(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    const found = counts.find(c => c.products?.barcode === trimmed);
    if (found) {
      const el = inputRefs.current[found.id];
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.focus(); }
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
    await supabase.from("inventory_sessions").update({ total_products: totalCount + 1 }).eq("id", activeSession.id);
    setCounts(prev => [...prev, countRow as Count]);
    // Focus on the new row after render
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
    await supabase.from("inventory_sessions").update({
      status: "completato", completed_at: new Date().toISOString(),
      counted_products: countedCount, discrepancies_count: diffs.length,
      discrepancies_value: Math.round(totalDiffVal * 100) / 100,
    }).eq("id", activeSession.id);
    setReportSession({ ...activeSession, status: "completato", completed_at: new Date().toISOString(), discrepancies_count: diffs.length, discrepancies_value: totalDiffVal });
    setReportCounts(counts);
    setActiveSession(null);
    setView("report");
  }

  async function pauseSession() {
    showToast("Inventario in pausa — riprendi quando vuoi");
    setView("list");
    loadSessions();
  }

  async function deleteSession(sessionId: string) {
    if (!confirm("Eliminare questa sessione di inventario? L'operazione è irreversibile.")) return;
    await supabase.from("inventory_counts").delete().eq("session_id", sessionId);
    await supabase.from("inventory_sessions").delete().eq("id", sessionId);
    if (activeSession?.id === sessionId) {
      setActiveSession(null);
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
    const movements = diffs.map(c => ({
      product_id: c.product_id,
      type: (c.difference ?? 0) > 0 ? "in" as const : "out" as const,
      quantity: Math.abs(c.difference ?? 0),
      notes: `Rettifica inventario ${fmtDate(reportSession.started_at)}`,
      created_by: user?.id ?? null,
    }));
    if (movements.length > 0) {
      const { error } = await supabase.from("stock_movements").insert(movements);
      if (error) return showToast("Errore: " + error.message, "error");
    }
    showToast(`Magazzino allineato: ${movements.length} rettifiche applicate`);
  }

  function generatePDF() {
    if (!reportSession) return;
    const diffs = reportCounts.filter(c => c.counted_qty !== null);
    const discrepancies = diffs.filter(c => (c.difference ?? 0) !== 0);
    const totalAmmanchi = discrepancies.filter(c => (c.difference ?? 0) < 0).reduce((s, c) => s + Math.abs(c.value_difference ?? 0), 0);
    const totalEccedenze = discrepancies.filter(c => (c.difference ?? 0) > 0).reduce((s, c) => s + (c.value_difference ?? 0), 0);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Inventario ${fmtDate(reportSession.started_at)}</title>
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
<div class="meta"><div>Data: ${fmtDate(reportSession.started_at)}${reportSession.completed_at ? " — " + fmtDate(reportSession.completed_at) : ""}</div><div>Operatore: ${reportSession.profiles?.full_name ?? "—"}</div></div>
<table><thead><tr><th>Prodotto</th><th>Categoria</th><th class="num">Teorico</th><th class="num">Contato</th><th class="num">Diff.</th><th class="num">Val. diff.</th></tr></thead><tbody>
${diffs.map(c => {
  const cls = (c.difference ?? 0) < 0 ? "neg" : (c.difference ?? 0) > 0 ? "pos" : "";
  return `<tr><td>${c.products?.name ?? "?"}</td><td>${c.products?.category ?? ""}</td><td class="num">${c.expected_qty}</td><td class="num">${c.counted_qty}</td><td class="num ${cls}">${(c.difference ?? 0) > 0 ? "+" : ""}${c.difference ?? 0}</td><td class="num ${cls}">${eur(c.value_difference ?? 0)}</td></tr>`;
}).join("")}
</tbody></table>
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
        <button className="btn btn-primary" style={{ padding: "12px 24px", fontSize: 15, fontWeight: 700 }} onClick={startNewSession} disabled={saving}>
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
      {toast && <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: toast.type === "ok" ? "#2D5A3D" : "#9E3B2E", color: "#FAF9F5", padding: "12px 24px", borderRadius: 10, fontSize: 14, fontWeight: 600, zIndex: 200, boxShadow: "0 4px 20px rgba(0,0,0,.25)" }}>{toast.msg}</div>}
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

      {/* Product list by category */}
      {grouped.map(([cat, items]) => (
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
              return (
                <div key={c.id} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 18px",
                  borderBottom: "1px solid var(--line)", borderLeft: `3px solid ${borderColor}`,
                  background: isCounted ? (hasDiff ? "rgba(158,59,46,.03)" : "rgba(45,90,61,.03)") : "transparent",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.products?.name ?? "?"}</div>
                    <div style={{ fontSize: 12, color: "var(--ink-soft)", display: "flex", gap: 8 }}>
                      <span>{c.products?.unit}</span>
                      {showTheoretical && <span>Teorico: <strong>{c.expected_qty}</strong></span>}
                      {c.products?.barcode && <span style={{ fontFamily: "'Courier New', monospace", fontSize: 11 }}>{c.products.barcode}</span>}
                    </div>
                  </div>
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
                        const idx = counts.findIndex(x => x.id === c.id);
                        const next = counts[idx + 1];
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
                  {isCounted && c.difference !== null && c.difference !== 0 && (
                    <div style={{ minWidth: 50, textAlign: "right", fontSize: 14, fontWeight: 700, color: (c.difference ?? 0) < 0 ? "#9E3B2E" : "#BFA762" }}>
                      {(c.difference ?? 0) > 0 ? "+" : ""}{c.difference}
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

      {toast && <div style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", background: toast.type === "ok" ? "#2D5A3D" : "#9E3B2E", color: "#FAF9F5", padding: "12px 24px", borderRadius: 10, fontSize: 14, fontWeight: 600, zIndex: 200, boxShadow: "0 4px 20px rgba(0,0,0,.25)" }}>{toast.msg}</div>}
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

    return (
      <>
        {invStyles}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 className="serif" style={{ fontSize: 24, fontWeight: 500 }}>Report inventario</h1>
            <div className="muted" style={{ marginTop: 4 }}>{fmtDate(reportSession.started_at)}{reportSession.completed_at ? " — " + fmtDate(reportSession.completed_at) : ""}</div>
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

        {/* Results table */}
        <div className="section">
          <div className="section-head">
            <h2>{onlyDiffs ? `Differenze trovate (${discrepancies.length})` : `Tutti i conteggi (${counted.length})`}</h2>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
              <input type="checkbox" checked={onlyDiffs} onChange={e => setOnlyDiffs(e.target.checked)} style={{ accentColor: "#1F3326" }} />
              Solo differenze
            </label>
          </div>
          <div className="section-body" style={{ padding: 0, overflowX: "auto" }}>
            {tableRows.length > 0 ? (
              <table className="tbl">
                <thead><tr><th>Prodotto</th><th>Categoria</th><th className="num" style={{ textAlign: "right" }}>Teorico</th><th className="num" style={{ textAlign: "right" }}>Contato</th><th className="num" style={{ textAlign: "right" }}>Diff.</th>{!isStaff && <th className="num" style={{ textAlign: "right" }}>Val. diff.</th>}</tr></thead>
                <tbody>
                  {tableRows.map(c => {
                    const hasDiff = (c.difference ?? 0) !== 0;
                    const diffColor = (c.difference ?? 0) < 0 ? "#9E3B2E" : (c.difference ?? 0) > 0 ? "#BFA762" : "var(--ok)";
                    return (
                      <tr key={c.id} style={{ borderLeft: hasDiff ? `3px solid ${diffColor}` : undefined }}>
                        <td><strong>{c.products?.name ?? "?"}</strong></td>
                        <td className="muted">{c.products?.category ?? ""}</td>
                        <td className="tabular" style={{ textAlign: "right" }}>{c.expected_qty}</td>
                        <td className="tabular" style={{ textAlign: "right", fontWeight: 600 }}>{c.counted_qty}</td>
                        <td className="tabular" style={{ textAlign: "right", fontWeight: 700, color: diffColor }}>
                          {hasDiff ? `${(c.difference ?? 0) > 0 ? "+" : ""}${c.difference}` : "0"}
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
            ) : (
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <div className="serif" style={{ fontSize: 20, color: "var(--ok)", marginBottom: 6 }}>Nessuna differenza</div>
                <div className="muted">Tutte le giacenze corrispondono ai conteggi fisici.</div>
              </div>
            )}
          </div>
        </div>

        {toast && <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: toast.type === "ok" ? "#2D5A3D" : "#9E3B2E", color: "#FAF9F5", padding: "12px 24px", borderRadius: 10, fontSize: 14, fontWeight: 600, zIndex: 200, boxShadow: "0 4px 20px rgba(0,0,0,.25)" }}>{toast.msg}</div>}
      </>
    );
  }

  return null;
}
