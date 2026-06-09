"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

const CATEGORIES = [
  "Pulizia", "Colazione", "Biancheria", "Bagno/Toiletries", "Manutenzione",
  "Cancelleria", "Bar", "Cucina", "Minibar", "Bevande", "Alcolici",
  "Snack/Distributori", "Altro",
];
const UNITS = ["pz", "kg", "litri", "rotoli", "conf", "bottiglie", "pacchi"];

type NewProductForm = {
  name: string;
  brand: string;
  category: string;
  unit: string;
  unit_cost: number;
  min_stock: number;
  barcode: string;
  notes: string;
};

type OFFResult = {
  productName: string;
  genericName: string;
  brand: string;
  quantity: string;
  imageUrl: string | null;
  categoryTags: string[];
  categories: string;
};

export type SavedProduct = {
  id: string;
  name: string;
  category: string;
  unit: string;
  unit_cost: number;
  min_stock: number;
  barcode: string;
  brand: string | null;
};

function guessUnit(quantity: string): string {
  const q = quantity.toLowerCase();
  if (/\b(ml|cl|l|litri?)\b/.test(q)) return "pz";
  if (/\b(kg|g|gr|gramm)\b/.test(q)) return "kg";
  return "pz";
}

function guessCategory(tags: string[], categoriesStr: string): string {
  const joined = [...tags, categoriesStr].join(" ").toLowerCase();
  // Order matters — more specific first
  const map: [RegExp, string][] = [
    [/beer|birra|wine|vino|spirit|liquor|alcol/, "Alcolici"],
    [/beverage|drink|water|acqua|juice|succo|bevand|mineral|soda|soft-drink|tea|tè|caffè|coffee/, "Bevande"],
    [/snack|chip|cracke|biscott|cookie|cioccolat|sweet|candy|dolc/, "Snack/Distributori"],
    [/breakfast|colazion|cereal|muesli|marmellat|jam|milk|latte|yogurt/, "Colazione"],
    [/clean|puliz|deterg|sapone|soap|detersiv/, "Pulizia"],
    [/toiletri|bagno|shampoo|gel|doccia|toothpaste|dentifricio/, "Bagno/Toiletries"],
    [/cucina|kitchen|cook|cuci|pasta|riso|rice|olio|oil|salsa|sauce/, "Cucina"],
    [/minibar/, "Minibar"],
    [/bar|cocktail/, "Bar"],
  ];
  for (const [re, cat] of map) {
    if (re.test(joined)) return cat;
  }
  return "Altro";
}

/** Clean up a product name: remove brand prefix if it's redundant, trim, titlecase */
function cleanName(raw: string, brand: string): string {
  let name = raw.trim();
  // Remove brand from the start if the name starts with it (case-insensitive)
  if (brand && name.toLowerCase().startsWith(brand.toLowerCase())) {
    name = name.slice(brand.length).trim();
    // Remove leading separator like " - ", " – ", ","
    name = name.replace(/^[\s,\-–]+/, "").trim();
  }
  return name;
}

/** Format quantity for display: "0.5 l" → "0,5L", "500 ml" → "500ml" */
function fmtQty(qty: string): string {
  if (!qty) return "";
  return qty
    .replace(/\s+/g, "")
    .replace(/(\d)\.(\d)/g, "$1,$2") // decimal dot → comma (Italian)
    .replace(/(\d)(l|ml|cl|kg|g)$/i, (_, n, u) => `${n}${u.toUpperCase() === "L" ? "L" : u.toLowerCase() === "ml" ? "ml" : u}`);
}

async function fetchOpenFoodFacts(barcode: string): Promise<OFFResult | null> {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;
    const p = data.product;
    // Prefer Italian name, fallback to generic
    const productName = (p.product_name_it || p.product_name || "").trim();
    const genericName = (p.generic_name_it || p.generic_name || "").trim();
    return {
      productName,
      genericName,
      brand: (p.brands || "").trim(),
      quantity: (p.quantity || "").trim(),
      imageUrl: p.image_url || p.image_front_url || null,
      categoryTags: p.categories_tags || [],
      categories: (p.categories || "").trim(),
    };
  } catch {
    return null;
  }
}

function buildFullName(off: OFFResult): string {
  const brand = off.brand.split(",")[0].trim();
  const qty = fmtQty(off.quantity);

  // Determine the descriptive name portion
  let descriptive = off.productName;
  const descriptiveLower = descriptive.toLowerCase();
  const brandLower = brand.toLowerCase();

  // If product_name is empty or is just the brand, use generic_name
  if (!descriptive || descriptiveLower === brandLower || descriptiveLower === brandLower + " " + qty.toLowerCase()) {
    descriptive = off.genericName || off.categories.split(",")[0]?.trim() || "";
  }

  // Clean brand prefix from descriptive name (avoid "Maniva Maniva ...")
  descriptive = cleanName(descriptive, brand);

  // Build final: [Brand] [Descriptive name] [Quantity]
  const parts = [brand, descriptive, qty].filter(Boolean);
  return parts.join(" ") || off.productName || "Prodotto senza nome";
}

