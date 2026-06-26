"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
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

const GUIDE_ITEMS = [
  { label: "1 misurino", ml: "30ml" },
  { label: "½ misurino", ml: "15ml" },
  { label: "1 e mezzo", ml: "45ml" },
  { label: "2 misurini", ml: "60ml" },
];

function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );
    const items = el.querySelectorAll(".dl-card, .dl-fade-up");
    items.forEach(c => observer.observe(c));
    return () => observer.disconnect();
  });
  return ref;
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
  const [loading, setLoading] = useState(true);
  const { toast, showToast } = useToast();
  const priceInputRef = useRef<HTMLInputElement>(null);
  const revealRef = useScrollReveal();

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
      setLoading(false);
    })();
  }, []);// eslint-disable-line react-hooks/exhaustive-deps

  const getPrice = useCallback((recipe: BarRecipe): number => {
    return priceMap.get(recipe.id) ?? recipe.price ?? 0;
  }, [priceMap]);

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

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { Tutti: BAR_RECIPES.length };
    for (const c of BAR_CATEGORIES) counts[c.key] = 0;
    for (const r of BAR_RECIPES) counts[r.category] = (counts[r.category] ?? 0) + 1;
    return counts;
  }, []);

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
        <button onClick={() => { setSelectedRecipe(null); setEditingPrice(false); }} className="dl-back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          Torna al Drink Lab
        </button>

        <div className="dl-detail-hero">
          <Image src={recipe.image} alt={recipe.name} width={800} height={500} unoptimized style={{ margin: "0 auto" }} />
          <div className="dl-detail-hero-overlay" />
        </div>

        <div className="dl-detail-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="dl-detail-title">{recipe.name}</h1>
            <p className="dl-detail-desc">{recipe.description}</p>
          </div>
          {editingPrice ? (
            <div className="dl-price-edit">
              <span style={{ fontSize: 20, fontWeight: 700, color: "#1F3326", fontFamily: "'Bebas Neue', sans-serif" }}>{"€"}</span>
              <input
                ref={priceInputRef}
                type="text"
                inputMode="decimal"
                value={editPriceVal}
                onChange={e => setEditPriceVal(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") commitPrice(recipe); if (e.key === "Escape") setEditingPrice(false); }}
                onBlur={() => commitPrice(recipe)}
              />
            </div>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); if (isManager) startEditPrice(recipe); }}
              title={isManager ? "Modifica prezzo" : undefined}
              className={`dl-price-pill ${price > 0 ? "has-price" : "no-price"} ${isManager ? "editable" : ""}`}
            >
              {"€"} {price > 0 ? fmtPrice(price) : "—"}
              {isManager && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              )}
            </button>
          )}
        </div>

        <div className="dl-detail-badges">
          <span className="dl-detail-badge" style={catStyle(recipe.category)}>{recipe.category}</span>
          <span className="dl-detail-badge" style={{ background: "#F3EBDD", color: "#6C6B5D" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              {recipe.timeMinutes} min
            </span>
          </span>
          {recipe.withIce && (
            <span className="dl-detail-badge" style={{ background: "#F3EBDD", color: "#6C6B5D" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07"/></svg>
                Con ghiaccio
              </span>
            </span>
          )}
          <span className="dl-detail-badge" style={{ background: "#F3EBDD", color: "#6C6B5D" }}>{recipe.glass}</span>
          {status === "out" && <span className="dl-detail-badge" style={{ background: "rgba(158,59,46,.1)", color: "#9E3B2E" }}>Esaurito</span>}
          {status === "low" && <span className="dl-detail-badge" style={{ background: "rgba(199,123,74,.12)", color: "#8B5A2B" }}>Scorta bassa</span>}
        </div>

        <div className="dl-section">
          <div className="dl-section-head">
            <div className="dl-section-head-icon" style={{ background: "rgba(31,51,38,.08)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="2.5" strokeLinecap="round"><path d="M9 2h6l-1 7h4L8 22l2-9H6L9 2z"/></svg>
            </div>
            <h2>Ingredienti</h2>
          </div>
          {recipe.ingredients.map((ing, i) => {
            const prod = ing.amountMl > 0 ? findProduct(ing.productName) : null;
            const isOut = prod && prod.current_stock <= 0;
            const isLow = prod && prod.min_stock > 0 && prod.current_stock <= prod.min_stock && !isOut;
            return (
              <div key={i} className="dl-ing-row" style={{ opacity: ing.optional ? 0.7 : 1 }}>
                <span className="dl-ing-dot" style={{ background: ing.optional ? "#D8CCB8" : "#1F3326" }} />
                <span className="dl-ing-name">
                  {ing.amountMl > 0 && <span className="dl-ing-ml">{ing.amountMl}ml </span>}
                  {ing.productName}
                  {ing.amountMl > 0 && <span className="dl-ing-desc"> ({ing.measureDescription})</span>}
                  {ing.amountMl === 0 && <span className="dl-ing-desc"> &mdash; {ing.measureDescription}</span>}
                  {ing.optional && <span className="dl-ing-opt"> (opzionale)</span>}
                </span>
                {isOut && <span className="dl-ing-status out">Esaurito</span>}
                {isLow && <span className="dl-ing-status low">Basso</span>}
              </div>
            );
          })}
        </div>

        <div className="dl-glass">
          <div className="dl-glass-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6C6B5D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8M12 15v6M7.5 3h9l-2 8a5 5 0 01-5 0L7.5 3z"/><path d="M5 3h14"/></svg>
          </div>
          <div>
            <div className="dl-glass-label">Bicchiere</div>
            <div className="dl-glass-name">{recipe.glass}</div>
          </div>
        </div>

        <div className="dl-section">
          <div className="dl-section-head">
            <div className="dl-section-head-icon" style={{ background: "rgba(45,90,61,.08)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2D5A3D" strokeWidth="2.5" strokeLinecap="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/></svg>
            </div>
            <h2>Preparazione</h2>
          </div>
          <div className="dl-steps">
            {recipe.steps.map((step, i) => (
              <div key={i} className="dl-step">
                <span className="dl-step-num">{i + 1}</span>
                <span className="dl-step-text">{step}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="dl-tip">
          <div className="dl-tip-label">Suggerimento</div>
          <div className="dl-tip-text">{recipe.tip}</div>
        </div>

        {recipe.ingredients.some(i => i.amountMl > 0 && !i.optional) && (
          <div className="dl-measure">
            <div className="dl-measure-label">Misurino</div>
            <div className="dl-measure-text">
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
    <div ref={revealRef}>
      <div className="dl-hero">
        <h1 className="dl-hero-title">Drink Lab</h1>
        <p className="dl-hero-sub">Guide di preparazione per cocktail e bevande del bar</p>
        <div className="dl-hero-count">
          <span className="dl-hero-dot" />
          {BAR_RECIPES.length} ricette disponibili
        </div>
      </div>

      <div className="dl-search">
        <div className="dl-search-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cerca cocktail, ingrediente..."
        />
        {search.trim() && (
          <span className="dl-search-count">
            {filtered.length} risultat{filtered.length === 1 ? "o" : "i"}
          </span>
        )}
      </div>

      <div className="dl-filters">
        {FILTER_TABS.map(tab => {
          const isActive = activeTab === tab;
          const catColor = tab === "Tutti" ? "#1F3326" : (BAR_CATEGORIES.find(c => c.key === tab)?.color ?? "#1F3326");
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`dl-filter-btn ${isActive ? "active" : ""}`}
              style={isActive ? { background: catColor, borderColor: catColor } : undefined}
            >
              {tab}
              <span className="dl-filter-count">{categoryCounts[tab] ?? 0}</span>
            </button>
          );
        })}
      </div>

      <div className="dl-guide">
        <button onClick={() => setGuideOpen(!guideOpen)} className="dl-guide-toggle">
          <span>
            <span className="dl-guide-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#BFA762" strokeWidth="2.5" strokeLinecap="round"><path d="M8 21h8M12 15v6M7.5 3h9l-2 8a5 5 0 01-5 0L7.5 3z"/><path d="M5 3h14"/></svg>
            </span>
            Guida misurino
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" className={`dl-guide-chevron ${guideOpen ? "open" : ""}`}><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div className={`dl-guide-body ${guideOpen ? "open" : ""}`}>
          <div className="dl-guide-grid">
            {GUIDE_ITEMS.map(item => (
              <div key={item.label} className="dl-guide-item">
                <strong>{item.ml}</strong>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, fontSize: 12, fontStyle: "italic", color: "rgba(255,255,255,.5)", textAlign: "center" }}>
            Per i cocktail: misura sempre, non andare a occhio!
          </div>
        </div>
      </div>

      {loading ? (
        <div className="dl-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="dl-skeleton" style={{ background: "#fff", border: "1px solid #D8CCB8", borderRadius: 16 }}>
              <div className="dl-skeleton-img" />
              <div className="dl-skeleton-body">
                <div className="dl-skeleton-line w60" />
                <div className="dl-skeleton-line w80" />
                <div className="dl-skeleton-line w40" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="dl-empty">
          <div className="dl-empty-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6C6B5D" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, color: "#1F3326", marginBottom: 4 }}>Nessuna ricetta trovata</div>
          <div style={{ fontSize: 14, color: "#6C6B5D" }}>Prova a cercare con altri termini</div>
        </div>
      ) : (
        <div className="dl-grid">
          {filtered.map(recipe => {
            const status = getStockStatus(recipe);
            const price = getPrice(recipe);
            return (
              <div key={recipe.id} className="dl-card" onClick={() => setSelectedRecipe(recipe)}>
                <div className="dl-card-img">
                  <Image src={recipe.image} alt={recipe.name} width={400} height={300} unoptimized />
                  <div className="dl-card-img-overlay" />
                  <span className="dl-card-badge" style={catStyle(recipe.category)}>
                    {recipe.category}
                  </span>
                  {status !== "ok" && (
                    <span className={`dl-card-stock ${status}`}>
                      {status === "out" ? "Esaurito" : "Scorta bassa"}
                    </span>
                  )}
                </div>
                <div className="dl-card-body">
                  <h3 className="dl-card-title">{recipe.name}</h3>
                  <div className="dl-card-ings">
                    {recipe.ingredients.filter(i => !i.optional && i.amountMl > 0).map(i => i.productName).join(" · ")}
                  </div>
                  <div className="dl-card-footer">
                    <div className="dl-card-meta">
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                        {recipe.timeMinutes} min
                      </span>
                      {recipe.withIce && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v20M2 12h20"/></svg>
                          Ghiaccio
                        </span>
                      )}
                    </div>
                    {price > 0 && (
                      <span className="dl-card-price">
                        {"€"}{Math.round(price) === price ? price : fmtPrice(price)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Toast toast={toast} />
    </div>
  );
}
