"use client";

import { useRef, useState } from "react";
import { eur } from "@/lib/format";
import type { SupabaseClient } from "@supabase/supabase-js";
import NewProductModal, { type SavedProduct } from "@/components/NewProductModal";
import BarcodeScanner from "@/components/BarcodeScanner";

type Product = {
  product_id: string; name: string; category: string; unit: string;
  unit_cost: number; current_stock: number; barcode: string | null;
};
type Supplier = { id: string; name: string };
type CaricoItem = { product_id: string; name: string; unit: string; qty: number; unit_cost: number; notes: string; expiry_date: string };

export default function CaricoModal({ products, suppliers, supabase, onClose, onDone, showToast }: {
  products: Product[];
  suppliers: Supplier[];
  supabase: SupabaseClient;
  onClose: () => void;
  onDone: () => void;
  showToast: (msg: string, type?: "ok" | "warn" | "error") => void;
}) {
  const [supplierName, setSupplierName] = useState("");
  const [ddt, setDdt] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<CaricoItem[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [bollaUrl, setBollaUrl] = useState<string | null>(null);
  const [newProdBarcode, setNewProdBarcode] = useState<string | null>(null);
  const [localProducts, setLocalProducts] = useState(products);
  const [showCamScanner, setShowCamScanner] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function addProduct(p: Product) {
    if (items.find(i => i.product_id === p.product_id)) {
      setItems(items.map(i => i.product_id === p.product_id ? { ...i, qty: i.qty + 1 } : i));
    } else {
      setItems([...items, { product_id: p.product_id, name: p.name, unit: p.unit, qty: 1, unit_cost: p.unit_cost, notes: "", expiry_date: "" }]);
    }
    setSearchQ("");
  }

  function handleScan(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    const found = localProducts.find(p => p.barcode === trimmed);
    if (found) addProduct(found);
    else setNewProdBarcode(trimmed);
    setSearchQ("");
  }

  function handleNewProductSaved(saved: SavedProduct) {
    setNewProdBarcode(null);
    const newProd: Product = {
      product_id: saved.id, name: saved.name, category: saved.category,
      unit: saved.unit, unit_cost: saved.unit_cost, current_stock: 0,
      barcode: saved.barcode,
    };
    setLocalProducts(prev => [...prev, newProd]);
    addProduct(newProd);
    showToast(`Prodotto "${saved.name}" creato e aggiunto`);
  }

  function removeItem(pid: string) {
    setItems(items.filter(i => i.product_id !== pid));
  }

  function updateItem(pid: string, field: keyof CaricoItem, val: string | number) {
    setItems(items.map(i => i.product_id === pid ? { ...i, [field]: val } : i));
  }

  const totalPcs = items.reduce((s, i) => s + i.qty, 0);
  const totalVal = items.reduce((s, i) => s + i.qty * i.unit_cost, 0);

  const searchResults = searchQ.length >= 2
    ? localProducts.filter(p => p.name.toLowerCase().includes(searchQ.toLowerCase())).slice(0, 8)
    : [];

  async function uploadBolla(file: File) {
    if (file.size > 5 * 1024 * 1024) return showToast("File troppo grande (max 5MB)", "error");
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `bolle/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("documenti").upload(path, file);
    if (error) { showToast("Errore upload: " + error.message, "error"); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from("documenti").getPublicUrl(path);
    setBollaUrl(publicUrl);
    setUploading(false);
  }

  async function confirm() {
    if (items.length === 0) return showToast("Aggiungi almeno un prodotto", "warn");
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const batchNote = [
      supplierName && `Fornitore: ${supplierName}`,
      ddt && `DDT: ${ddt}`,
      notes,
    ].filter(Boolean).join(" | ");

    const rows = items.map(i => ({
      product_id: i.product_id,
      type: "in" as const,
      quantity: i.qty,
      notes: [batchNote, i.notes].filter(Boolean).join(" — ") || null,
      created_by: user?.id ?? null,
      expiry_date: i.expiry_date || null,
    }));

    const { error } = await supabase.from("stock_movements").insert(rows);
    if (error) { showToast("Errore: " + error.message, "error"); setSaving(false); return; }
    showToast(`Carico registrato: ${totalPcs} pezzi, ${eur(totalVal)}`);
    onDone();
    onClose();
    setSaving(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 700, maxHeight: "90vh" }} onClick={e => e.stopPropagation()}>
        <div className="section-head" style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
          <h2>Carico merce</h2>
          <button className="btn-ghost" style={{ padding: "4px 10px", borderRadius: 8 }} onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
          {/* Header info */}
          <div className="grid2">
            <div className="field">
              <label>Fornitore</label>
              <input list="supplier-list" value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="Nome fornitore" />
              <datalist id="supplier-list">
                {suppliers.map(s => <option key={s.id} value={s.name} />)}
              </datalist>
            </div>
            <div className="field">
              <label>Data consegna</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
          <div className="grid2">
            <div className="field">
              <label>N. DDT / Bolla</label>
              <input value={ddt} onChange={e => setDdt(e.target.value)} placeholder="Es. DDT-2026-0123" />
            </div>
            <div className="field">
              <label>Foto bolla</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button className="btn btn-ghost" style={{ fontSize: 13, padding: "8px 14px" }}
                  onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? "Caricamento..." : bollaUrl ? "Sostituisci" : "Carica foto"}
                </button>
                {bollaUrl && <span style={{ fontSize: 12, color: "var(--ok)" }}>Caricata</span>}
                <input ref={fileRef} type="file" accept="image/*" hidden
                  onChange={e => { if (e.target.files?.[0]) uploadBolla(e.target.files[0]); }} />
              </div>
            </div>
          </div>
          <div className="field">
            <label>Note generali</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Note opzionali..." />
          </div>

          {/* Product search / scan */}
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-soft)", display: "block", marginBottom: 8 }}>Aggiungi prodotti</label>
            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input ref={scanRef} value={searchQ} onChange={e => setSearchQ(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleScan(searchQ); } }}
                  placeholder="Scansiona barcode o cerca per nome..."
                  style={{ flex: 1, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 10, fontFamily: "inherit", fontSize: 14, background: "var(--surface)", color: "var(--ink)" }} />
                <button type="button" onClick={() => setShowCamScanner(true)} title="Scansiona con fotocamera"
                  style={{ background: "var(--ink)", border: "none", borderRadius: 10, padding: 10, cursor: "pointer", flexShrink: 0 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FAF9F5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" />
                  </svg>
                </button>
              </div>
              {showCamScanner && (
                <BarcodeScanner onScan={(code) => { handleScan(code); setShowCamScanner(false); }} onClose={() => setShowCamScanner(false)} />
              )}
              {searchResults.length > 0 && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
                  background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10,
                  boxShadow: "0 8px 24px rgba(0,0,0,.12)", maxHeight: 200, overflowY: "auto",
                }}>
                  {searchResults.map(p => (
                    <button key={p.product_id} onClick={() => addProduct(p)} style={{
                      display: "block", width: "100%", textAlign: "left", padding: "10px 14px",
                      border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 14,
                      borderBottom: "1px solid var(--line)",
                    }}>
                      <strong>{p.name}</strong> <span style={{ color: "var(--ink-soft)", fontSize: 12 }}>({p.current_stock} {p.unit})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Items list */}
          {items.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map(i => (
                <div key={i.product_id} style={{
                  padding: "10px 14px",
                  background: "var(--surface-2)", borderRadius: 10,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.name}</div>
                      <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{i.unit}</div>
                    </div>
                    <input type="number" min="1" step="1" value={i.qty}
                      onChange={e => updateItem(i.product_id, "qty", Math.max(1, Number(e.target.value)))}
                      style={{ width: 70, textAlign: "center", padding: "8px 6px", border: "1px solid var(--line)", borderRadius: 8, fontFamily: "inherit", fontSize: 15, fontWeight: 700 }} />
                    <input type="number" min="0" step="0.01" value={i.unit_cost}
                      onChange={e => updateItem(i.product_id, "unit_cost", Number(e.target.value))}
                      style={{ width: 80, textAlign: "right", padding: "8px 6px", border: "1px solid var(--line)", borderRadius: 8, fontFamily: "inherit", fontSize: 13 }}
                      title="Prezzo unitario" />
                    <span style={{ fontSize: 12, color: "var(--ink-soft)", minWidth: 60, textAlign: "right" }}>{eur(i.qty * i.unit_cost)}</span>
                    <button onClick={() => removeItem(i.product_id)} style={{
                      background: "none", border: "none", cursor: "pointer", color: "var(--danger)", padding: 4,
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                    <label style={{ fontSize: 11, color: "var(--ink-soft)", fontWeight: 600, whiteSpace: "nowrap" }}>Scadenza:</label>
                    <input type="date" value={i.expiry_date}
                      onChange={e => updateItem(i.product_id, "expiry_date", e.target.value)}
                      style={{ padding: "4px 8px", border: "1px solid var(--line)", borderRadius: 6, fontFamily: "inherit", fontSize: 12, flex: "0 1 140px" }} />
                    {[{ label: "+6m", months: 6 }, { label: "+1a", months: 12 }, { label: "+2a", months: 24 }].map(b => (
                      <button key={b.label} type="button" className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 11 }}
                        onClick={() => { const d = new Date(); d.setMonth(d.getMonth() + b.months); updateItem(i.product_id, "expiry_date", d.toISOString().slice(0, 10)); }}>
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Summary */}
          {items.length > 0 && (
            <div style={{
              display: "flex", justifyContent: "space-between", padding: "14px 18px",
              background: "#1F3326", borderRadius: 12, color: "#FAF9F5",
            }}>
              <div><span style={{ fontSize: 12, opacity: 0.7 }}>Totale pezzi</span><div style={{ fontSize: 20, fontWeight: 700 }}>{totalPcs}</div></div>
              <div style={{ textAlign: "right" }}><span style={{ fontSize: 12, opacity: 0.7 }}>Valore stimato</span><div style={{ fontSize: 20, fontWeight: 700 }}>{eur(totalVal)}</div></div>
            </div>
          )}

          <button className="btn btn-primary" style={{ width: "100%", padding: "14px 22px", fontSize: 15 }}
            onClick={confirm} disabled={saving || items.length === 0}>
            {saving ? "Salvataggio..." : `Conferma carico (${items.length} prodotti)`}
          </button>
        </div>
      </div>

      {newProdBarcode && (
        <NewProductModal
          barcode={newProdBarcode}
          supabase={supabase}
          onSave={handleNewProductSaved}
          onClose={() => setNewProdBarcode(null)}
        />
      )}
    </div>
  );
}