export default function NewProductModal({ barcode, supabase, onSave, onClose }: {
  barcode: string;
  supabase: SupabaseClient;
  onSave: (product: SavedProduct) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<NewProductForm>({
    name: "", brand: "", category: "Altro", unit: "pz",
    unit_cost: 0, min_stock: 0, barcode, notes: "",
  });
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [offLoading, setOffLoading] = useState(true);
  const [offFound, setOffFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setOffLoading(true);
      const result = await fetchOpenFoodFacts(barcode);
      if (cancelled) return;
      if (result) {
        setOffFound(true);
        const brand = result.brand.split(",")[0].trim();
        const fullName = buildFullName(result);
        const unit = result.quantity ? guessUnit(result.quantity) : "pz";
        const category = guessCategory(result.categoryTags, result.categories);
        setForm(f => ({ ...f, name: fullName, brand, category, unit }));
        setImageUrl(result.imageUrl);
      }
      setOffLoading(false);
    })();
    return () => { cancelled = true; };
  }, [barcode]);

  async function save() {
    if (!form.name.trim()) { setError("Inserisci il nome del prodotto"); return; }
    setSaving(true);
    setError("");
    const payload = {
      name: form.name.trim(),
      brand: form.brand.trim() || null,
      category: form.category,
      unit: form.unit,
      unit_cost: form.unit_cost,
      min_stock: form.min_stock,
      barcode: form.barcode.trim() || null,
      notes: form.notes.trim() || null,
      active: true,
    };
    const { data, error: dbErr } = await supabase.from("products").insert(payload).select("id, name, category, unit, unit_cost, min_stock, barcode, brand").single();
    if (dbErr) { setError("Errore: " + dbErr.message); setSaving(false); return; }
    onSave(data as SavedProduct);
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 110 }}>
      <div className="modal-card" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="section-head" style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
          <h2>Nuovo prodotto</h2>
          <button className="btn-ghost" style={{ padding: "4px 10px", borderRadius: 8 }} onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
          {/* OFF status */}
          {offLoading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 10, background: "var(--surface-2)" }}>
              <div style={{ width: 18, height: 18, border: "2.5px solid var(--line)", borderTopColor: "var(--ink)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>Ricerca prodotto online...</span>
            </div>
          ) : offFound ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 10, background: "#E3EEE4", border: "1px solid rgba(45,90,61,.2)" }}>
              {imageUrl && (
                <img src={imageUrl} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "contain", background: "#fff", border: "1px solid var(--line)" }} />
              )}
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#2D5A3D" }}>Prodotto trovato online</div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>Dati pre-compilati da Open Food Facts. Puoi modificarli.</div>
              </div>
            </div>
          ) : (
            <div style={{ padding: "10px 16px", borderRadius: 10, background: "var(--surface-2)", fontSize: 13, color: "var(--ink-soft)" }}>
              Prodotto non trovato online. Compila manualmente i campi.
            </div>
          )}

          {/* Image preview + barcode */}
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            {imageUrl && (
              <img src={imageUrl} alt="Prodotto" style={{ width: 80, height: 80, borderRadius: 10, objectFit: "contain", background: "#fff", border: "1px solid var(--line)", flexShrink: 0 }} />
            )}
            <div style={{ flex: 1 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Barcode</label>
                <input value={form.barcode} readOnly style={{ fontFamily: "'Courier New', monospace", letterSpacing: 1, background: "var(--surface-2)", cursor: "not-allowed" }} />
              </div>
            </div>
          </div>

          {/* Name */}
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Nome prodotto</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Es. San Benedetto Acqua Frizzante 0,5L" />
          </div>

          {/* Brand */}
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Marca</label>
            <input value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} placeholder="Es. San Benedetto, Mulino Bianco..." />
          </div>

          {/* Category + Unit */}
          <div className="grid2">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Categoria</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Unita di misura</label>
              <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* Cost + Min stock */}
          <div className="grid2">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Costo unitario (EUR)</label>
              <input type="number" min="0" step="0.01" value={form.unit_cost} onChange={e => setForm({ ...form, unit_cost: Number(e.target.value) })} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Scorta minima</label>
              <input type="number" min="0" step="1" value={form.min_stock} onChange={e => setForm({ ...form, min_stock: Number(e.target.value) })} />
            </div>
          </div>

          {/* Notes */}
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Note (opzionale)</label>
            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Note opzionali..." />
          </div>

          {error && <div style={{ color: "var(--danger)", fontSize: 13, fontWeight: 600 }}>{error}</div>}

          <button className="btn btn-primary" style={{ width: "100%", padding: "14px 22px", fontSize: 15 }}
            onClick={save} disabled={saving || offLoading}>
            {saving ? "Salvataggio..." : "Salva prodotto"}
          </button>
        </div>

        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );
}
