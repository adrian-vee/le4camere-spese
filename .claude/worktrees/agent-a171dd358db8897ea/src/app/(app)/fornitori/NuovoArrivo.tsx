"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { eur } from "@/lib/format";
import DatePickerIT from "@/components/ui/DatePickerIT";
import BarcodeScanner from "@/components/BarcodeScanner";

type Supplier = { id: string; name: string; [k: string]: unknown };
type Product = { product_id: string; name: string; unit: string; unit_cost: number; barcode: string | null; category: string };

type LineItem = {
  key: number;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  expiry_date: string;
  unit: string;
};

const DOC_TYPES = ["DDT", "Fattura", "Scontrino", "Altro"];

export default function NuovoArrivo({
  suppliers, preSelectedSupplierId, onClose, onDone,
}: {
  suppliers: Supplier[];
  preSelectedSupplierId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const supabase = createClient();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [supplierId, setSupplierId] = useState(preSelectedSupplierId ?? "");
  const [docType, setDocType] = useState("DDT");
  const [docNumber, setDocNumber] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);

  // Step 2
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [scanInput, setScanInput] = useState("");
  const [manualProdId, setManualProdId] = useState("");
  const [showCamScanner, setShowCamScanner] = useState(false);
  const [newProdName, setNewProdName] = useState("");
  const [showNewProd, setShowNewProd] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef(0);

  // New supplier inline
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [allSuppliers, setAllSuppliers] = useState(suppliers);

  useEffect(() => {
    supabase.from("stock_levels").select("product_id, name, unit, unit_cost, barcode, category").eq("active", true).order("name")
      .then(({ data }) => setProducts((data ?? []) as Product[]));
  }, []);

  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

  function addProduct(p: Product, qty = 1) {
    const existing = items.find(i => i.product_id === p.product_id);
    if (existing) {
      setItems(items.map(i => i.product_id === p.product_id ? { ...i, quantity: i.quantity + qty } : i));
      return;
    }
    keyRef.current++;
    setItems([...items, {
      key: keyRef.current, product_id: p.product_id, product_name: p.name,
      quantity: qty, unit_price: p.unit_cost, expiry_date: "", unit: p.unit,
    }]);
  }

  function handleScan(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    const found = products.find(p => p.barcode === trimmed);
    if (found) { addProduct(found); }
    else { setNewProdName(""); setShowNewProd(true); }
    setScanInput("");
  }

  function addManual() {
    if (!manualProdId) return;
    const p = products.find(x => x.product_id === manualProdId);
    if (p) addProduct(p);
    setManualProdId("");
  }

  function updateItem(key: number, field: keyof LineItem, value: string | number) {
    setItems(items.map(i => i.key === key ? { ...i, [field]: value } : i));
  }

  function removeItem(key: number) {
    setItems(items.filter(i => i.key !== key));
  }

  async function addNewProduct() {
    if (!newProdName.trim()) return;
    const { data, error } = await supabase.from("products").insert({
      name: newProdName.trim(), category: "Altro", unit: "pz", unit_cost: 0, min_stock: 0, active: true,
    }).select("id, name").single();
    if (error || !data) return alert("Errore: " + (error?.message ?? "Sconosciuto"));
    keyRef.current++;
    setItems([...items, {
      key: keyRef.current, product_id: data.id, product_name: data.name,
      quantity: 1, unit_price: 0, expiry_date: "", unit: "pz",
    }]);
    setProducts([...products, { product_id: data.id, name: data.name, unit: "pz", unit_cost: 0, barcode: null, category: "Altro" }]);
    setShowNewProd(false);
    setNewProdName("");
  }

  async function createNewSupplier() {
    if (!newSupplierName.trim()) return;
    const { data, error } = await supabase.from("suppliers").insert({ name: newSupplierName.trim(), active: true }).select("id, name").single();
    if (error || !data) return alert("Errore: " + (error?.message ?? "Sconosciuto"));
    setAllSuppliers([...allSuppliers, { id: data.id, name: data.name }]);
    setSupplierId(data.id);
    setShowNewSupplier(false);
    setNewSupplierName("");
  }

  async function confirm() {
    if (!supplierId || items.length === 0) return;

    // Validate items before saving
    const invalidQty = items.filter(i => i.quantity <= 0);
    if (invalidQty.length > 0) {
      alert(`Quantita non valida per: ${invalidQty.map(i => i.product_name).join(", ")}. La quantita deve essere maggiore di 0.`);
      return;
    }
    const invalidPrice = items.filter(i => i.unit_price < 0);
    if (invalidPrice.length > 0) {
      alert(`Prezzo non valido per: ${invalidPrice.map(i => i.product_name).join(", ")}. Il prezzo non puo essere negativo.`);
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const supplier = allSuppliers.find(s => s.id === supplierId);

      // Upload doc if present
      let docUrl: string | null = null;
      if (docFile) {
        const path = `fornitori/${Date.now()}-${docFile.name}`;
        const { error: upErr } = await supabase.storage.from("documenti").upload(path, docFile);
        if (!upErr) docUrl = path;
      }

      // Create delivery
      const { data: delivery, error: delErr } = await supabase.from("supplier_deliveries").insert({
        supplier_id: supplierId, total_amount: total, document_type: docType,
        document_number: docNumber.trim() || null, document_url: docUrl,
        created_by: user?.id ?? null,
      }).select("id").single();
      if (delErr || !delivery) throw new Error(delErr?.message ?? "Errore creazione consegna");

      // Create delivery items
      const itemRows = items.map(i => ({
        delivery_id: delivery.id, product_id: i.product_id,
        product_name: i.product_name, quantity: i.quantity,
        unit_price: i.unit_price, total_price: i.quantity * i.unit_price,
        expiry_date: i.expiry_date || null,
      }));
      const { error: itemsErr } = await supabase.from("supplier_delivery_items").insert(itemRows);
      if (itemsErr) throw new Error("Errore inserimento prodotti: " + itemsErr.message);

      // Create stock movements + batches (batch inserts instead of N+1)
      const movementRows = items.filter(i => i.product_id).map(i => ({
        product_id: i.product_id, type: "in" as const, quantity: i.quantity,
        notes: `Arrivo da ${supplier?.name ?? "?"} — ${docType} ${docNumber || ""}`.trim(),
        created_by: user?.id ?? null,
        expiry_date: i.expiry_date || null,
      }));
      if (movementRows.length) {
        const { error: mvErr } = await supabase.from("stock_movements").insert(movementRows);
        if (mvErr) throw new Error("Errore movimenti magazzino: " + mvErr.message);
      }

      const batchRows = items.filter(i => i.product_id).map(i => ({
        product_id: i.product_id, quantity_initial: i.quantity,
        quantity_remaining: i.quantity, expiry_date: i.expiry_date || null,
        source: "delivery", source_delivery_id: delivery.id,
        notes: `${supplier?.name ?? "?"} — ${docType} ${docNumber || ""}`.trim(),
      }));
      if (batchRows.length) {
        const { error: batchErr } = await supabase.from("product_batches").insert(batchRows);
        if (batchErr) throw new Error("Errore lotti: " + batchErr.message);
      }

      // Update product metadata (price, supplier, expiry)
      for (const i of items) {
        if (!i.product_id) continue;
        const prod = products.find(p => p.product_id === i.product_id);
        if (prod && i.unit_price > 0 && i.unit_price !== prod.unit_cost) {
          await supabase.from("products").update({ unit_cost: i.unit_price }).eq("id", i.product_id);
        }
        if (prod) {
          await supabase.from("products").update({ default_supplier_id: supplierId }).eq("id", i.product_id).is("default_supplier_id", null);
        }
        if (i.expiry_date) {
          await supabase.from("products").update({ expiry_date: i.expiry_date }).eq("id", i.product_id);
        }
      }

      // Create expense
      const { data: fornitoreCategory } = await supabase.from("categories").select("id").eq("name", "Fornitore").single();
      const paymentStatus = supplier?.payment_terms && typeof supplier.payment_terms === "string" && supplier.payment_terms.toLowerCase().includes("contanti") ? "pagato" : "da_pagare";

      const { data: expense, error: expErr } = await supabase.from("expenses").insert({
        amount: total, expense_date: new Date().toISOString().slice(0, 10),
        category_id: fornitoreCategory?.id ?? null,
        supplier_name: supplier?.name ?? "", doc_type: docType === "DDT" ? "Bolla/DDT" : docType,
        payment_method: paymentStatus === "pagato" ? "Contanti" : "Bonifico",
        payment_status: paymentStatus,
        notes: `Arrivo merce — ${docType} ${docNumber || ""} — ${items.length} prodotti`.trim(),
        created_by: user?.id ?? null,
      }).select("id").single();
      if (expErr) throw new Error("Errore creazione spesa: " + expErr.message);

      // Link expense to delivery
      if (expense) {
        await supabase.from("supplier_deliveries").update({ expense_id: expense.id }).eq("id", delivery.id);
      }

      onDone();
    } catch (err) {
      alert("Errore: " + (err instanceof Error ? err.message : "Sconosciuto"));
    } finally {
      setSaving(false);
    }
  }

  const supplierName = allSuppliers.find(s => s.id === supplierId)?.name ?? "";

  // Step indicator
  const stepLabels = ["Fornitore", "Prodotti", "Conferma"];

  return (
    <div className="arrivo-container">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="serif" style={{ fontSize: 22, fontWeight: 500 }}>Nuovo arrivo merce</h1>
          <p className="muted" style={{ marginTop: 2, fontSize: 13 }}>Registra una consegna dal fornitore</p>
        </div>
        <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
      </div>

      {/* Step indicator */}
      <div className="step-indicator">
        {stepLabels.map((label, i) => (
          <div key={i} className={`step-dot ${step === i + 1 ? "active" : step > i + 1 ? "done" : ""}`}>
            <div className="step-num">{step > i + 1 ? "✓" : i + 1}</div>
            <span>{label}</span>
          </div>
        ))}
      </div>

      {/* STEP 1: Fornitore */}
      {step === 1 && (
        <div className="section">
          <div className="section-head"><h2>Seleziona fornitore</h2></div>
          <div className="section-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="field">
              <label>Fornitore *</label>
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)} style={{ fontSize: 15 }}>
                <option value="">Seleziona...</option>
                {allSuppliers.filter(s => s.name).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {!showNewSupplier ? (
              <button className="btn btn-ghost" style={{ alignSelf: "flex-start", fontSize: 13 }} onClick={() => setShowNewSupplier(true)}>+ Crea nuovo fornitore</button>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <div className="field" style={{ flex: 1 }}>
                  <label>Nome nuovo fornitore</label>
                  <input value={newSupplierName} onChange={e => setNewSupplierName(e.target.value)} placeholder="Es. Metro, Eurospin..." autoFocus />
                </div>
                <button className="btn btn-primary" style={{ padding: "10px 18px", whiteSpace: "nowrap" }} onClick={createNewSupplier}>Crea</button>
                <button className="btn btn-ghost" style={{ padding: "10px 14px" }} onClick={() => setShowNewSupplier(false)}>Annulla</button>
              </div>
            )}
            <div className="grid2">
              <div className="field">
                <label>Tipo documento</label>
                <select value={docType} onChange={e => setDocType(e.target.value)}>
                  {DOC_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Numero documento</label>
                <input value={docNumber} onChange={e => setDocNumber(e.target.value)} placeholder="Es. 1234" />
              </div>
            </div>
            <div className="field">
              <label>Foto documento (opzionale)</label>
              <input type="file" accept="image/*,application/pdf" onChange={e => setDocFile(e.target.files?.[0] ?? null)} />
            </div>
            <button className="btn btn-primary" style={{ width: "100%", padding: "14px 22px", fontSize: 15 }}
              disabled={!supplierId} onClick={() => setStep(2)}>
              Avanti — Aggiungi prodotti
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Prodotti */}
      {step === 2 && (
        <>
          {/* Scan bar */}
          <div style={{ background: "#1F3326", padding: "12px 16px", borderRadius: 12, marginBottom: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FAF9F5" strokeWidth="2" strokeLinecap="round">
              <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
              <path d="M8 7v10M12 7v10M16 7v10" />
            </svg>
            <input ref={scanRef} value={scanInput} onChange={e => setScanInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleScan(scanInput); } }}
              placeholder="Scansiona barcode..." autoFocus
              style={{ flex: "1 1 180px", background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.18)", borderRadius: 8, padding: "10px 14px", color: "#FAF9F5", fontSize: 15, fontFamily: "inherit" }} />
            <button className="cam-scan-btn" onClick={() => setShowCamScanner(true)} title="Fotocamera">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FAF9F5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" />
              </svg>
            </button>
          </div>

          {showCamScanner && <BarcodeScanner onScan={code => { handleScan(code); setShowCamScanner(false); }} onClose={() => setShowCamScanner(false)} />}

          {/* Manual add */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <select value={manualProdId} onChange={e => setManualProdId(e.target.value)} style={{ flex: "1 1 200px" }}>
              <option value="">Aggiungi prodotto manualmente...</option>
              {products.map(p => <option key={p.product_id} value={p.product_id}>{p.name} ({p.unit})</option>)}
            </select>
            <button className="btn btn-ghost" onClick={addManual} disabled={!manualProdId}>Aggiungi</button>
            <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => setShowNewProd(true)}>+ Nuovo prodotto</button>
          </div>

          {/* New product inline */}
          {showNewProd && (
            <div style={{ display: "flex", gap: 8, marginBottom: 16, padding: 12, background: "#F3EBDD", borderRadius: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div className="field" style={{ flex: "1 1 200px", margin: 0 }}>
                <label style={{ fontSize: 12 }}>Nome nuovo prodotto</label>
                <input value={newProdName} onChange={e => setNewProdName(e.target.value)} placeholder="Es. Acqua Maniva 0.5L" autoFocus />
              </div>
              <button className="btn btn-primary" style={{ padding: "10px 18px" }} onClick={addNewProduct}>Crea e aggiungi</button>
              <button className="btn btn-ghost" style={{ padding: "10px 14px" }} onClick={() => setShowNewProd(false)}>Annulla</button>
            </div>
          )}

          {/* Item list */}
          <div className="section">
            <div className="section-head">
              <h2>Prodotti ({items.length})</h2>
              <span style={{ fontWeight: 700, fontFamily: "'Fraunces', serif", fontSize: 20, color: "#1F3326" }}>{eur(total)}</span>
            </div>
            <div className="section-body" style={{ padding: items.length === 0 ? undefined : 0 }}>
              {items.length === 0 ? (
                <div className="empty">Scansiona o aggiungi prodotti per iniziare</div>
              ) : (
                <div className="arrivo-items">
                  {items.map(item => (
                    <div key={item.key} className="arrivo-item">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <strong style={{ fontSize: 14 }}>{item.product_name}</strong>
                        <button className="btn-ghost" style={{ padding: "2px 8px", color: "#9E3B2E", fontSize: 12 }} onClick={() => removeItem(item.key)}>Rimuovi</button>
                      </div>
                      <div className="arrivo-item-fields">
                        <div className="field" style={{ margin: 0 }}>
                          <label style={{ fontSize: 11 }}>Quantità</label>
                          <input type="number" min="0.01" step="1" value={item.quantity}
                            onChange={e => updateItem(item.key, "quantity", Math.max(0, Number(e.target.value)))}
                            style={{ width: 80, textAlign: "center", fontWeight: 700 }} />
                        </div>
                        <div className="field" style={{ margin: 0 }}>
                          <label style={{ fontSize: 11 }}>Prezzo unit. €</label>
                          <input type="number" min="0" step="0.01" value={item.unit_price}
                            onChange={e => updateItem(item.key, "unit_price", Math.max(0, Number(e.target.value)))}
                            style={{ width: 90, textAlign: "center" }} />
                        </div>
                        <div className="field" style={{ margin: 0, flex: "1 1 140px" }}>
                          <label style={{ fontSize: 11 }}>Scadenza</label>
                          <DatePickerIT value={item.expiry_date} onChange={v => updateItem(item.key, "expiry_date", v)} />
                        </div>
                        <div style={{ textAlign: "right", minWidth: 80, fontWeight: 700, fontFamily: "'Fraunces', serif", fontSize: 16, alignSelf: "flex-end", paddingBottom: 6 }}>
                          {eur(item.quantity * item.unit_price)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={() => setStep(1)}>Indietro</button>
            <button className="btn btn-primary" style={{ flex: 1, padding: "14px 22px", fontSize: 15 }}
              disabled={items.length === 0} onClick={() => setStep(3)}>
              Avanti — Riepilogo
            </button>
          </div>
        </>
      )}

      {/* STEP 3: Riepilogo */}
      {step === 3 && (
        <div className="section">
          <div className="section-head"><h2>Riepilogo arrivo</h2></div>
          <div className="section-body" style={{ padding: 0 }}>
            {/* Summary header */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-soft)", fontWeight: 600 }}>Fornitore</div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{supplierName}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-soft)", fontWeight: 600 }}>Documento</div>
                  <div style={{ fontWeight: 600 }}>{docType} {docNumber ? `n. ${docNumber}` : ""}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-soft)", fontWeight: 600 }}>Prodotti</div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{items.length}</div>
                </div>
              </div>
            </div>

            {/* Items table */}
            <table className="tbl" style={{ margin: 0 }}>
              <thead><tr>
                <th>Prodotto</th>
                <th style={{ textAlign: "center" }}>Qtà</th>
                <th style={{ textAlign: "right" }}>Prezzo unit.</th>
                <th style={{ textAlign: "right" }}>Totale</th>
              </tr></thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.key} style={{ background: i % 2 === 0 ? "transparent" : "#FAF9F5" }}>
                    <td style={{ fontWeight: 600 }}>{item.product_name}</td>
                    <td style={{ textAlign: "center" }}>{item.quantity}</td>
                    <td style={{ textAlign: "right" }}>{eur(item.unit_price)}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{eur(item.quantity * item.unit_price)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ textAlign: "right", fontWeight: 700, fontSize: 15, paddingTop: 12 }}>TOTALE</td>
                  <td style={{ textAlign: "right", fontWeight: 700, fontFamily: "'Fraunces', serif", fontSize: 22, color: "#1F3326", paddingTop: 12 }}>{eur(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            <button className="btn btn-ghost" onClick={() => setStep(2)}>Indietro</button>
            <button className="btn btn-primary" style={{ flex: 1, padding: "16px 22px", fontSize: 16, fontWeight: 700 }}
              disabled={saving} onClick={confirm}>
              {saving ? "Salvataggio..." : "Conferma arrivo"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
