"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { BAR_RECIPES, BAR_CATEGORIES, type BarRecipe } from "@/lib/barRecipes";
import { useRole } from "@/lib/useRole";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/Toast";

type StockInfo = { product_id: string; name: string; current_stock: number; min_stock: number; tracking_type: string | null };

const FILTER_TABS = ["Tutti", ...BAR_CATEGORIES.map(c => c.key)] as const;

function fmtPrice(n: number) {
  return n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DrinkLabPage() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const { isManager } = useRole();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [activeTab, setActiveTab] = useState<string>("Tutti");
  const [selectedRecipe, setSelectedRecipe] = useState<BarRecipe | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [stockMap, setStockMap] = useState<Map<string, StockInfo>>(new Map());
  const [priceMap, setPriceMap] = useState<Map<string, number>>(new Map());
  const [editingPrice, setEditingPrice] = useState(false);
  const [editPriceVal, setEditPriceVal] = useState("");
  const { toast, showToast } = useToast();
  const priceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const [stockRes, priceRes] = await Promise.all([
        supabase.from("stock_levels").select("product_id, name, current_stock, min_stock, tracking_type").eq("active", true),
        supabase.from("drink_prices").select("recipe_id, price"),
      ]);
      const sMap = new Map<string, StockInfo>();
      for (const p of (stockRes.data ?? []) as StockInfo[]) {
        sMap.set(p.name.toLowerCase(), p);
      }
      setStockMap(sMap);
      const pMap = new Map<string, number>();
      for (const r of (priceRes.data ?? []) as { recipe_id: string; price: number }[]) {
        pMap.set(r.recipe_id, Number(r.price));
      }
      setPriceMap(pMap);
    })();
  }, []);// eslint-disable-line react-hooks/exhaustive-deps

  function getPrice(recipe: BarRecipe): number {
    return priceMap.get(recipe.id) ?? recipe.price ?? 0;
  }

  const filtered = useMemo(() => {
    let list = BAR_RECIPES;
    if (activeTab !== "Tutti") list = list.filter(r => r.category === activeTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.ingredients.some(i => i.productName.toLowerCase().includes(q))
      );
    }
    return list;
  }, [activeTab, search]);

  function getStockStatus(recipe: BarRecipe): "ok" | "low" | "out" {
    let worst: "ok" | "low" | "out" = "ok";
    for (const ing of recipe.ingredients) {
      if (ing.optional || ing.amountMl === 0) continue;
      const found = findProduct(ing.productName);
      if (!found) continue;
      if (found.current_stock <= 0) { worst = "out"; break; }
      if (found.min_stock > 0 && found.current_stock <= found.min_stock && worst === "ok") worst = "low";
    }
    return worst;
  }

  function findProduct(name: string): StockInfo | undefined {
    const ingLower = name.toLowerCase();
    for (const [key, val] of stockMap) {
      if (key.includes(ingLower) || ingLower.includes(key)) return val;
    }
    return undefined;
  }

  function catStyle(cat: string) {
    const c = BAR_CATEGORIES.find(b => b.key === cat);
    return c ? { background: c.color, color: c.textColor } : {};
  }

  async function savePrice(recipe: BarRecipe, newPrice: number) {
    const { error } = await supabase.from("drink_prices").upsert(
      { recipe_id: recipe.id, price: newPrice, updated_at: new Date().toISOString() },
      { onConflict: "recipe_id" }
    );
    if (error) { showToast("Errore salvataggio prezzo"); return; }
    setPriceMap(prev => {
      const next = new Map(prev);
      next.set(recipe.id, newPrice);
      return next;
    });
    setEditingPrice(false);
    showToast(`Prezzo aggiornato — ${recipe.name}: €${fmtPrice(newPrice)}`);
  }

  function startEditPrice(recipe: BarRecipe) {
    const current = getPrice(recipe);
    setEditPriceVal(current > 0 ? String(current) : "");
    setEditingPrice(true);
    setTimeout(() => priceInputRef.current?.focus(), 50);
  }

  function commitPrice(recipe: BarRecipe) {
    const val = parseFloat(editPriceVal.replace(",", "."));
    if (isNaN(val) || val < 0) { setEditingPrice(false); return; }
    savePrice(recipe, Math.round(val * 100) / 100);
  }

  /* ── Detail view ── */
  if (selectedRecipe) {
    const recipe = selectedRecipe;
    const status = getStockStatus(recipe);
    const price = getPrice(recipe);
    return (
      <>
        <div style={{ marginBottom: 24 }}>
          <button onClick={() => { setSelectedRecipe(null); setEditingPrice(false); }} style={{
            background: "none", border: "none", cursor: "pointer", fontSize: 14,
            fontWeight: 600, color: "#BFA762", padding: 0, fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
            Torna al Drink Lab
          </button>
        </div>

        <div className="drink-detail-img-wrap">
          <Image src={recipe.image} alt={recipe.name} width={600} height={400} unoptimized className="drink-detail-img" />
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="serif" style={{ fontSize: 28, margin: 0 }}>{recipe.name}</h1>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>{recipe.description}</p>
          </div>
          {editingPrice ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: "#1F3326" }}>{"€"}</span>
              <input
                ref={priceInputRef}
                type="text"
                inputMode="decimal"
                value={editPriceVal}
                onChange={e => setEditPriceVal(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") commitPrice(recipe); if (e.key === "Escape") setEditingPrice(false); }}
                onBlur={() => commitPrice(recipe)}
                style={{
                  width: 80, fontSize: 18, fontWeight: 700, fontFamily: "inherit",
                  border: "2px solid #BFA762", borderRadius: 10, padding: "4px 10px",
                  textAlign: "center", background: "#fff", outline: "none",
                }}
              />
            </div>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); if (isManager) startEditPrice(recipe); }}
              title={isManager ? "Modifica prezzo" : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
                padding: "6px 16px", borderRadius: 20, border: price > 0 ? "none" : "2px dashed #D8CCB8",
                background: price > 0 ? "#1F3326" : "transparent",
                color: price > 0 ? "#fff" : "#999",
                fontSize: 18, fontWeight: 700, fontFamily: "inherit",
                cursor: isManager ? "pointer" : "default",
                transition: "opacity .15s",
              }}
            >
              {"€"} {price > 0 ? fmtPrice(price) : "—"}
              {isManager && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              )}
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24, marginTop: 12, alignItems: "center" }}>
          <span style={catStyle(recipe.category)} className="badge">{recipe.category}</span>
          <span className="badge" style={{ background: "#F3EBDD", color: "#6C6B5D" }}>{recipe.timeMinutes} min</span>
          {recipe.withIce && <span className="badge" style={{ background: "#F3EBDD", color: "#6C6B5D" }}>Con ghiaccio</span>}
          <span className="badge" style={{ background: "#F3EBDD", color: "#6C6B5D" }}>{recipe.glass}</span>
          {status === "out" && <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: "rgba(158,59,46,.12)", color: "#9E3B2E" }}>Esaurito</span>}
          {status === "low" && <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: "rgba(199,123,74,.15)", color: "#8B5A2B" }}>Scorta bassa</span>}
        </div>

        {/* Ingredients */}
        <div className="section" style={{ marginBottom: 20 }}>
          <div className="section-head"><h2>Ingredienti</h2></div>
          <div className="section-body">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {recipe.ingredients.map((ing, i) => {
                const prod = ing.amountMl > 0 ? findProduct(ing.productName) : null;
                const isOut = prod && prod.current_stock <= 0;
                const isLow = prod && prod.min_stock > 0 && prod.current_stock <= prod.min_stock && !isOut;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, opacity: ing.optional ? 0.7 : 1 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 3, background: ing.optional ? "#D8CCB8" : "#1F3326", flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>
                      {ing.amountMl > 0 && <strong style={{ color: "#1F3326" }}>{ing.amountMl}ml </strong>}
                      {ing.productName}
                      {ing.amountMl > 0 && <span className="muted"> ({ing.measureDescription})</span>}
                      {ing.amountMl === 0 && <span className="muted"> — {ing.measureDescription}</span>}
                      {ing.optional && <span className="muted" style={{ fontStyle: "italic" }}> (opzionale)</span>}
                    </span>
                    {isOut && <span style={{ fontSize: 11, color: "#9E3B2E", fontWeight: 700 }}>Esaurito</span>}
                    {isLow && <span style={{ fontSize: 11, color: "#C77B4A", fontWeight: 700 }}>Basso</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Glass */}
        <div style={{
          padding: "12px 16px", borderRadius: 10, border: "1px solid #D8CCB8",
          background: "#fff", marginBottom: 20, display: "flex", alignItems: "center", gap: 10,
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6C6B5D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8M12 15v6M7.5 3h9l-2 8a5 5 0 01-5 0L7.5 3z"/><path d="M5 3h14"/></svg>
          <div>
            <div className="muted" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Bicchiere</div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{recipe.glass}</div>
          </div>
        </div>

        {/* Steps */}
        <div className="section" style={{ marginBottom: 20 }}>
          <div className="section-head"><h2>Preparazione</h2></div>
          <div className="section-body">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {recipe.steps.map((step, i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{
                    width: 28, height: 28, borderRadius: 14, background: "#1F3326", color: "#fff",
                    display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700, flexShrink: 0,
                    fontFamily: "'Albert Sans', sans-serif",
                  }}>{i + 1}</span>
                  <span style={{ fontSize: 15, lineHeight: 1.5, paddingTop: 3 }}>{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tip */}
        <div style={{
          padding: "14px 18px", borderRadius: 10, background: "#F3EBDD",
          borderLeft: "3px solid #BFA762", marginBottom: 20,
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: "#8C7A3B" }}>Suggerimento</div>
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>{recipe.tip}</div>
        </div>

        {/* Measure summary */}
        {recipe.ingredients.some(i => i.amountMl > 0 && !i.optional) && (
          <div style={{
            padding: "14px 18px", borderRadius: 10, background: "#1F3326", color: "#fff",
            marginBottom: 20,
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, opacity: 0.7 }}>Misurino</div>
            <div style={{ fontSize: 14, lineHeight: 1.6 }}>
              {recipe.ingredients.filter(i => i.amountMl > 0 && !i.optional).map(i =>
                `${i.productName} = ${i.measureDescription}`
              ).join(" · ")}
            </div>
          </div>
        )}

        <Toast toast={toast} />
      </>
    );
  }

  /* ── Grid view ── */
  return (
    <>
      <h1 className="serif" style={{ fontSize: 28, marginBottom: 2 }}>Drink Lab</h1>
      <p className="muted" style={{ marginBottom: 20, fontSize: 14 }}>Guide di preparazione per cocktail e bevande</p>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cerca un cocktail o una bevanda..."
          style={{
            width: "100%", padding: "12px 16px", borderRadius: 10,
            border: "1px solid #D8CCB8", fontSize: 15, fontFamily: "inherit",
            background: "#fff", boxSizing: "border-box",
          }}
        />
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto", paddingBottom: 4 }}>
        {FILTER_TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: "8px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600,
            border: activeTab === tab ? "2px solid #1F3326" : "1px solid #D8CCB8",
            background: activeTab === tab ? "#1F3326" : "#fff",
            color: activeTab === tab ? "#fff" : "#1F3326",
            cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit",
            transition: "all .15s",
          }}>{tab}</button>
        ))}
      </div>

      {/* Guida misurino */}
      <div style={{
        background: "#1F3326", color: "#fff", borderRadius: 12,
        marginBottom: 24, overflow: "hidden",
      }}>
        <button onClick={() => setGuideOpen(!guideOpen)} style={{
          background: "none", border: "none", color: "#fff", cursor: "pointer",
          width: "100%", padding: "14px 18px", display: "flex", justifyContent: "space-between",
          alignItems: "center", fontFamily: "inherit",
        }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Guida misurino</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" style={{ transform: guideOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }}><path d="M6 9l6 6 6-6"/></svg>
        </button>
        {guideOpen && (
          <div style={{ padding: "0 18px 16px", fontSize: 14, lineHeight: 1.7, opacity: 0.9 }}>
            <strong>1 misurino pieno</strong> = 30ml · <strong>½ misurino</strong> = 15ml · <strong>1 e mezzo</strong> = 45ml · <strong>2 misurini</strong> = 60ml
            <div style={{ marginTop: 8, fontSize: 13, fontStyle: "italic", opacity: 0.7 }}>
              Per i cocktail: misura sempre, non andare a occhio!
            </div>
          </div>
        )}
      </div>

      {/* Recipe grid */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div className="muted" style={{ fontSize: 16 }}>Nessuna ricetta trovata</div>
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
        }}>
          {filtered.map(recipe => {
            const status = getStockStatus(recipe);
            const price = getPrice(recipe);
            return (
              <div key={recipe.id}
                onClick={() => setSelectedRecipe(recipe)}
                style={{
                  background: "#fff", border: "1px solid #D8CCB8", borderRadius: 12,
                  cursor: "pointer", transition: "all .15s",
                  position: "relative", overflow: "hidden",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#BFA762"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,.06)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#D8CCB8"; e.currentTarget.style.boxShadow = "none"; }}
              >
                <div className="drink-card-img-wrap">
                  <Image src={recipe.image} alt={recipe.name} width={400} height={300} unoptimized className="drink-card-img" />
                </div>
                <div style={{ padding: "14px 18px", position: "relative" }}>
                {status !== "ok" && (
                  <span style={{
                    position: "absolute", top: -30, right: 12,
                    padding: "3px 8px", borderRadius: 12, fontSize: 10, fontWeight: 700,
                    background: status === "out" ? "rgba(158,59,46,.85)" : "rgba(199,123,74,.85)",
                    color: "#fff",
                  }}>{status === "out" ? "Esaurito" : "Scorta bassa"}</span>
                )}

                <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 6px", color: "#1F3326" }}>{recipe.name}</h3>

                <span className="badge" style={{ ...catStyle(recipe.category), fontSize: 11, marginBottom: 10, display: "inline-block" }}>{recipe.category}</span>

                <div className="muted" style={{ fontSize: 13, marginBottom: 10, lineHeight: 1.4 }}>
                  {recipe.ingredients.filter(i => !i.optional && i.amountMl > 0).map(i => i.productName).join(" · ")}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#6C6B5D", flexWrap: "wrap" }}>
                    <span>{recipe.timeMinutes} min</span>
                    {recipe.withIce && <span>Con ghiaccio</span>}
                  </div>
                  {price > 0 && (
                    <span style={{
                      background: "#1F3326", color: "#fff", borderRadius: 16,
                      padding: "4px 12px", fontSize: 14, fontWeight: 700, flexShrink: 0,
                    }}>{"€"}{Math.round(price) === price ? price : fmtPrice(price)}</span>
                  )}
                </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Toast toast={toast} />
    </>
  );
}
