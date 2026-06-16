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

          {/* ─── Right: Products ─── */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <h2 style={{
                fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 500,
                color: "var(--ink, #1F3326)", margin: 0,
              }}>
                Prodotti
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ background: "var(--surface-2, #F3EBDD)" }}>
                      <th style={thStyle}>Nome</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Prezzo</th>
                      <th style={thStyle}>Categoria</th>
                      <th style={thStyle}>Magazzino</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Attivo</th>
                      <th style={{ ...thStyle, textAlign: "center", width: 110 }}>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((p, i) => {
                      const cat = p.category_id ? catMap.get(p.category_id) : null;
                      const wp = p.warehouse_product_id
                        ? warehouseProducts.find(w => w.id === p.warehouse_product_id)
                        : null;
                      return (
                        <tr
                          key={p.id}
                          style={{
                            borderBottom: "1px solid var(--line, #D8CCB8)",
                            background: i % 2 === 0 ? "transparent" : "rgba(243,235,221,.3)",
                            opacity: p.is_active ? 1 : 0.5,
                          }}
                        >
                          <td style={tdStyle}>
                            <span style={{ fontWeight: 600, color: "var(--ink, #1F3326)" }}>{p.name}</span>
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: "0.5px" }}>
                            {eur(p.price)}
                          </td>
                          <td style={tdStyle}>
                            {cat ? (
                              <span style={{
                                display: "inline-block", padding: "2px 10px", borderRadius: 20,
                                fontSize: 12, fontWeight: 500,
                                background: "rgba(191,167,98,.12)", color: "var(--ink, #1F3326)",
                              }}>
                                {cat.icon ? cat.icon + " " : ""}{cat.name}
                              </span>
                            ) : (
                              <span style={{ color: "var(--ink-soft, #6C6B5D)", fontSize: 12 }}>—</span>
                            )}
                          </td>
                          <td style={tdStyle}>
                            {wp ? (
                              <span className="badge ok" style={{ fontSize: 11 }}>
                                Collegato
                              </span>
                            ) : (
                              <span style={{ color: "var(--ink-soft, #6C6B5D)", fontSize: 12 }}>—</span>
                            )}
                          </td>
                          <td style={{ ...tdStyle, textAlign: "center" }}>
                            <Toggle checked={p.is_active} onChange={() => toggleProductActive(p)} />
                          </td>
                          <td style={{ ...tdStyle, textAlign: "center" }}>
                            <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                              <IconBtn title="Modifica" onClick={() => openEditProduct(p)}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                              </IconBtn>
                              <IconBtn title="Elimina" onClick={() => deleteProduct(p)} danger>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                              </IconBtn>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
            <label>Prodotto magazzino (opzionale)</label>
            <select
              value={pf.warehouse_product_id ?? ""}
              onChange={e => setPf({ ...pf, warehouse_product_id: e.target.value || null })}
            >
              <option value="">Non collegato</option>
              {warehouseProducts.map(w => (
                <option key={w.id} value={w.id}>{w.name}{w.category ? ` (${w.category})` : ""}</option>
              ))}
            </select>
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

/* ─── Table cell styles ─── */
const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--ink-soft, #6C6B5D)",
  fontFamily: "'Albert Sans', sans-serif",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontFamily: "'Albert Sans', sans-serif",
  color: "var(--ink, #1F3326)",
  verticalAlign: "middle",
};
