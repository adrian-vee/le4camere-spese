"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { eur, isoToday } from "@/lib/format";
import DatePickerIT from "@/components/ui/DatePickerIT";
import BarcodeScanner from "@/components/BarcodeScanner";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/Toast";

type Supplier = { id: string; name: string; [k: string]: unknown };
type Product = {
  product_id: string; name: string; unit: string; unit_cost: number;
  barcode: string | null; category: string;
  default_supplier_id: string | null; supplier_code: string | null;
  current_stock: number;
};

type LineItem = {
  key: number;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  expiry_date: string;
  unit: string;
  category: string;
  supplier_code: string | null;
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
  const { toast, showToast } = useToast();
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
  const [showCamScanner, setShowCamScanner] = useState(false);
  const [newProdName, setNewProdName] = useState("");
  const [showNewProd, setShowNewProd] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef(0);

  // Custom dropdown
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const ddSearchRef = useRef<HTMLInputElement>(null);

  // New supplier inline
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [allSuppliers, setAllSuppliers] = useState(suppliers);

  useEffect(() => {
    supabase.from("stock_levels")
      .select("product_id, name, unit, unit_cost, barcode, category, default_supplier_id, supplier_code, current_stock")
      .eq("active", true).order("name")
      .then(({ data }) => setProducts((data ?? []) as Product[]));
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    if (!dropdownOpen) return;
    function handle(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [dropdownOpen]);

  // Focus search when dropdown opens
  useEffect(() => {
    if (dropdownOpen) setTimeout(() => ddSearchRef.current?.focus(), 50);
  }, [dropdownOpen]);

  // Products filtered by supplier for the dropdown
  const supplierProducts = products.filter(p => p.default_supplier_id === supplierId);
  const hasSupplierProducts = supplierProducts.length > 0;
  const filteredDropdown = supplierProducts.filter(p => {
    if (!dropdownSearch) return true;
    const q = dropdownSearch.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
      || (p.supplier_code ?? "").toLowerCase().includes(q);
  });

  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

  function addProduct(p: Product, qty = 1) {
    const existing = items.find(i => i.product_id === p.product_id);
    if (existing) {
      setItems(items.map(i => i.product_id === p.product_id ? { ...i, quantity: i.quantity + qty } : i));
      return;
    }
    keyRef.current++;
    setItems(prev => [...prev, {
      key: keyRef.current, product_id: p.product_id, product_name: p.name,
      quantity: qty, unit_price: p.unit_cost, expiry_date: "", unit: p.unit,
      category: p.category, supplier_code: p.supplier_code,
    }]);
  }

  function addSelectedProduct() {
    if (!selectedProduct) return;
    addProduct(selectedProduct);
    setSelectedProduct(null);
  }

  function handleScan(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    const found = products.find(p => p.barcode === trimmed);
    if (found) { addProduct(found); }
    else { setNewProdName(""); setShowNewProd(true); }
    setScanInput("");
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
      default_supplier_id: supplierId || null,
    }).select("id, name").single();
    if (error || !data) return showToast("Errore: " + (error?.message ?? "Sconosciuto"), "error");
    const newP: Product = {
      product_id: data.id, name: data.name, unit: "pz", unit_cost: 0,
      barcode: null, category: "Altro", default_supplier_id: supplierId || null,
      supplier_code: null, current_stock: 0,
    };
    keyRef.current++;
    setItems(prev => [...prev, {
      key: keyRef.current, product_id: data.id, product_name: data.name,
      quantity: 1, unit_price: 0, expiry_date: "", unit: "pz",
      category: "Altro", supplier_code: null,
    }]);
    setProducts(prev => [...prev, newP]);
    setShowNewProd(false);
    setNewProdName("");
  }

  async function createNewSupplier() {
    if (!newSupplierName.trim()) return;
    const { data, error } = await supabase.from("suppliers").insert({ name: newSupplierName.trim(), active: true }).select("id, name").single();
    if (error || !data) return showToast("Errore: " + (error?.message ?? "Sconosciuto"), "error");
    setAllSuppliers(prev => [...prev, { id: data.id, name: data.name }]);
    setSupplierId(data.id);
    setShowNewSupplier(false);
    setNewSupplierName("");
  }

  async function confirm() {
    if (!supplierId || items.length === 0) return;

    const invalidQty = items.filter(i => i.quantity <= 0);
    if (invalidQty.length > 0) {
      showToast(`Quantita non valida per: ${invalidQty.map(i => i.product_name).join(", ")}. La quantita deve essere maggiore di 0.`, "warn");
      return;
    }
    const invalidPrice = items.filter(i => i.unit_price < 0);
    if (invalidPrice.length > 0) {
      showToast(`Prezzo non valido per: ${invalidPrice.map(i => i.product_name).join(", ")}. Il prezzo non puo essere negativo.`, "warn");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const supplier = allSuppliers.find(s => s.id === supplierId);

      let docUrl: string | null = null;
      if (docFile) {
        const path = `fornitori/${Date.now()}-${docFile.name}`;
        const { error: upErr } = await supabase.storage.from("documenti").upload(path, docFile);
        if (!upErr) docUrl = path;
      }

      const { data: delivery, error: delErr } = await supabase.from("supplier_deliveries").insert({
        supplier_id: supplierId, total_amount: total, document_type: docType,
        document_number: docNumber.trim() || null, document_url: docUrl,
        created_by: user?.id ?? null,
      }).select("id").single();
      if (delErr || !delivery) throw new Error(delErr?.message ?? "Errore creazione consegna");

      const itemRows = items.map(i => ({
        delivery_id: delivery.id, product_id: i.product_id,
        product_name: i.product_name, quantity: i.quantity,
        unit_price: i.unit_price, total_price: i.quantity * i.unit_price,
        expiry_date: i.expiry_date || null,
      }));
      const { error: itemsErr } = await supabase.from("supplier_delivery_items").insert(itemRows);
      if (itemsErr) throw new Error("Errore inserimento prodotti: " + itemsErr.message);

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

      const { data: fornitoreCategory } = await supabase.from("categories").select("id").eq("name", "Fornitore").single();
      const paymentStatus = supplier?.payment_terms && typeof supplier.payment_terms === "string" && supplier.payment_terms.toLowerCase().includes("contanti") ? "pagato" : "da_pagare";

      const { data: expense, error: expErr } = await supabase.from("expenses").insert({
        amount: total, expense_date: isoToday(),
        category_id: fornitoreCategory?.id ?? null,
        supplier_name: supplier?.name ?? "", doc_type: docType === "DDT" ? "Bolla/DDT" : docType,
        payment_method: paymentStatus === "pagato" ? "Contanti" : "Bonifico",
        payment_status: paymentStatus,
        notes: `Arrivo merce — ${docType} ${docNumber || ""} — ${items.length} prodotti`.trim(),
        created_by: user?.id ?? null,
      }).select("id").single();
      if (expErr) throw new Error("Errore creazione spesa: " + expErr.message);

      if (expense) {
        await supabase.from("supplier_deliveries").update({ expense_id: expense.id }).eq("id", delivery.id);
      }

      onDone();
    } catch (err) {
      showToast("Errore: " + (err instanceof Error ? err.message : "Sconosciuto"), "error");
    } finally {
      setSaving(false);
    }
  }

  const supplierName = allSuppliers.find(s => s.id === supplierId)?.name ?? "";
  const stepLabels = ["Fornitore", "Prodotti", "Conferma"];

  return (
    <div className="arrivo-container">
      {/* ── Header ── */}
      <div className="arrivo-header">
        <div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 500, color: "#1F3326", margin: 0 }}>Nuovo arrivo merce</h1>
          <p style={{ fontSize: 14, color: "#888", marginTop: 4 }}>Registra una consegna dal fornitore</p>
        </div>
        <button className="arrivo-btn-cancel" onClick={onClose}>Annulla</button>
      </div>

      {/* ── Stepper ── */}
      <div className="arrivo-stepper">
        {stepLabels.map((label, i) => {
          const sn = i + 1;
          const isDone = step > sn;
          const isActive = step === sn;
          return (
            <Fragment key={i}>
              {i > 0 && <div className={`arrivo-step-line${step > i ? " done" : ""}`} />}
              <div className={`arrivo-step${isDone ? " done" : isActive ? " active" : ""}`}>
                <div className="arrivo-step-circle">
                  {isDone ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : sn}
                </div>
                <span className="arrivo-step-label">{label}</span>
              </div>
            </Fragment>
          );
        })}
      </div>

      {/* ══════════ STEP 1 — Fornitore ══════════ */}
      {step === 1 && (
        <div className="arrivo-card">
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 500, marginBottom: 16, color: "#1F3326" }}>Seleziona fornitore</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="field">
              <label>Fornitore *</label>
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)} style={{ fontSize: 15 }}>
                <option value="">Seleziona...</option>
                {allSuppliers.filter(s => s.name).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {!showNewSupplier ? (
              <button className="arrivo-btn-new" style={{ alignSelf: "flex-start", fontSize: 13, padding: "8px 16px" }} onClick={() => setShowNewSupplier(true)}>+ Crea nuovo fornitore</button>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div className="field" style={{ flex: "1 1 200px", margin: 0 }}>
                  <label>Nome nuovo fornitore</label>
                  <input value={newSupplierName} onChange={e => setNewSupplierName(e.target.value)} placeholder="Es. Metro, Eurospin..." autoFocus />
                </div>
                <button className="arrivo-btn-add" style={{ padding: "10px 18px" }} onClick={createNewSupplier}>Crea</button>
                <button className="arrivo-btn-cancel" style={{ padding: "10px 14px" }} onClick={() => setShowNewSupplier(false)}>Annulla</button>
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
            <button className="arrivo-btn-next" style={{ width: "100%" }} disabled={!supplierId} onClick={() => setStep(2)}>
              Avanti — Aggiungi prodotti
            </button>
          </div>
        </div>
      )}

      {/* ══════════ STEP 2 — Prodotti ══════════ */}
      {step === 2 && (
        <>
          {/* Barcode scan bar */}
          <div className="arrivo-scan-bar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#BFA762" strokeWidth="2" strokeLinecap="round">
              <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
              <path d="M8 7v10M12 7v10M16 7v10" />
            </svg>
            <input ref={scanRef} value={scanInput} onChange={e => setScanInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleScan(scanInput); } }}
              placeholder="Scansiona barcode..." autoFocus />
            <button className="cam-btn" onClick={() => setShowCamScanner(true)} title="Fotocamera">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#BFA762" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" />
              </svg>
            </button>
          </div>

          {showCamScanner && <BarcodeScanner onScan={code => { handleScan(code); setShowCamScanner(false); }} onClose={() => setShowCamScanner(false)} />}

          {/* Add product card */}
          <div className="arrivo-card" style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
              {/* Custom searchable dropdown */}
              <div ref={dropdownRef} className="arrivo-dropdown-wrap" style={{ flex: "1 1 280px" }}>
                <div className="arrivo-dropdown-trigger" onClick={() => setDropdownOpen(true)}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                  <input
                    value={dropdownOpen ? dropdownSearch : (selectedProduct?.name ?? "")}
                    onChange={e => { setDropdownSearch(e.target.value); if (!dropdownOpen) setDropdownOpen(true); }}
                    onFocus={() => setDropdownOpen(true)}
                    placeholder="Cerca e seleziona prodotto..."
                    ref={ddSearchRef}
                    readOnly={false}
                  />
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
                </div>
                {dropdownOpen && (
                  <div className="arrivo-dropdown-panel">
                    {!hasSupplierProducts ? (
                      <div className="arrivo-dropdown-empty">
                        Nessun prodotto associato a questo fornitore.<br />
                        Usa &ldquo;+ Nuovo prodotto&rdquo; per crearne uno.
                      </div>
                    ) : filteredDropdown.length === 0 ? (
                      <div className="arrivo-dropdown-empty">
                        Nessun prodotto trovato.<br />
                        <button className="arrivo-btn-new" style={{ marginTop: 8, fontSize: 13, padding: "6px 14px" }}
                          onClick={() => { setDropdownOpen(false); setShowNewProd(true); }}>+ Nuovo prodotto</button>
                      </div>
                    ) : (
                      filteredDropdown.map(p => (
                        <div key={p.product_id} className={`arrivo-dropdown-option${selectedProduct?.product_id === p.product_id ? " selected" : ""}`}
                          onClick={() => { setSelectedProduct(p); setDropdownOpen(false); setDropdownSearch(""); }}>
                          <span className="opt-name">{p.name}</span>
                          <span className="opt-meta">
                            <span className="opt-badge" style={{ background: "rgba(79,123,140,.12)", color: "#4F7B8C" }}>{p.category}</span>
                            <span className="opt-stock">Stock: {p.current_stock} {p.unit}</span>
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              <button className="arrivo-btn-add" onClick={addSelectedProduct} disabled={!selectedProduct}>Aggiungi</button>
              <button className="arrivo-btn-new" onClick={() => setShowNewProd(true)}>+ Nuovo prodotto</button>
            </div>
          </div>

          {/* New product inline */}
          {showNewProd && (
            <div className="arrivo-card" style={{ marginBottom: 20, background: "#F3EBDD" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div className="field" style={{ flex: "1 1 200px", margin: 0 }}>
                  <label style={{ fontSize: 12 }}>Nome nuovo prodotto</label>
                  <input value={newProdName} onChange={e => setNewProdName(e.target.value)} placeholder="Es. Acqua Maniva 0.5L" autoFocus />
                </div>
                <button className="arrivo-btn-add" onClick={addNewProduct}>Crea e aggiungi</button>
                <button className="arrivo-btn-cancel" onClick={() => setShowNewProd(false)}>Annulla</button>
              </div>
            </div>
          )}

          {/* Product list */}
          <div className="arrivo-card">
            <div className="arrivo-list-head">
              <span className="arrivo-list-title">Prodotti ({items.length})</span>
              <span className="arrivo-list-total">Totale: {eur(total)}</span>
            </div>

            {items.length === 0 ? (
              <div className="arrivo-empty">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#D8CCB8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                  <line x1="12" y1="22.08" x2="12" y2="12"/>
                </svg>
                <span className="arrivo-empty-text">Scansiona o aggiungi prodotti per iniziare</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {items.map(item => (
                  <div key={item.key} className="arrivo-prod-card">
                    <div className="arrivo-prod-top">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="arrivo-prod-name">{item.product_name}</div>
                        <div className="arrivo-prod-meta">
                          {item.category}{item.supplier_code ? ` · Cod: ${item.supplier_code}` : ""}
                        </div>
                      </div>
                      <div className="arrivo-prod-right">
                        <div className="arrivo-prod-qty">
                          <button className="arrivo-qty-btn" onClick={() => updateItem(item.key, "quantity", Math.max(1, item.quantity - 1))}>−</button>
                          <span className="arrivo-qty-val">{item.quantity}</span>
                          <button className="arrivo-qty-btn" onClick={() => updateItem(item.key, "quantity", item.quantity + 1)}>+</button>
                        </div>
                      </div>
                    </div>
                    <div className="arrivo-prod-bottom">
                      <div className="arrivo-prod-fields">
                        <div className="field" style={{ margin: 0, minWidth: 90, maxWidth: 110 }}>
                          <label style={{ fontSize: 11 }}>Prezzo unit. €</label>
                          <input type="number" min="0" step="0.01" value={item.unit_price}
                            onChange={e => updateItem(item.key, "unit_price", Math.max(0, Number(e.target.value)))}
                            style={{ textAlign: "center", fontWeight: 600 }} />
                        </div>
                        <div className="field" style={{ margin: 0, flex: "1 1 130px" }}>
                          <label style={{ fontSize: 11 }}>Scadenza</label>
                          <DatePickerIT value={item.expiry_date} onChange={v => updateItem(item.key, "expiry_date", v)} />
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span className="arrivo-prod-total">Totale: {eur(item.quantity * item.unit_price)}</span>
                        <button className="arrivo-prod-delete" onClick={() => removeItem(item.key)} title="Rimuovi">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="arrivo-nav">
            <button className="arrivo-btn-back" onClick={() => setStep(1)}>Indietro</button>
            <button className="arrivo-btn-next" disabled={items.length === 0} onClick={() => setStep(3)}>
              Avanti — Riepilogo
            </button>
          </div>
        </>
      )}

      {/* ══════════ STEP 3 — Riepilogo ══════════ */}
      {step === 3 && (
        <div className="arrivo-card">
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 500, marginBottom: 16, color: "#1F3326" }}>Riepilogo arrivo</h2>

          {/* Summary header */}
          <div style={{ padding: "16px 0", borderBottom: "1px solid #D8CCB8", marginBottom: 16, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#888", fontWeight: 600 }}>Fornitore</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#1F3326" }}>{supplierName}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#888", fontWeight: 600 }}>Documento</div>
              <div style={{ fontWeight: 600, color: "#1F3326" }}>{docType} {docNumber ? `n. ${docNumber}` : ""}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#888", fontWeight: 600 }}>Prodotti</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#1F3326" }}>{items.length}</div>
            </div>
          </div>

          {/* Items table */}
          <div style={{ overflowX: "auto" }}>
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
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.product_name}</div>
                      {item.supplier_code && <div style={{ fontSize: 12, color: "#888" }}>Cod: {item.supplier_code}</div>}
                    </td>
                    <td style={{ textAlign: "center" }}>{item.quantity} {item.unit}</td>
                    <td style={{ textAlign: "right" }}>{eur(item.unit_price)}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{eur(item.quantity * item.unit_price)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ textAlign: "right", fontWeight: 700, fontSize: 15, paddingTop: 12 }}>TOTALE</td>
                  <td style={{ textAlign: "right", fontWeight: 700, fontFamily: "'Fraunces', serif", fontSize: 22, color: "#BFA762", paddingTop: 12 }}>{eur(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="arrivo-nav" style={{ marginTop: 24 }}>
            <button className="arrivo-btn-back" onClick={() => setStep(2)}>Indietro</button>
            <button className="arrivo-btn-next" disabled={saving} onClick={confirm}>
              {saving ? "Salvataggio..." : "Conferma arrivo"}
            </button>
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </div>
  );
}
