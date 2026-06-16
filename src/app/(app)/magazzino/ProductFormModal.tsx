"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import DatePickerIT from "@/components/ui/DatePickerIT";
import type { Product, Supplier } from "./types";
import { CATEGORIES, UNITS } from "./types";

const EMPTY_P = {
  name: "", brand: "", category: "Pulizia", unit: "pz", unit_cost: 0,
  min_stock: 0, supplier_id: "", notes: "", barcode: "", initial_qty: 0,
  expiry_date: "", tracking_type: "units" as "units" | "bottle",
  bottle_capacity_ml: 700, standard_pour_ml: 30,
};

export type ProductFormData = typeof EMPTY_P;

interface ProductFormModalProps {
  isOpen: boolean;
  editProd: Product | null;
  suppliers: Supplier[];
  isStaff: boolean;
  onClose: () => void;
  onSave: (pf: ProductFormData, editProd: Product | null) => Promise<void>;
  showToast: (msg: string, type?: "ok" | "warn" | "error") => void;
}

export default function ProductFormModal({
  isOpen,
  editProd,
  suppliers,
  isStaff,
  onClose,
  onSave,
  showToast,
}: ProductFormModalProps) {
  const [pf, setPf] = useState<ProductFormData>(() => {
    if (editProd) {
      return {
        name: editProd.name,
        brand: (editProd as Product & { brand?: string }).brand ?? "",
        category: editProd.category,
        unit: editProd.unit,
        unit_cost: editProd.unit_cost,
        min_stock: editProd.min_stock,
        supplier_id: editProd.supplier_id ?? "",
        notes: editProd.notes ?? "",
        barcode: editProd.barcode ?? "",
        initial_qty: 0,
        expiry_date: editProd.expiry_date ?? "",
        tracking_type: editProd.tracking_type ?? "units",
        bottle_capacity_ml: editProd.bottle_capacity_ml ?? 700,
        standard_pour_ml: editProd.standard_pour_ml ?? 30,
      };
    }
    return { ...EMPTY_P };
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!pf.name.trim()) return showToast("Inserisci il nome del prodotto.", "warn");
    setSaving(true);
    try {
      await onSave(pf, editProd);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editProd ? "Modifica prodotto" : "Nuovo prodotto"}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
            <option value="units">Unita (standard)</option>
            <option value="bottle">Bottiglia con livello</option>
          </select>
        </div>
        {pf.tracking_type === "bottle" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "14px 16px", borderRadius: 10, background: "rgba(138,115,85,.06)", border: "1px solid rgba(138,115,85,.15)" }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Capacita bottiglia (ml)</label>
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
        {editProd ? (
          <div className="field"><label>Scadenza (opzionale)</label><DatePickerIT value={pf.expiry_date} onChange={v => setPf({ ...pf, expiry_date: v })} /></div>
        ) : (
          <div className="grid2">
            <div className="field"><label>Quantita iniziale</label><input type="number" min="0" step="1" value={pf.initial_qty} onChange={e => setPf({ ...pf, initial_qty: Math.max(0, Number(e.target.value)) })} placeholder="Es: 24" /></div>
            <div className="field"><label>Scadenza (opzionale)</label><DatePickerIT value={pf.expiry_date} onChange={v => setPf({ ...pf, expiry_date: v })} /></div>
          </div>
        )}
        {suppliers.length > 0 && <div className="field"><label>Fornitore</label><select value={pf.supplier_id} onChange={e => setPf({ ...pf, supplier_id: e.target.value })}><option value="">— Nessuno —</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
        <div className="field"><label>Note</label><textarea value={pf.notes} onChange={e => setPf({ ...pf, notes: e.target.value })} placeholder="Note opzionali..." /></div>
        <button className="btn btn-primary" style={{ width: "100%", padding: "14px 22px", fontSize: 15 }}
          onClick={handleSave} disabled={saving}>
          {saving ? "Salvataggio..." : editProd ? "Salva modifiche" : "Aggiungi prodotto"}
        </button>
      </div>
    </Modal>
  );
}
