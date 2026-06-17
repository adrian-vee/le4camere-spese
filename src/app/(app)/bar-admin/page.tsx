"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useRole } from "@/lib/useRole";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/Toast";
import { Modal } from "@/components/ui/Modal";
import { eur } from "@/lib/format";
import { BarCategory, BarProduct } from "@/lib/bar/types";
import { BAR_RECIPES, BAR_CATEGORIES as DRINK_LAB_CATEGORIES } from "@/lib/barRecipes";
import type { BarRecipe } from "@/lib/barRecipes";

import WarehouseLinkModal from "@/components/bar/WarehouseLinkModal";

type WarehouseProduct = { id: string; name: string; category: string | null; current_stock?: number };

const EMPTY_CATEGORY = { name: "", icon: "", sort_order: 0 };

const EMPTY_PRODUCT = {
  name: "",
  price: 0,
  category_id: "" as string | null,
  warehouse_product_id: "" as string | null,
  sort_order: 0,
  is_active: true,
  image_url: "" as string | null,
};

/* ─── Toggle Switch ─── */
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 40, height: 22, borderRadius: 11, border: "none", padding: 0,
        background: checked ? "var(--ok, #2D5A3D)" : "#ccc",
        cursor: disabled ? "not-allowed" : "pointer",
        position: "relative", transition: "background .2s",
        flexShrink: 0, opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{
        display: "block", width: 18, height: 18, borderRadius: "50%",
        background: "#fff", position: "absolute", top: 2,
        left: checked ? 20 : 2, transition: "left .2s",
        boxShadow: "0 1px 3px rgba(0,0,0,.2)",
      }} />
    </button>
  );
}

