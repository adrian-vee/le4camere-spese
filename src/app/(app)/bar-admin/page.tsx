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
import { BAR_RECIPES, BAR_CATEGORIES } from "@/lib/barRecipes";

type WarehouseProduct = { id: string; name: string; category: string | null };

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
        background: checked ? "#2D5A3D" : "#ccc",
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
        width: 30, height: 30, borderRadius: 6, border: "1px solid #D8CCB8",
        background: danger ? "rgba(158,59,46,.08)" : "transparent",
        color: danger ? "#9E3B2E" : "#6C6B5D",
        cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, lineHeight: 1, padding: 0, flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

/* ═══════════════════════════════════════════════ */
export default function BarAdminPage() {
  const supabase = createClient();
  const router = useRouter();
  const { isManager, loading: roleLoading } = useRole();
  const { toast, showToast } = useToast();

  useEffect(() => {
    if (!roleLoading && !isManager) router.replace("/");
  }, [roleLoading, isManager, router]);

  /* ─── State ─── */
  const [categories, setCategories] = useState<BarCategory[]>([]);
  const [products, setProducts] = useState<BarProduct[]>([]);
  const [warehouseProducts, setWarehouseProducts] = useState<WarehouseProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const [editCatId, setEditCatId] = useState<string | null>(null);
  const [editCat, setEditCat] = useState(EMPTY_CATEGORY);
  const [newCat, setNewCat] = useState<typeof EMPTY_CATEGORY | null>(null);
  const [savingCat, setSavingCat] = useState(false);

  const [showProductModal, setShowProductModal] = useState(false);
  const [editProduct, setEditProduct] = useState<BarProduct | null>(null);
  const [pf, setPf] = useState({ ...EMPTY_PRODUCT });
  const [savingProduct, setSavingProduct] = useState(false);

  const [filterCat, setFilterCat] = useState<string>("all");

  const [showImportModal, setShowImportModal] = useState(false);
  const [importSelection, setImportSelection] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  /* ─── Load data ─── */
  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: cats }, { data: prods }, { data: wp }] = await Promise.all([
      supabase.from("bar_categories").select("*").order("sort_order"),
      supabase.from("bar_products").select("*").order("sort_order"),
      supabase.from("products").select("id, name, category").eq("active", true).order("name"),
    ]);
    setCategories((cats ?? []) as BarCategory[]);
    setProducts((prods ?? []) as BarProduct[]);
    setWarehouseProducts((wp ?? []) as WarehouseProduct[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Derived ─── */
  const catMap = useMemo(() => {
    const m = new Map<string, BarCategory>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const filteredProducts = useMemo(() => {
    if (filterCat === "all") return products;
    if (filterCat === "none") return products.filter(p => !p.category_id);
    return products.filter(p => p.category_id === filterCat);
  }, [products, filterCat]);

  const importedDrinkIds = useMemo(
    () => new Set(products.filter(p => p.drink_lab_id).map(p => p.drink_lab_id!)),
    [products]
  );

  /* ─── Category helpers ─── */
  function startEditCat(cat: BarCategory) {
    setEditCatId(cat.id);
    setEditCat({ name: cat.name, icon: cat.icon ?? "", sort_order: cat.sort_order });
    setNewCat(null);
  }

  function cancelEditCat() { setEditCatId(null); setEditCat(EMPTY_CATEGORY); }

  async function saveCat(id: string) {
    if (!editCat.name.trim()) return showToast("Inserisci il nome della categoria.", "warn");
    setSavingCat(true);
    const { error } = await supabase.from("bar_categories").update({
      name: editCat.name.trim(), icon: editCat.icon.trim() || null, sort_order: editCat.sort_order,
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
      name: newCat.name.trim(), icon: newCat.icon.trim() || null, sort_order: newCat.sort_order || maxSort + 1,
    });
    setSavingCat(false);
    if (error) return showToast("Errore: " + error.message, "error");
    showToast("Categoria creata");
    setNewCat(null);
    load();
  }

  async function deleteCat(cat: BarCategory) {
    if (!window.confirm(`Eliminare la categoria "${cat.name}"?`)) return;
    const { error } = await supabase.from("bar_categories").delete().eq("id", cat.id);
    if (error) return showToast("Errore: " + error.message, "error");
    showToast("Categoria eliminata");
    load();
  }

  async function toggleCatActive(cat: BarCategory) {
    await supabase.from("bar_categories").update({ is_active: !cat.is_active }).eq("id", cat.id);
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
  function openNewProduct() {
    setEditProduct(null);
    const maxSort = products.length > 0 ? Math.max(...products.map(p => p.sort_order)) : 0;
    setPf({ ...EMPTY_PRODUCT, sort_order: maxSort + 1, is_active: true });
    setShowProductModal(true);
  }

  function openEditProduct(p: BarProduct) {
    setEditProduct(p);
    setPf({
      name: p.name, price: p.price, category_id: p.category_id ?? "",
      warehouse_product_id: p.warehouse_product_id ?? "", sort_order: p.sort_order,
      is_active: p.is_active, image_url: p.image_url ?? "",
    });
    setShowProductModal(true);
  }

  async function saveProduct() {
    if (!pf.name.trim()) return showToast("Inserisci il nome del prodotto.", "warn");
    if (pf.price < 0) return showToast("Il prezzo non può essere negativo.", "warn");
    setSavingProduct(true);
    const payload = {
      name: pf.name.trim(), price: Number(pf.price), category_id: pf.category_id || null,
      warehouse_product_id: pf.warehouse_product_id || null, sort_order: Number(pf.sort_order),
      is_active: pf.is_active, image_url: pf.image_url || null,
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
    await supabase.from("bar_products").update({ is_active: !p.is_active }).eq("id", p.id);
    load();
  }

  /* ─── Drink Lab import ─── */
  function openImportModal() {
    const available = BAR_RECIPES.filter(r => !importedDrinkIds.has(r.id));
    setImportSelection(new Set(available.map(r => r.id)));
    setShowImportModal(true);
  }

  function toggleImportItem(id: string) {
    setImportSelection(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllImport() {
    const available = BAR_RECIPES.filter(r => !importedDrinkIds.has(r.id));
    if (importSelection.size === available.length) {
      setImportSelection(new Set());
    } else {
      setImportSelection(new Set(available.map(r => r.id)));
    }
  }

  async function executeImport() {
    if (importSelection.size === 0) return;
    setImporting(true);

    const catNameToId = new Map<string, string>();
    for (const c of categories) catNameToId.set(c.name.toLowerCase(), c.id);

    const drinkCatMapping: Record<string, string> = {
      "spritz & aperitivi": "cocktail",
      "cocktail": "cocktail",
      "digestivi & amari": "digestivi",
      "grappe": "grappe",
    };

    const maxSort = products.length > 0 ? Math.max(...products.map(p => p.sort_order)) : 0;
    const toInsert = [];
    let sortCounter = maxSort + 1;

    for (const recipe of BAR_RECIPES) {
      if (!importSelection.has(recipe.id)) continue;
      if (importedDrinkIds.has(recipe.id)) continue;

      let categoryId: string | null = null;
      const drinkCatLower = recipe.category.toLowerCase();
      for (const [catName, catId] of catNameToId) {
        if (drinkCatLower.includes(catName) || catName.includes(drinkCatMapping[drinkCatLower] ?? "")) {
          categoryId = catId;
          break;
        }
      }

      toInsert.push({
        name: recipe.name,
        price: recipe.price ?? 0,
        image_url: recipe.image,
        category_id: categoryId,
        drink_lab_id: recipe.id,
        sort_order: sortCounter++,
        is_active: true,
      });
    }

    if (toInsert.length === 0) {
      showToast("Nessun nuovo prodotto da importare", "warn");
      setImporting(false);
      return;
    }

    const { error } = await supabase.from("bar_products").insert(toInsert);
    setImporting(false);
    if (error) return showToast("Errore importazione: " + error.message, "error");
    showToast(`Importati ${toInsert.length} prodotti da Drink Lab`);
    setShowImportModal(false);
    load();
  }

  async function syncFromDrinkLab() {
    const linked = products.filter(p => p.drink_lab_id);
    if (linked.length === 0) return showToast("Nessun prodotto collegato al Drink Lab", "warn");

    let updated = 0;
    for (const p of linked) {
      const recipe = BAR_RECIPES.find(r => r.id === p.drink_lab_id);
      if (!recipe) continue;
      const changes: Record<string, unknown> = {};
      if (recipe.name !== p.name) changes.name = recipe.name;
      if (recipe.image !== p.image_url) changes.image_url = recipe.image;
      if (recipe.price != null && recipe.price !== p.price) changes.price = recipe.price;
      if (Object.keys(changes).length > 0) {
        await supabase.from("bar_products").update(changes).eq("id", p.id);
        updated++;
      }
    }
    showToast(updated > 0 ? `Aggiornati ${updated} prodotti` : "Tutti i prodotti sono già aggiornati");
    if (updated > 0) load();
  }

  /* ─── Render guard ─── */
  if (roleLoading || !isManager) {
    return <div style={{ padding: 40, textAlign: "center", color: "#6C6B5D", fontFamily: "'Albert Sans', sans-serif" }}>Caricamento...</div>;
  }

  /* ─── Category row ─── */
  function CatRow({ cat }: { cat: BarCategory }) {
    const isEditing = editCatId === cat.id;
    if (isEditing) {
      return (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
          background: "#F3EBDD", borderRadius: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {editCat.icon && <i className={`ti ti-${editCat.icon}`} style={{ fontSize: 18, color: "#1F3326" }} />}
            <input
              value={editCat.icon}
              onChange={e => setEditCat({ ...editCat, icon: e.target.value })}
              placeholder="coffee"
              maxLength={30}
              style={{
                width: 90, textAlign: "center", fontSize: 13,
                padding: "6px 4px", border: "1px solid #D8CCB8", borderRadius: 6,
                fontFamily: "'Albert Sans', sans-serif", background: "#fff",
              }}
            />
          </div>
          <input
            value={editCat.name}
            onChange={e => setEditCat({ ...editCat, name: e.target.value })}
            placeholder="Nome categoria"
            style={{
              flex: 1, padding: "6px 10px", border: "1px solid #D8CCB8",
              borderRadius: 6, fontSize: 14, fontFamily: "'Albert Sans', sans-serif", background: "#fff",
            }}
          />
          <button
            style={{ padding: "6px 14px", fontSize: 13, background: "#1F3326", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "'Albert Sans', sans-serif", fontWeight: 600 }}
            disabled={savingCat}
            onClick={() => saveCat(cat.id)}
          >Salva</button>
          <button
            style={{ padding: "6px 14px", fontSize: 13, background: "transparent", color: "#6C6B5D", border: "1px solid #D8CCB8", borderRadius: 8, cursor: "pointer", fontFamily: "'Albert Sans', sans-serif" }}
            onClick={cancelEditCat}
          >Annulla</button>
        </div>
      );
    }

    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
        background: cat.is_active ? "transparent" : "rgba(108,107,93,.05)",
        borderRadius: 8, borderBottom: "1px solid #D8CCB8",
        opacity: cat.is_active ? 1 : 0.55,
      }}>
        <i className={`ti ti-${cat.icon || "folder"}`} style={{ fontSize: 20, color: "#1F3326", width: 28, textAlign: "center", flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "#1F3326", fontFamily: "'Albert Sans', sans-serif" }}>
          {cat.name}
        </span>
        <Toggle checked={cat.is_active} onChange={() => toggleCatActive(cat)} />
        <div style={{ display: "flex", gap: 4 }}>
          <IconBtn title="Sposta su" onClick={() => moveCat(cat, "up")}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 15l-6-6-6 6" /></svg>
          </IconBtn>
          <IconBtn title="Sposta giù" onClick={() => moveCat(cat, "down")}>
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

  function NewCatForm() {
    if (!newCat) return null;
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
        background: "#F3EBDD", borderRadius: 8, marginTop: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {newCat.icon && <i className={`ti ti-${newCat.icon}`} style={{ fontSize: 18, color: "#1F3326" }} />}
          <input
            value={newCat.icon}
            onChange={e => setNewCat({ ...newCat, icon: e.target.value })}
            placeholder="coffee"
            maxLength={30}
            style={{
              width: 90, textAlign: "center", fontSize: 13,
              padding: "6px 4px", border: "1px solid #D8CCB8", borderRadius: 6,
              fontFamily: "'Albert Sans', sans-serif", background: "#fff",
            }}
          />
        </div>
        <input
          value={newCat.name}
          onChange={e => setNewCat({ ...newCat, name: e.target.value })}
          placeholder="Nome nuova categoria"
          autoFocus
          style={{
            flex: 1, padding: "6px 10px", border: "1px solid #D8CCB8",
            borderRadius: 6, fontSize: 14, fontFamily: "'Albert Sans', sans-serif", background: "#fff",
          }}
          onKeyDown={e => { if (e.key === "Enter") addCat(); }}
        />
        <button
          style={{ padding: "6px 14px", fontSize: 13, background: "#1F3326", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "'Albert Sans', sans-serif", fontWeight: 600 }}
          disabled={savingCat} onClick={addCat}
        >Aggiungi</button>
        <button
          style={{ padding: "6px 14px", fontSize: 13, background: "transparent", color: "#6C6B5D", border: "1px solid #D8CCB8", borderRadius: 8, cursor: "pointer", fontFamily: "'Albert Sans', sans-serif" }}
          onClick={() => setNewCat(null)}
        >Annulla</button>
      </div>
    );
  }

  /* ─── Main render ─── */
  return (
    <div style={{ padding: "24px 28px 60px", fontFamily: "'Albert Sans', sans-serif" }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 500, color: "#1F3326", margin: 0 }}>
          Gestione Prodotti Bar
        </h1>
        <p style={{ fontSize: 14, color: "#6C6B5D", margin: "4px 0 0" }}>
          Categorie, prodotti e listino prezzi del servizio bar
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#6C6B5D" }}>Caricamento dati...</div>
      ) : (
        <div className="bar-admin-grid" style={{
          display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2.5fr)", gap: 24, alignItems: "start",
        }}>
          {/* ─── Left: Categories ─── */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 500, color: "#1F3326", margin: 0 }}>
                Categorie
              </h2>
              <button
                onClick={() => { setNewCat({ ...EMPTY_CATEGORY }); setEditCatId(null); }}
                style={{
                  padding: "6px 14px", fontSize: 13, fontWeight: 600,
                  background: "transparent", color: "#1F3326", border: "1px solid #1F3326",
                  borderRadius: 8, cursor: "pointer", fontFamily: "'Albert Sans', sans-serif",
                }}
              >+ Nuova</button>
            </div>

            {categories.length === 0 && !newCat && (
              <p style={{ fontSize: 14, color: "#6C6B5D", textAlign: "center", padding: "20px 0" }}>
                Nessuna categoria. Creane una per iniziare.
              </p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {categories.map(cat => <CatRow key={cat.id} cat={cat} />)}
            </div>

            <NewCatForm />
          </div>

          {/* ─── Right: Products ─── */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 500, color: "#1F3326", margin: 0 }}>
                Prodotti
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <select
                  value={filterCat}
                  onChange={e => setFilterCat(e.target.value)}
                  style={{
                    padding: "8px 12px", border: "1px solid #D8CCB8",
                    borderRadius: 8, fontSize: 13, fontFamily: "'Albert Sans', sans-serif",
                    background: "#fff", color: "#1F3326",
                  }}
                >
                  <option value="all">Tutte le categorie</option>
                  <option value="none">Senza categoria</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button
                  onClick={openImportModal}
                  style={{
                    padding: "8px 16px", fontSize: 13, fontWeight: 600,
                    background: "#BFA762", color: "#1F3326", border: "none",
                    borderRadius: 8, cursor: "pointer", fontFamily: "'Albert Sans', sans-serif",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <i className="ti ti-download" style={{ fontSize: 15 }} />
                  Importa da Drink Lab
                </button>
                <button
                  onClick={openNewProduct}
                  style={{
                    padding: "8px 16px", fontSize: 13, fontWeight: 600,
                    background: "#1F3326", color: "#fff", border: "none",
                    borderRadius: 8, cursor: "pointer", fontFamily: "'Albert Sans', sans-serif",
                  }}
                >+ Nuovo prodotto</button>
              </div>
            </div>

            {/* Sync button */}
            {products.some(p => p.drink_lab_id) && (
              <button
                onClick={syncFromDrinkLab}
                style={{
                  marginBottom: 16, padding: "6px 14px", fontSize: 12, fontWeight: 500,
                  background: "transparent", color: "#6C6B5D", border: "1px solid #D8CCB8",
                  borderRadius: 6, cursor: "pointer", fontFamily: "'Albert Sans', sans-serif",
                  display: "flex", alignItems: "center", gap: 5,
                }}
              >
                <i className="ti ti-refresh" style={{ fontSize: 14 }} />
                Aggiorna da Drink Lab
              </button>
            )}

            {filteredProducts.length === 0 ? (
              <p style={{ fontSize: 14, color: "#6C6B5D", textAlign: "center", padding: "20px 0" }}>
                Nessun prodotto trovato.
              </p>
            ) : (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 16,
              }}>
                {filteredProducts.map(p => {
                  const cat = p.category_id ? catMap.get(p.category_id) : null;
                  const hasImage = !!p.image_url;
                  return (
                    <div key={p.id} style={{
                      background: "#fff", border: "1px solid #D8CCB8", borderRadius: 12,
                      overflow: "hidden", opacity: p.is_active ? 1 : 0.5,
                      display: "flex", flexDirection: "column",
                    }}>
                      {hasImage && (
                        <div style={{ width: "100%", height: 100, background: "#1F3326", overflow: "hidden" }}>
                          <img src={p.image_url!} alt={p.name} loading="lazy"
                            style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                        </div>
                      )}
                      <div style={{ padding: "12px 14px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#1F3326", lineHeight: 1.3 }}>
                          {p.name}
                        </span>
                        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: "#BFA762", lineHeight: 1 }}>
                          {eur(p.price)}
                        </span>
                        {cat && (
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 10px",
                            borderRadius: 20, fontSize: 11, fontWeight: 500,
                            background: "rgba(191,167,98,.12)", color: "#1F3326", alignSelf: "flex-start",
                          }}>
                            {cat.icon && <i className={`ti ti-${cat.icon}`} style={{ fontSize: 12 }} />}
                            {cat.name}
                          </span>
                        )}
                        {p.warehouse_product_id && (
                          <span style={{ fontSize: 11, color: "#2D5A3D", fontWeight: 500 }}>
                            <i className="ti ti-link" style={{ fontSize: 12, marginRight: 3 }} />
                            Collegato al magazzino
                          </span>
                        )}
                        {p.drink_lab_id && (
                          <span style={{ fontSize: 11, color: "#4F7B8C", fontWeight: 500 }}>
                            <i className="ti ti-flask" style={{ fontSize: 12, marginRight: 3 }} />
                            Da Drink Lab
                          </span>
                        )}
                        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                          <button
                            onClick={() => openEditProduct(p)}
                            style={{
                              flex: 1, padding: "6px 0", fontSize: 12, fontWeight: 600,
                              background: "#F3EBDD", color: "#1F3326", border: "none",
                              borderRadius: 6, cursor: "pointer", fontFamily: "'Albert Sans', sans-serif",
                            }}
                          >Modifica</button>
                          <button
                            onClick={() => deleteProduct(p)}
                            style={{
                              padding: "6px 10px", fontSize: 12,
                              background: "rgba(158,59,46,.08)", color: "#9E3B2E", border: "none",
                              borderRadius: 6, cursor: "pointer",
                            }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                          </button>
                          <Toggle checked={p.is_active} onChange={() => toggleProductActive(p)} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{
              marginTop: 16, paddingTop: 12, borderTop: "1px solid #D8CCB8",
              display: "flex", justifyContent: "space-between", fontSize: 13, color: "#6C6B5D",
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
          {pf.image_url && (
            <div style={{ position: "relative", display: "inline-block", alignSelf: "center" }}>
              <img src={pf.image_url} alt="Anteprima"
                style={{ width: 200, height: 120, objectFit: "contain", borderRadius: 10, background: "#1F3326" }} />
              <button type="button" onClick={() => setPf({ ...pf, image_url: "" })}
                style={{
                  position: "absolute", top: -8, right: -8,
                  width: 24, height: 24, borderRadius: "50%",
                  background: "#9E3B2E", color: "#fff", border: "none",
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>×</button>
            </div>
          )}

          <div className="field">
            <label>Nome *</label>
            <input value={pf.name} onChange={e => setPf({ ...pf, name: e.target.value })} placeholder="Nome prodotto" required />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="field">
              <label>Prezzo (€) *</label>
              <input type="number" min="0" step="0.01" value={pf.price}
                onChange={e => setPf({ ...pf, price: parseFloat(e.target.value) || 0 })} placeholder="0.00" required />
            </div>
            <div className="field">
              <label>Categoria</label>
              <select value={pf.category_id ?? ""} onChange={e => setPf({ ...pf, category_id: e.target.value || null })}>
                <option value="">Nessuna</option>
                {categories.filter(c => c.is_active).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>Prodotto magazzino (opzionale)</label>
            <select value={pf.warehouse_product_id ?? ""} onChange={e => setPf({ ...pf, warehouse_product_id: e.target.value || null })}>
              <option value="">Non collegato</option>
              {warehouseProducts.map(w => (
                <option key={w.id} value={w.id}>{w.name}{w.category ? ` (${w.category})` : ""}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Immagine</label>
            <input type="file" accept="image/*"
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
              style={{ fontSize: 13, fontFamily: "'Albert Sans', sans-serif", padding: "6px 0", color: "#1F3326" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="field">
              <label>Ordinamento</label>
              <input type="number" min="0" value={pf.sort_order}
                onChange={e => setPf({ ...pf, sort_order: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="field" style={{ display: "flex", flexDirection: "column" }}>
              <label>Attivo</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
                <Toggle checked={pf.is_active} onChange={v => setPf({ ...pf, is_active: v })} />
                <span style={{ fontSize: 13, color: "#6C6B5D" }}>
                  {pf.is_active ? "Visibile" : "Nascosto"}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
            <button onClick={() => setShowProductModal(false)}
              style={{ padding: "10px 20px", fontSize: 14, background: "transparent", color: "#6C6B5D", border: "1px solid #D8CCB8", borderRadius: 8, cursor: "pointer", fontFamily: "'Albert Sans', sans-serif" }}>
              Annulla
            </button>
            <button disabled={savingProduct} onClick={saveProduct}
              style={{ padding: "10px 24px", fontSize: 14, background: "#1F3326", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "'Albert Sans', sans-serif", fontWeight: 600, opacity: savingProduct ? 0.6 : 1 }}>
              {savingProduct ? "Salvataggio..." : editProduct ? "Salva Modifiche" : "Crea Prodotto"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ─── Import Drink Lab Modal ─── */}
      <Modal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="Importa da Drink Lab"
        maxWidth={600}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ fontSize: 14, color: "#6C6B5D", margin: 0 }}>
            Seleziona i drink da importare nel listino bar. I drink già importati sono esclusi.
          </p>

          {BAR_RECIPES.filter(r => !importedDrinkIds.has(r.id)).length === 0 ? (
            <div style={{ textAlign: "center", padding: 24, color: "#2D5A3D", fontSize: 14, fontWeight: 600 }}>
              <i className="ti ti-check" style={{ fontSize: 24, display: "block", marginBottom: 8 }} />
              Tutti i drink sono già stati importati
            </div>
          ) : (
            <>
              <button onClick={toggleAllImport}
                style={{
                  alignSelf: "flex-start", padding: "6px 14px", fontSize: 13,
                  background: "transparent", color: "#1F3326", border: "1px solid #D8CCB8",
                  borderRadius: 6, cursor: "pointer", fontFamily: "'Albert Sans', sans-serif",
                }}>
                {importSelection.size === BAR_RECIPES.filter(r => !importedDrinkIds.has(r.id)).length ? "Deseleziona tutti" : "Seleziona tutti"}
              </button>

              <div style={{ maxHeight: 400, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                {BAR_CATEGORIES.map(cat => {
                  const recipes = BAR_RECIPES.filter(r => r.category === cat.key && !importedDrinkIds.has(r.id));
                  if (recipes.length === 0) return null;
                  return (
                    <div key={cat.key}>
                      <div style={{
                        fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1,
                        color: "#6C6B5D", padding: "10px 0 4px", borderBottom: "1px solid #D8CCB8", marginBottom: 6,
                      }}>{cat.key}</div>
                      {recipes.map(r => (
                        <label key={r.id} style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                          borderRadius: 8, cursor: "pointer",
                          background: importSelection.has(r.id) ? "rgba(191,167,98,.08)" : "transparent",
                        }}>
                          <input type="checkbox" checked={importSelection.has(r.id)}
                            onChange={() => toggleImportItem(r.id)}
                            style={{ width: 18, height: 18, accentColor: "#1F3326" }} />
                          <img src={r.image} alt={r.name} loading="lazy"
                            style={{ width: 40, height: 40, objectFit: "contain", borderRadius: 6, background: "#1F3326", flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 500, color: "#1F3326" }}>{r.name}</div>
                            <div style={{ fontSize: 12, color: "#6C6B5D" }}>{r.category}</div>
                          </div>
                          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: "#BFA762", flexShrink: 0 }}>
                            {r.price ? eur(r.price) : "—"}
                          </span>
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 8, borderTop: "1px solid #D8CCB8" }}>
                <button onClick={() => setShowImportModal(false)}
                  style={{ padding: "10px 20px", fontSize: 14, background: "transparent", color: "#6C6B5D", border: "1px solid #D8CCB8", borderRadius: 8, cursor: "pointer", fontFamily: "'Albert Sans', sans-serif" }}>
                  Annulla
                </button>
                <button disabled={importing || importSelection.size === 0} onClick={executeImport}
                  style={{
                    padding: "10px 24px", fontSize: 14, fontWeight: 600,
                    background: importing ? "#d4c89d" : "#BFA762", color: "#1F3326",
                    border: "none", borderRadius: 8, cursor: importing ? "not-allowed" : "pointer",
                    fontFamily: "'Albert Sans', sans-serif",
                  }}>
                  {importing ? "Importazione..." : `Importa ${importSelection.size} drink`}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Toast toast={toast} />

      <style>{`
        @media (max-width: 768px) {
          .bar-admin-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