/* ─── Small icon buttons ─── */
function IconBtn({ onClick, title, children, danger }: { onClick: () => void; title: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        width: 30, height: 30, borderRadius: 6, border: "1px solid var(--line, #D8CCB8)",
        background: danger ? "rgba(158,59,46,.08)" : "transparent",
        color: danger ? "var(--danger, #9E3B2E)" : "var(--ink-soft, #6C6B5D)",
        cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, lineHeight: 1, padding: 0, flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

/* ─── Drink Lab Import Modal ─── */
function DrinkLabImportModal({
  isOpen,
  onClose,
  categories,
  existingDrinkLabIds,
  drinkPricesMap,
  onImport,
}: {
  isOpen: boolean;
  onClose: () => void;
  categories: BarCategory[];
  existingDrinkLabIds: Set<string>;
  drinkPricesMap: Map<string, number>;
  onImport: (recipes: BarRecipe[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterCat, setFilterCat] = useState<string>("all");
  const [importing, setImporting] = useState(false);

  // Reset selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelected(new Set());
      setFilterCat("all");
    }
  }, [isOpen]);

  const filteredRecipes = useMemo(() => {
    if (filterCat === "all") return BAR_RECIPES;
    return BAR_RECIPES.filter(r => r.category === filterCat);
  }, [filterCat]);

  const selectableRecipes = useMemo(
    () => filteredRecipes.filter(r => !existingDrinkLabIds.has(r.id)),
    [filteredRecipes, existingDrinkLabIds],
  );

  const allSelected = selectableRecipes.length > 0 && selectableRecipes.every(r => selected.has(r.id));

  function toggleAll() {
    if (allSelected) {
      const next = new Set(selected);
      for (const r of selectableRecipes) next.delete(r.id);
      setSelected(next);
    } else {
      const next = new Set(selected);
      for (const r of selectableRecipes) next.add(r.id);
      setSelected(next);
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function handleImport() {
    const toImport = BAR_RECIPES.filter(r => selected.has(r.id));
    if (toImport.length === 0) return;
    setImporting(true);
    await onImport(toImport);
    setImporting(false);
    onClose();
  }

  const selectedCount = selected.size;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Importa da Drink Lab" maxWidth={600}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Filter + select all */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <select
            value={filterCat}
            onChange={e => setFilterCat(e.target.value)}
            style={{
              padding: "6px 12px", border: "1px solid #D8CCB8",
              borderRadius: 8, fontSize: 13, fontFamily: "'Albert Sans', sans-serif",
              background: "#fff", color: "#1F3326",
            }}
          >
            <option value="all">Tutte le categorie</option>
            {DRINK_LAB_CATEGORIES.map(c => (
              <option key={c.key} value={c.key}>{c.key}</option>
            ))}
          </select>
          <label style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 13, fontFamily: "'Albert Sans', sans-serif", color: "#1F3326",
            cursor: "pointer",
          }}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              disabled={selectableRecipes.length === 0}
              style={{ width: 16, height: 16, accentColor: "#1F3326" }}
            />
            Seleziona tutti
          </label>
          <span style={{ fontSize: 12, color: "#6C6B5D", marginLeft: "auto" }}>
            {existingDrinkLabIds.size} gia importati
          </span>
        </div>

        {/* Recipe list */}
        <div style={{
          maxHeight: 400, overflowY: "auto",
          border: "1px solid #D8CCB8", borderRadius: 8,
        }}>
          {filteredRecipes.map(recipe => {
            const isImported = existingDrinkLabIds.has(recipe.id);
            const isChecked = selected.has(recipe.id);
            const price = drinkPricesMap.get(recipe.id) ?? recipe.price ?? 0;

            return (
              <div
                key={recipe.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 12px",
                  borderBottom: "1px solid #F3EBDD",
                  opacity: isImported ? 0.55 : 1,
                  background: isChecked ? "rgba(191,167,98,.08)" : "transparent",
                }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={isImported}
                  onChange={() => toggleOne(recipe.id)}
                  style={{ width: 16, height: 16, accentColor: "#1F3326", flexShrink: 0 }}
                />
                <img
                  src={recipe.image}
                  alt={recipe.name}
                  style={{
                    width: 40, height: 40, borderRadius: 8, objectFit: "cover",
                    background: "#1F3326", flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 600, color: "#1F3326",
                    fontFamily: "'Albert Sans', sans-serif",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {recipe.name}
                  </div>
                  <div style={{ fontSize: 12, color: "#6C6B5D", fontFamily: "'Albert Sans', sans-serif" }}>
                    {recipe.category}
                  </div>
                </div>
                <span style={{
                  fontFamily: "'Bebas Neue', sans-serif", fontSize: 16,
                  color: "#BFA762", letterSpacing: "0.5px", flexShrink: 0,
                }}>
                  {eur(price)}
                </span>
                {isImported && (
                  <span style={{
                    display: "inline-block", padding: "2px 10px", borderRadius: 20,
                    fontSize: 11, fontWeight: 600, flexShrink: 0,
                    background: "rgba(45,90,61,.12)", color: "#2D5A3D",
                  }}>
                    Importato
                  </span>
                )}
              </div>
            );
          })}
          {filteredRecipes.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "#6C6B5D", fontSize: 14 }}>
              Nessuna ricetta trovata.
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
          <button
            className="btn btn-ghost"
            onClick={onClose}
            style={{ padding: "10px 20px", fontSize: 14 }}
          >
            Annulla
          </button>
          <button
            className="btn btn-primary"
            disabled={importing || selectedCount === 0}
            onClick={handleImport}
            style={{ padding: "10px 24px", fontSize: 14 }}
          >
            {importing ? "Importazione..." : `Importa ${selectedCount} prodott${selectedCount === 1 ? "o" : "i"}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════ */
export default function BarAdminPage() {
  const supabase = createClient();
  const router = useRouter();
  const { isManager, loading: roleLoading } = useRole();
  const { toast, showToast } = useToast();

  /* ─── Role gate ─── */
  useEffect(() => {
    if (!roleLoading && !isManager) {
      router.replace("/");
    }
  }, [roleLoading, isManager, router]);

  /* ─── State ─── */
  const [categories, setCategories] = useState<BarCategory[]>([]);
  const [products, setProducts] = useState<BarProduct[]>([]);
  const [warehouseProducts, setWarehouseProducts] = useState<WarehouseProduct[]>([]);
  const [drinkPricesMap, setDrinkPricesMap] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  // Category inline editing
  const [editCatId, setEditCatId] = useState<string | null>(null);
  const [editCat, setEditCat] = useState(EMPTY_CATEGORY);
  const [newCat, setNewCat] = useState<typeof EMPTY_CATEGORY | null>(null);
  const [savingCat, setSavingCat] = useState(false);

  // Product modal
  const [showProductModal, setShowProductModal] = useState(false);
  const [editProduct, setEditProduct] = useState<BarProduct | null>(null);
  const [pf, setPf] = useState({ ...EMPTY_PRODUCT });
  const [savingProduct, setSavingProduct] = useState(false);

  // Product filter
  const [filterCat, setFilterCat] = useState<string>("all");

  // Import modal
  const [showImportModal, setShowImportModal] = useState(false);

  // Warehouse link modal
  const [showLinkModal, setShowLinkModal] = useState(false);

  /* ─── Load data ─── */
  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: cats }, { data: prods }, { data: wp }, { data: dp }] = await Promise.all([
      supabase.from("bar_categories").select("*").order("sort_order"),
      supabase.from("bar_products").select("*").order("sort_order"),
      supabase.from("stock_levels").select("product_id, name, category, current_stock").eq("active", true).order("name"),
      supabase.from("drink_prices").select("recipe_id, price"),
    ]);
    setCategories((cats ?? []) as BarCategory[]);
    setProducts((prods ?? []) as BarProduct[]);
    setWarehouseProducts((wp ?? []).map((w: Record<string, unknown>) => ({
      id: w.product_id as string,
      name: w.name as string,
      category: w.category as string | null,
      current_stock: w.current_stock as number | undefined,
    })));
    const priceMap = new Map<string, number>();
    if (dp) {
      for (const row of dp) {
        priceMap.set(row.recipe_id, row.price);
      }
    }
    setDrinkPricesMap(priceMap);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Category helpers ─── */
  const catMap = useMemo(() => {
    const m = new Map<string, BarCategory>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  function startEditCat(cat: BarCategory) {
    setEditCatId(cat.id);
    setEditCat({ name: cat.name, icon: cat.icon ?? "", sort_order: cat.sort_order });
    setNewCat(null);
  }

  function cancelEditCat() {
    setEditCatId(null);
    setEditCat(EMPTY_CATEGORY);
  }

  async function saveCat(id: string) {
    if (!editCat.name.trim()) return showToast("Inserisci il nome della categoria.", "warn");
    setSavingCat(true);
    const { error } = await supabase.from("bar_categories").update({
      name: editCat.name.trim(),
      icon: editCat.icon.trim() || null,
      sort_order: editCat.sort_order,
    }).eq("id", id);
    setSavingCat(false);
    if (error) return showToast("Errore: " + error.message, "error");
    showToast("Categoria aggiornata");
    setEditCatId(null);
    load();
  }

  async function addCat() {
    if (!newCat || !newCat.name.trim()) return showToast("Inserisci il nome della categoria.", "warn");
    setSavingCat(true);
    const maxSort = categories.length > 0 ? Math.max(...categories.map(c => c.sort_order)) : 0;
    const { error } = await supabase.from("bar_categories").insert({
      name: newCat.name.trim(),
      icon: newCat.icon.trim() || null,
      sort_order: newCat.sort_order || maxSort + 1,
    });
    setSavingCat(false);
    if (error) return showToast("Errore: " + error.message, "error");
    showToast("Categoria creata");
    setNewCat(null);
    load();
  }

  async function deleteCat(cat: BarCategory) {
    if (!window.confirm(`Eliminare la categoria "${cat.name}"? I prodotti associati perderanno la categoria.`)) return;
    const { error } = await supabase.from("bar_categories").delete().eq("id", cat.id);
    if (error) return showToast("Errore: " + error.message, "error");
    showToast("Categoria eliminata");
    load();
  }

  async function toggleCatActive(cat: BarCategory) {
    const { error } = await supabase.from("bar_categories").update({ is_active: !cat.is_active }).eq("id", cat.id);
    if (error) return showToast("Errore: " + error.message, "error");
    load();
  }

  async function moveCat(cat: BarCategory, direction: "up" | "down") {
    const idx = categories.findIndex(c => c.id === cat.id);
    if (direction === "up" && idx <= 0) return;
    if (direction === "down" && idx >= categories.length - 1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    const other = categories[swapIdx];
    await Promise.all([
      supabase.from("bar_categories").update({ sort_order: other.sort_order }).eq("id", cat.id),
      supabase.from("bar_categories").update({ sort_order: cat.sort_order }).eq("id", other.id),
    ]);
    load();
  }

  /* ─── Product helpers ─── */
  const filteredProducts = useMemo(() => {
    if (filterCat === "all") return products;
    if (filterCat === "none") return products.filter(p => !p.category_id);
    return products.filter(p => p.category_id === filterCat);
  }, [products, filterCat]);

  function openNewProduct() {
    setEditProduct(null);
    const maxSort = products.length > 0 ? Math.max(...products.map(p => p.sort_order)) : 0;
    setPf({ ...EMPTY_PRODUCT, sort_order: maxSort + 1, is_active: true });
    setShowProductModal(true);
  }

  function openEditProduct(p: BarProduct) {
    setEditProduct(p);
    setPf({
      name: p.name,
      price: p.price,
      category_id: p.category_id ?? "",
      warehouse_product_id: p.warehouse_product_id ?? "",
      sort_order: p.sort_order,
      is_active: p.is_active,
      image_url: p.image_url ?? "",
    });
    setShowProductModal(true);
  }

  async function saveProduct() {
    if (!pf.name.trim()) return showToast("Inserisci il nome del prodotto.", "warn");
    if (pf.price < 0) return showToast("Il prezzo non puo essere negativo.", "warn");
    setSavingProduct(true);
    const payload = {
      name: pf.name.trim(),
      price: Number(pf.price),
      category_id: pf.category_id || null,
      warehouse_product_id: pf.warehouse_product_id || null,
      sort_order: Number(pf.sort_order),
      is_active: pf.is_active,
      image_url: pf.image_url || null,
    };
    if (editProduct) {
      const { error } = await supabase.from("bar_products").update(payload).eq("id", editProduct.id);
      setSavingProduct(false);
      if (error) return showToast("Errore: " + error.message, "error");
      showToast("Prodotto aggiornato");
    } else {
      const { error } = await supabase.from("bar_products").insert(payload);
      setSavingProduct(false);
      if (error) return showToast("Errore: " + error.message, "error");
      showToast("Prodotto creato");
    }
    setShowProductModal(false);
    load();
  }

  async function deleteProduct(p: BarProduct) {
    if (!window.confirm(`Eliminare "${p.name}" dal listino bar?`)) return;
    const { error } = await supabase.from("bar_products").delete().eq("id", p.id);
    if (error) return showToast("Errore: " + error.message, "error");
    showToast("Prodotto eliminato");
    load();
  }

  async function toggleProductActive(p: BarProduct) {
    const { error } = await supabase.from("bar_products").update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) return showToast("Errore: " + error.message, "error");
    load();
  }

  /* ─── Drink Lab Import ─── */
  const existingDrinkLabIds = useMemo(() => {
    const s = new Set<string>();
    for (const p of products) {
      if (p.drink_lab_id) s.add(p.drink_lab_id);
    }
    return s;
  }, [products]);

  function findMatchingCategoryId(drinkLabCategory: string): string | null {
    const lower = drinkLabCategory.toLowerCase();
    for (const cat of categories) {
      const catLower = cat.name.toLowerCase();
      if (catLower.includes(lower) || lower.includes(catLower)) {
        return cat.id;
      }
    }
    return null;
  }

  async function handleDrinkLabImport(recipes: BarRecipe[]) {
    const maxSort = products.length > 0 ? Math.max(...products.map(p => p.sort_order)) : 0;
    const rows = recipes.map((recipe, i) => ({
      name: recipe.name,
      price: drinkPricesMap.get(recipe.id) ?? recipe.price ?? 0,
      image_url: recipe.image,
      drink_lab_id: recipe.id,
      category_id: findMatchingCategoryId(recipe.category),
      is_active: true,
      sort_order: maxSort + 1 + i,
    }));
    const { error } = await supabase.from("bar_products").insert(rows);
    if (error) {
      showToast("Errore importazione: " + error.message, "error");
      return;
    }
    showToast(`${recipes.length} prodott${recipes.length === 1 ? "o importato" : "i importati"} da Drink Lab`);
    load();
  }

  async function handleDrinkLabUpdate() {
    const toUpdate = products.filter(p => p.drink_lab_id);
    if (toUpdate.length === 0) {
      showToast("Nessun prodotto collegato a Drink Lab.", "warn");
      return;
    }
    let count = 0;
    for (const prod of toUpdate) {
      const recipe = BAR_RECIPES.find(r => r.id === prod.drink_lab_id);
      if (!recipe) continue;

      const updates: Record<string, unknown> = {};
      // Always sync image from recipe (canonical source)
      if (recipe.image && recipe.image !== prod.image_url) {
        updates.image_url = recipe.image;
      }
      // Update price from drink_prices if available
      const dpPrice = drinkPricesMap.get(recipe.id);
      if (dpPrice !== undefined && dpPrice !== prod.price) {
        updates.price = dpPrice;
      }

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase.from("bar_products").update(updates).eq("id", prod.id);
        if (!error) count++;
      }
    }
    showToast(`${count} prodott${count === 1 ? "o aggiornato" : "i aggiornati"} da Drink Lab`);
    if (count > 0) load();
  }

  /* ─── Warehouse link ─── */
  const unlinkedProducts = useMemo(
    () => products.filter(p => !p.warehouse_product_id && p.is_active),
    [products]
  );

  async function handleApplyLinks(links: { barProductId: string; warehouseProductId: string }[]) {
    let count = 0;
    for (const link of links) {
      const { error } = await supabase
        .from("bar_products")
        .update({ warehouse_product_id: link.warehouseProductId })
        .eq("id", link.barProductId);
      if (!error) count++;
    }
    showToast(`${count} prodott${count === 1 ? "o collegato" : "i collegati"} al magazzino`);
    if (count > 0) load();
  }

  /* ─── Render guard ─── */
  if (roleLoading || !isManager) {
    return <div style={{ padding: 40, textAlign: "center", color: "#6C6B5D", fontFamily: "'Albert Sans', sans-serif" }}>Caricamento...</div>;
  }

  /* ─── Inline category row (view mode) ─── */
  function CatRow({ cat, idx }: { cat: BarCategory; idx: number }) {
    const isEditing = editCatId === cat.id;
    if (isEditing) {
      return (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
          background: "var(--surface-2, #F3EBDD)", borderRadius: 8,
        }}>
          <input
            value={editCat.icon}
            onChange={e => setEditCat({ ...editCat, icon: e.target.value })}
            placeholder="coffee"
            maxLength={30}
            style={{
              width: 100, textAlign: "center", fontSize: 13,
              padding: "6px 4px", border: "1px solid var(--line, #D8CCB8)", borderRadius: 6,
              fontFamily: "'Albert Sans', sans-serif", background: "#fff",
            }}
          />
          <input
            value={editCat.name}
            onChange={e => setEditCat({ ...editCat, name: e.target.value })}
            placeholder="Nome categoria"
            style={{
              flex: 1, padding: "6px 10px", border: "1px solid var(--line, #D8CCB8)",
              borderRadius: 6, fontSize: 14, fontFamily: "'Albert Sans', sans-serif", background: "#fff",
            }}
          />
          <button
            className="btn btn-primary"
            disabled={savingCat}
            onClick={() => saveCat(cat.id)}
            style={{ padding: "6px 14px", fontSize: 13 }}
          >
            Salva
          </button>
          <button
            className="btn btn-ghost"
            onClick={cancelEditCat}
            style={{ padding: "6px 14px", fontSize: 13 }}
          >
            Annulla
          </button>
        </div>
      );
    }

    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
        background: cat.is_active ? "transparent" : "rgba(108,107,93,.05)",
        borderRadius: 8, borderBottom: "1px solid var(--line, #D8CCB8)",
        opacity: cat.is_active ? 1 : 0.55,
      }}>
        <span style={{ fontSize: 20, width: 28, textAlign: "center", flexShrink: 0 }}>
          {cat.icon ? <i className={`ti ti-${cat.icon}`} /> : <i className="ti ti-folder" />}
        </span>
        <span style={{
          flex: 1, fontSize: 14, fontWeight: 600, color: "var(--ink, #1F3326)",
          fontFamily: "'Albert Sans', sans-serif",
        }}>
          {cat.name}
        </span>
        <Toggle checked={cat.is_active} onChange={() => toggleCatActive(cat)} />
        <div style={{ display: "flex", gap: 4 }}>
          <IconBtn title="Sposta su" onClick={() => moveCat(cat, "up")}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 15l-6-6-6 6" /></svg>
          </IconBtn>
          <IconBtn title="Sposta giu" onClick={() => moveCat(cat, "down")}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
          </IconBtn>
          <IconBtn title="Modifica" onClick={() => startEditCat(cat)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
          </IconBtn>
          <IconBtn title="Elimina" onClick={() => deleteCat(cat)} danger>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
          </IconBtn>
        </div>
      </div>
    );
  }

  /* ─── Inline new category form ─── */
  function NewCatForm() {
    if (!newCat) return null;
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
        background: "var(--surface-2, #F3EBDD)", borderRadius: 8, marginTop: 8,
      }}>
        <input
          value={newCat.icon}
          onChange={e => setNewCat({ ...newCat, icon: e.target.value })}
          placeholder="coffee"
          maxLength={30}
          style={{
            width: 100, textAlign: "center", fontSize: 13,
            padding: "6px 4px", border: "1px solid var(--line, #D8CCB8)", borderRadius: 6,
            fontFamily: "'Albert Sans', sans-serif", background: "#fff",
          }}
        />
        <input
          value={newCat.name}
          onChange={e => setNewCat({ ...newCat, name: e.target.value })}
          placeholder="Nome nuova categoria"
          autoFocus
          style={{
            flex: 1, padding: "6px 10px", border: "1px solid var(--line, #D8CCB8)",
            borderRadius: 6, fontSize: 14, fontFamily: "'Albert Sans', sans-serif", background: "#fff",
          }}
          onKeyDown={e => { if (e.key === "Enter") addCat(); }}
        />
        <button className="btn btn-primary" disabled={savingCat} onClick={addCat} style={{ padding: "6px 14px", fontSize: 13 }}>
          Aggiungi
        </button>
        <button className="btn btn-ghost" onClick={() => setNewCat(null)} style={{ padding: "6px 14px", fontSize: 13 }}>
          Annulla
        </button>
      </div>
    );
  }

  /* ─── Main render ─── */
  return (
    <div style={{ padding: "24px 28px 60px", fontFamily: "'Albert Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{
          fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 500,
          color: "var(--ink, #1F3326)", margin: 0,
        }}>
          Gestione Prodotti Bar
        </h1>
        <p style={{ fontSize: 14, color: "var(--ink-soft, #6C6B5D)", margin: "4px 0 0" }}>
          Categorie, prodotti e listino prezzi del servizio bar
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--ink-soft, #6C6B5D)" }}>Caricamento dati...</div>
      ) : (
        <div className="bar-admin-grid" style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)",
          gap: 24,
          alignItems: "start",
        }}>
          {/* ─── Left: Categories ─── */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{
                fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 500,
                color: "var(--ink, #1F3326)", margin: 0,
              }}>
                Categorie
              </h2>
              <button
                className="btn btn-primary"
                onClick={() => { setNewCat({ ...EMPTY_CATEGORY }); setEditCatId(null); }}
                style={{ padding: "6px 14px", fontSize: 13 }}
              >
                + Nuova
              </button>
            </div>

            {categories.length === 0 && !newCat && (
              <p style={{ fontSize: 14, color: "var(--ink-soft, #6C6B5D)", textAlign: "center", padding: "20px 0" }}>
                Nessuna categoria. Creane una per iniziare.
              </p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {categories.map((cat, idx) => (
                <CatRow key={cat.id} cat={cat} idx={idx} />
              ))}
            </div>

            <NewCatForm />
          </div>

          {/* ─── Right: Products (Card Grid) ─── */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <h2 style={{
                fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 500,
                color: "var(--ink, #1F3326)", margin: 0,
              }}>
                Prodotti
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <select
                  value={filterCat}
                  onChange={e => setFilterCat(e.target.value)}
                  style={{
                    padding: "6px 12px", border: "1px solid var(--line, #D8CCB8)",
                    borderRadius: 8, fontSize: 13, fontFamily: "'Albert Sans', sans-serif",
                    background: "#fff", color: "var(--ink, #1F3326)",
                  }}
                >
                  <option value="all">Tutte le categorie</option>
                  <option value="none">Senza categoria</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.icon ? c.icon + " " : ""}{c.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    if (unlinkedProducts.length === 0) {
                      showToast("Tutti i prodotti attivi sono gia collegati al magazzino.", "warn");
                      return;
                    }
                    setShowLinkModal(true);
                  }}
                  style={{
                    padding: "6px 14px", fontSize: 13, borderRadius: 8,
                    border: "none", background: "#1F3326", color: "#fff",
                    fontFamily: "'Albert Sans', sans-serif", fontWeight: 600,
                    cursor: "pointer", whiteSpace: "nowrap",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <i className="ti ti-link" style={{ fontSize: 15 }} />
                  Collega al Magazzino
                  {unlinkedProducts.length > 0 && (
                    <span style={{
                      background: "#C4453C", color: "#fff", fontSize: 10,
                      fontWeight: 700, borderRadius: 10, padding: "1px 6px",
                      lineHeight: "16px",
                    }}>
                      {unlinkedProducts.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setShowImportModal(true)}
                  style={{
                    padding: "6px 14px", fontSize: 13, borderRadius: 8,
                    border: "none", background: "#BFA762", color: "#fff",
                    fontFamily: "'Albert Sans', sans-serif", fontWeight: 600,
                    cursor: "pointer", whiteSpace: "nowrap",
                  }}
                >
                  Importa da Drink Lab
                </button>
                <button
                  onClick={handleDrinkLabUpdate}
                  style={{
                    padding: "6px 12px", fontSize: 12, borderRadius: 8,
                    border: "1px solid var(--line, #D8CCB8)", background: "#fff",
                    color: "var(--ink, #1F3326)",
                    fontFamily: "'Albert Sans', sans-serif", fontWeight: 500,
                    cursor: "pointer", whiteSpace: "nowrap",
                  }}
                >
                  Aggiorna da Drink Lab
                </button>
                <button className="btn btn-primary" onClick={openNewProduct} style={{ padding: "6px 14px", fontSize: 13 }}>
                  + Nuovo prodotto
                </button>
              </div>
            </div>

            {filteredProducts.length === 0 ? (
              <p style={{ fontSize: 14, color: "var(--ink-soft, #6C6B5D)", textAlign: "center", padding: "20px 0" }}>
                Nessun prodotto trovato.
              </p>
            ) : (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 14,
              }}>
                {filteredProducts.map(p => {
                  const cat = p.category_id ? catMap.get(p.category_id) : null;
                  const wp = p.warehouse_product_id
                    ? warehouseProducts.find(w => w.id === p.warehouse_product_id)
                    : null;

                  return (
                    <div
                      key={p.id}
                      style={{
                        background: "#fff",
                        border: "1px solid #D8CCB8",
                        borderRadius: 12,
                        overflow: "hidden",
                        opacity: p.is_active ? 1 : 0.5,
                        display: "flex",
                        flexDirection: "column",
                        transition: "opacity .2s",
                      }}
                    >
                      {/* Image */}
                      {p.image_url ? (
                        <div style={{
                          height: 100, background: "#1F3326",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          overflow: "hidden",
                        }}>
                          <img
                            src={p.image_url}
                            alt={p.name}
                            style={{ width: "100%", height: "100%", objectFit: "contain" }}
                          />
                        </div>
                      ) : (
                        <div style={{
                          height: 100, background: "#F3EBDD",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: "#D8CCB8", fontSize: 32,
                        }}>
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <path d="M21 15l-5-5L5 21" />
                          </svg>
                        </div>
                      )}

                      {/* Content */}
                      <div style={{ padding: "10px 12px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                        {/* Name */}
                        <div style={{
                          fontSize: 14, fontWeight: 600, color: "#1F3326",
                          fontFamily: "'Albert Sans', sans-serif",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {p.name}
                        </div>

                        {/* Price */}
                        <div style={{
                          fontFamily: "'Bebas Neue', sans-serif", fontSize: 20,
                          color: "#BFA762", letterSpacing: "0.5px", lineHeight: 1,
                        }}>
                          {eur(p.price)}
                        </div>

                        {/* Badges row */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {cat && (
                            <span style={{
                              display: "inline-block", padding: "2px 10px", borderRadius: 20,
                              fontSize: 11, fontWeight: 500,
                              background: "rgba(191,167,98,.12)", color: "#1F3326",
                            }}>
                              {cat.icon ? cat.icon + " " : ""}{cat.name}
                            </span>
                          )}
                          {wp ? (
                            <span
                              style={{
                                display: "inline-block", padding: "2px 10px", borderRadius: 20,
                                fontSize: 11, fontWeight: 600,
                                background: "rgba(45,90,61,.12)", color: "#2D5A3D",
                              }}
                              title={`Magazzino: ${wp.name}`}
                            >
                              {"\u2713"} Magazzino
                            </span>
                          ) : (
                            <span
                              onClick={(e) => { e.stopPropagation(); openEditProduct(p); }}
                              style={{
                                display: "inline-block", padding: "2px 10px", borderRadius: 20,
                                fontSize: 11, fontWeight: 600, cursor: "pointer",
                                background: "rgba(199,123,74,.12)", color: "#C77B4A",
                              }}
                              title="Clicca per collegare al magazzino"
                            >
                              {"\u26A0"} Non collegato
                            </span>
                          )}
                          {p.drink_lab_id && (
                            <span style={{
                              display: "inline-block", padding: "2px 10px", borderRadius: 20,
                              fontSize: 11, fontWeight: 600,
                              background: "rgba(191,167,98,.15)", color: "#8B6914",
                            }}>
                              Drink Lab
                            </span>
                          )}
                        </div>

                        {/* Spacer */}
                        <div style={{ flex: 1 }} />

                        {/* Bottom: toggle + actions */}
                        <div style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          paddingTop: 8, borderTop: "1px solid #F3EBDD", marginTop: 4,
                        }}>
                          <Toggle checked={p.is_active} onChange={() => toggleProductActive(p)} />
                          <div style={{ display: "flex", gap: 4 }}>
                            <IconBtn title="Modifica" onClick={() => openEditProduct(p)}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                            </IconBtn>
                            <IconBtn title="Elimina" onClick={() => deleteProduct(p)} danger>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                            </IconBtn>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Summary line */}
            <div style={{
              marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line, #D8CCB8)",
              display: "flex", justifyContent: "space-between", fontSize: 13,
              color: "var(--ink-soft, #6C6B5D)",
            }}>
              <span>{filteredProducts.length} prodott{filteredProducts.length === 1 ? "o" : "i"}</span>
              <span>{products.filter(p => p.is_active).length} attivi su {products.length} totali</span>
            </div>
          </div>
        </div>
      )}

      {/* ─── Product Modal ─── */}
      <Modal
        isOpen={showProductModal}
        onClose={() => setShowProductModal(false)}
        title={editProduct ? "Modifica Prodotto" : "Nuovo Prodotto"}
        maxWidth={480}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Nome */}
          <div className="field">
            <label>Nome *</label>
            <input
              value={pf.name}
              onChange={e => setPf({ ...pf, name: e.target.value })}
              placeholder="Nome prodotto"
              required
            />
          </div>

          {/* Prezzo */}
          <div className="field">
            <label>Prezzo *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={pf.price}
              onChange={e => setPf({ ...pf, price: parseFloat(e.target.value) || 0 })}
              placeholder="0.00"
              required
            />
          </div>

          {/* Categoria */}
          <div className="field">
            <label>Categoria</label>
            <select
              value={pf.category_id ?? ""}
              onChange={e => setPf({ ...pf, category_id: e.target.value || null })}
            >
              <option value="">Nessuna categoria</option>
              {categories.filter(c => c.is_active).map(c => (
                <option key={c.id} value={c.id}>{c.icon ? c.icon + " " : ""}{c.name}</option>
              ))}
            </select>
          </div>

          {/* Prodotto magazzino */}
          <div className="field">
            <label>Prodotto magazzino</label>
            {pf.warehouse_product_id ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  flex: 1, padding: "8px 12px", border: "1px solid #D8CCB8",
                  borderRadius: 8, fontSize: 14, color: "#1F3326", background: "#F3EBDD",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  <span style={{ color: "#2D5A3D", fontWeight: 700 }}>{"\u2713"}</span>
                  {warehouseProducts.find(w => w.id === pf.warehouse_product_id)?.name ?? "Prodotto sconosciuto"}
                  {(() => {
                    const wp = warehouseProducts.find(w => w.id === pf.warehouse_product_id);
                    return wp?.current_stock != null ? (
                      <span style={{ marginLeft: "auto", fontSize: 12, color: "#6C6B5D" }}>
                        Giacenza: {wp.current_stock}
                      </span>
                    ) : null;
                  })()}
                </span>
                <button
                  type="button"
                  onClick={() => setPf({ ...pf, warehouse_product_id: "" })}
                  style={{
                    padding: "6px 12px", borderRadius: 6,
                    border: "1px solid #D8CCB8", background: "#fff",
                    fontSize: 12, fontWeight: 600, color: "#9E3B2E",
                    cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                  }}
                >
                  Scollega
                </button>
              </div>
            ) : (
              <select
                value=""
                onChange={e => setPf({ ...pf, warehouse_product_id: e.target.value || null })}
              >
                <option value="">Non collegato — seleziona...</option>
                {warehouseProducts.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name}{w.category ? ` (${w.category})` : ""}
                    {w.current_stock != null ? ` [${w.current_stock}]` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Immagine prodotto */}
          <div className="field">
            <label>Immagine</label>
            {pf.image_url && (
              <div style={{ marginBottom: 8, position: "relative", display: "inline-block" }}>
                <img
                  src={pf.image_url}
                  alt="Anteprima"
                  style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid #D8CCB8" }}
                />
                <button
                  type="button"
                  onClick={() => setPf({ ...pf, image_url: "" })}
                  style={{
                    position: "absolute", top: -6, right: -6,
                    width: 22, height: 22, borderRadius: "50%",
                    background: "#9E3B2E", color: "#fff", border: "none",
                    fontSize: 12, fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  x
                </button>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const ext = file.name.split(".").pop() || "jpg";
                const path = `bar-products/${Date.now()}.${ext}`;
                const { error } = await supabase.storage.from("documenti").upload(path, file);
                if (error) { showToast("Errore upload: " + error.message, "error"); return; }
                const { data: urlData } = supabase.storage.from("documenti").getPublicUrl(path);
                setPf({ ...pf, image_url: urlData.publicUrl });
                showToast("Immagine caricata");
              }}
              style={{
                fontSize: 13, fontFamily: "'Albert Sans', sans-serif",
                padding: "6px 0", color: "var(--ink, #1F3326)",
              }}
            />
          </div>

          {/* Ordinamento + Attivo row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="field">
              <label>Ordinamento</label>
              <input
                type="number"
                min="0"
                value={pf.sort_order}
                onChange={e => setPf({ ...pf, sort_order: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="field" style={{ display: "flex", flexDirection: "column" }}>
              <label>Attivo</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
                <Toggle checked={pf.is_active} onChange={v => setPf({ ...pf, is_active: v })} />
                <span style={{ fontSize: 13, color: "var(--ink-soft, #6C6B5D)" }}>
                  {pf.is_active ? "Visibile nel listino" : "Nascosto"}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
            <button
              className="btn btn-ghost"
              onClick={() => setShowProductModal(false)}
              style={{ padding: "10px 20px", fontSize: 14 }}
            >
              Annulla
            </button>
            <button
              className="btn btn-primary"
              disabled={savingProduct}
              onClick={saveProduct}
              style={{ padding: "10px 24px", fontSize: 14 }}
            >
              {savingProduct ? "Salvataggio..." : editProduct ? "Salva Modifiche" : "Crea Prodotto"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ─── Drink Lab Import Modal ─── */}
      <DrinkLabImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        categories={categories}
        existingDrinkLabIds={existingDrinkLabIds}
        drinkPricesMap={drinkPricesMap}
        onImport={handleDrinkLabImport}
      />

      {/* ─── Warehouse Link Modal ─── */}
      <WarehouseLinkModal
        isOpen={showLinkModal}
        onClose={() => setShowLinkModal(false)}
        unlinkedProducts={unlinkedProducts}
        warehouseProducts={warehouseProducts}
        onApply={handleApplyLinks}
      />

      <Toast toast={toast} />

      {/* ─── Responsive ─── */}
      <style>{`
        @media (max-width: 768px) {
          .bar-admin-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
