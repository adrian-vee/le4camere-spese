"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/Toast";
import { eur } from "@/lib/format";
import { playBeep, haptic, isReceiptEnabled } from "@/lib/bar/sound";
import { BAR_RECIPES, getRecipeById } from "@/lib/barRecipes";
import type { BarCategory, BarProduct, CartItem } from "@/lib/bar/types";
import BarHeader from "@/components/bar/BarHeader";
import BarLoginScreen from "@/components/bar/BarLoginScreen";
import CategoryTabs from "@/components/bar/CategoryTabs";
import ProductGrid from "@/components/bar/ProductGrid";
import CurrentOrder from "@/components/bar/CurrentOrder";
import RoomChargeModal from "@/components/bar/RoomChargeModal";
import SplitPaymentModal from "@/components/bar/SplitPaymentModal";
import OperatorChangeModal from "@/components/bar/OperatorChangeModal";
import CashPaymentModal from "@/components/bar/CashPaymentModal";
import GiftConfirmModal from "@/components/bar/GiftConfirmModal";
import ReceiptPreviewModal from "@/components/bar/ReceiptPreviewModal";

const SESSION_KEY = "bar_operator";

function getStoredOperator(): { id: string; name: string } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.id && parsed?.name) return parsed;
  } catch { /* ignore */ }
  return null;
}

function setStoredOperator(op: { id: string; name: string } | null) {
  if (op) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(op));
  } else {
    sessionStorage.removeItem(SESSION_KEY);
  }
}

/* ── Recipe stock helper: find min ingredient stock ── */
function computeRecipeStock(
  recipeId: string,
  stockMap: Map<string, { current_stock: number; tracking_type: string | null; bottle_capacity_ml: number | null }>
): number | null {
  const recipe = getRecipeById(recipeId);
  if (!recipe) return null;

  const critical = recipe.ingredients.filter(i => !i.optional && i.amountMl > 0);
  if (critical.length === 0) return null;

  let minServings = Infinity;

  for (const ing of critical) {
    const lowerName = ing.productName.toLowerCase();
    let bestMatch: { current_stock: number; tracking_type: string | null; bottle_capacity_ml: number | null } | null = null;

    for (const [name, data] of stockMap) {
      if (name.toLowerCase().includes(lowerName) || lowerName.includes(name.toLowerCase())) {
        bestMatch = data;
        break;
      }
    }

    if (!bestMatch) {
      // Ingredient not found in warehouse — can't compute
      return 0;
    }

    let servings: number;
    if (bestMatch.tracking_type === "bottle" && bestMatch.bottle_capacity_ml) {
      // Stock is in bottle units, each bottle has capacity ml
      const totalMl = bestMatch.current_stock * bestMatch.bottle_capacity_ml;
      servings = ing.amountMl > 0 ? Math.floor(totalMl / ing.amountMl) : Infinity;
    } else {
      // Stock is in generic units — approximate: each unit = 1 serving
      servings = bestMatch.current_stock;
    }

    if (servings < minServings) minServings = servings;
  }

  return minServings === Infinity ? null : Math.max(0, minServings);
}

export default function BarPOSPage() {
  const supabase = createClient();
  const { toast, showToast } = useToast();

  /* ─── Operator login state ─── */
  const [barOperator, setBarOperator] = useState<{ id: string; name: string } | null>(null);
  const [loginReady, setLoginReady] = useState(false);

  useEffect(() => {
    setBarOperator(getStoredOperator());
    setLoginReady(true);
  }, []);

  const handleLogin = useCallback((op: { id: string; name: string }) => {
    setBarOperator(op);
    setStoredOperator(op);
  }, []);

  const handleLogout = useCallback(() => {
    setBarOperator(null);
    setStoredOperator(null);
  }, []);

  const handleOperatorChange = useCallback(
    (profile: { id: string; name: string }) => {
      setBarOperator(profile);
      setStoredOperator(profile);
      setShowOperatorModal(false);
    },
    []
  );

  /* ─── POS state ─── */
  const [categories, setCategories] = useState<BarCategory[]>([]);
  const [products, setProducts] = useState<BarProduct[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [bestSellers, setBestSellers] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [showOperatorModal, setShowOperatorModal] = useState(false);
  const [showCashModal, setShowCashModal] = useState(false);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [serviceArea, setServiceArea] = useState("bar");
  const [discountPercent, setDiscountPercent] = useState(0);

  // Receipt state
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptData, setReceiptData] = useState<Parameters<typeof ReceiptPreviewModal>[0]["order"]>(null);

  /* ─── Load categories ─── */
  const loadCategories = useCallback(async () => {
    const { data } = await supabase
      .from("bar_categories")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");
    if (data) setCategories(data);
  }, [supabase]);

  /* ─── Load products + stock (including recipe stock) ─── */
  const loadProducts = useCallback(async () => {
    const { data: prods } = await supabase
      .from("bar_products")
      .select("*, bar_categories(name)")
      .eq("is_active", true)
      .order("sort_order");

    if (!prods) return;

    // Load ALL stock levels in one query
    const { data: allStock } = await supabase
      .from("stock_levels")
      .select("product_id, name, current_stock, tracking_type, bottle_capacity_ml")
      .eq("active", true);

    // Build maps for efficient lookups
    const stockById: Record<string, number> = {};
    const stockByName = new Map<string, { current_stock: number; tracking_type: string | null; bottle_capacity_ml: number | null }>();

    if (allStock) {
      for (const s of allStock) {
        stockById[s.product_id] = s.current_stock;
        stockByName.set(s.name, {
          current_stock: s.current_stock,
          tracking_type: s.tracking_type,
          bottle_capacity_ml: s.bottle_capacity_ml,
        });
      }
    }

    const enriched: BarProduct[] = prods.map((p: Record<string, unknown>) => {
      const drinkLabId = (p.drink_lab_id as string | null) ?? null;
      const warehouseId = p.warehouse_product_id as string | null;

      let stock: number | null = null;
      if (drinkLabId) {
        // Recipe-based: compute from min ingredient stock
        stock = computeRecipeStock(drinkLabId, stockByName);
      } else if (warehouseId) {
        // Direct warehouse link
        stock = stockById[warehouseId] ?? 0;
      }

      return {
        id: p.id as string,
        category_id: p.category_id as string | null,
        warehouse_product_id: warehouseId,
        drink_lab_id: drinkLabId,
        name: p.name as string,
        price: p.price as number,
        sort_order: p.sort_order as number,
        is_active: p.is_active as boolean,
        image_url: (p.image_url as string | null) ?? null,
        stock,
      };
    });

    setProducts(enriched);

    // Fetch best sellers (top 8 in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { data: topItems } = await supabase
      .from("bar_order_items")
      .select("bar_product_id, quantity")
      .gte("created_at", thirtyDaysAgo.toISOString());

    if (topItems) {
      const countMap = new Map<string, number>();
      for (const item of topItems) {
        countMap.set(item.bar_product_id, (countMap.get(item.bar_product_id) ?? 0) + item.quantity);
      }
      const sorted = [...countMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => id);
      setBestSellers(sorted);
    }
  }, [supabase]);

  /* ─── Initial load ─── */
  useEffect(() => {
    if (!barOperator) return;
    async function init() {
      setLoading(true);
      await Promise.all([loadCategories(), loadProducts()]);
      setLoading(false);
    }
    init();
  }, [barOperator, loadCategories, loadProducts]);

  /* ─── Wake lock ─── */
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        wakeLock = await navigator.wakeLock.request("screen");
      } catch {
        /* not supported or not allowed */
      }
    };
    request();
    const onVis = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      wakeLock?.release();
    };
  }, []);

  /* ─── Category icon map ─── */
  const categoryIconMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const cat of categories) {
      if (cat.icon) map[cat.id] = cat.icon;
    }
    return map;
  }, [categories]);

  /* ─── Filtered products ─── */
  const filteredProducts = useMemo(() => {
    let list = products;

    if (activeCategory === "best-sellers") {
      list = bestSellers.map(id => products.find(p => p.id === id)).filter(Boolean) as BarProduct[];
    } else if (activeCategory) {
      list = list.filter((p) => p.category_id === activeCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }

    return list;
  }, [products, activeCategory, searchQuery, bestSellers]);

  /* ─── Cart logic ─── */
  const addToCart = useCallback((product: BarProduct) => {
    haptic();
    playBeep();
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.product.id === product.id);
      if (idx >= 0) {
        return prev.map((c, i) =>
          i === idx ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((c) => c.product.id !== productId));
  }, []);

  const updateQty = useCallback((productId: string, delta: number) => {
    setCart((prev) => {
      const updated = prev.map((c) => {
        if (c.product.id !== productId) return c;
        const newQty = c.quantity + delta;
        return newQty <= 0 ? null : { ...c, quantity: newQty };
      });
      return updated.filter(Boolean) as CartItem[];
    });
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const cartTotal = useMemo(
    () => cart.reduce((sum, c) => sum + c.quantity * c.product.price, 0),
    [cart]
  );

  const finalTotal = useMemo(
    () => cartTotal * (1 - discountPercent / 100),
    [cartTotal, discountPercent]
  );

  /* ─── Complete order ─── */
  const completeOrder = useCallback(
    async (
      method: "contanti" | "carta" | "camera" | "misto" | "omaggio",
      extra?: {
        roomNumber?: string;
        guestName?: string;
        paymentSplit?: Record<string, number>;
        amountReceived?: number;
        changeGiven?: number;
        complimentaryReason?: string;
      }
    ) => {
      if (cart.length === 0 || completing || !barOperator) return;
      setCompleting(true);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          showToast("Sessione scaduta, ricarica la pagina", "error");
          setCompleting(false);
          return;
        }
        const operatorId = barOperator.id;

        // Active cassa session for cash/card/misto
        let cassaSessionId: string | null = null;
        if (method !== "camera" && method !== "omaggio") {
          const today = new Date().toISOString().slice(0, 10);
          const { data: session } = await supabase
            .from("cash_sessions")
            .select("id")
            .eq("shift_date", today)
            .is("closed_at", null)
            .limit(1)
            .maybeSingle();
          cassaSessionId = session?.id ?? null;
        }

        const isGift = method === "omaggio";
        const subtotal = cartTotal;
        const discountAmount = isGift ? subtotal : subtotal * (discountPercent / 100);
        const orderTotal = isGift ? 0 : subtotal - discountAmount;

        const { data: order, error } = await supabase
          .from("bar_orders")
          .insert({
            operator_id: operatorId,
            payment_method: method,
            room_number: extra?.roomNumber ?? null,
            guest_name: extra?.guestName ?? null,
            subtotal,
            discount: discountAmount,
            total: orderTotal,
            original_total: subtotal,
            amount_received: extra?.amountReceived ?? null,
            change_given: extra?.changeGiven ?? null,
            status: "pagato",
            cassa_session_id: cassaSessionId,
            notes: notes || null,
            completed_at: new Date().toISOString(),
            service_area: serviceArea,
            discount_type: discountPercent > 0 ? "percentuale" : null,
            discount_value: discountPercent > 0 ? discountPercent : 0,
            is_complimentary: isGift,
            complimentary_reason: isGift ? (extra?.complimentaryReason ?? "Omaggio") : null,
            payment_split: extra?.paymentSplit ?? null,
          })
          .select("id")
          .single();

        if (error || !order) {
          showToast("Errore creazione ordine", "error");
          setCompleting(false);
          return;
        }

        // Insert items
        const items = cart.map((c) => ({
          order_id: order.id,
          bar_product_id: c.product.id,
          product_name: c.product.name,
          quantity: c.quantity,
          unit_price: c.product.price,
          line_total: c.quantity * c.product.price,
        }));
        const { error: itemsError } = await supabase
          .from("bar_order_items")
          .insert(items);
        if (itemsError) {
          showToast("Errore salvataggio articoli", "error");
          setCompleting(false);
          return;
        }

        // Deduct stock — multi-ingredient for recipes, simple for direct links
        for (const c of cart) {
          if (c.product.drink_lab_id) {
            // Recipe-based: call deduct API for multi-ingredient deduction
            try {
              const res = await fetch("/api/drink-lab/deduct", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  recipeId: c.product.drink_lab_id,
                  quantity: c.quantity,
                  orderId: order.id,
                }),
              });
              const result = await res.json();
              if (result.warnings?.length) {
                for (const w of result.warnings) {
                  showToast(w, "warn");
                }
              }
            } catch {
              showToast(`Errore scarico ingredienti: ${c.product.name}`, "error");
            }
          } else if (c.product.warehouse_product_id) {
            // Simple 1:1 deduction
            await supabase.from("stock_movements").insert({
              product_id: c.product.warehouse_product_id,
              type: "out",
              quantity: c.quantity,
              notes: `Vendita bar #${order.id.slice(0, 8)}`,
              created_by: user.id,
            });
          }
          // No link: no stock deduction
        }

        // Record in cassa
        if (cassaSessionId && method !== "camera" && method !== "omaggio" && orderTotal > 0) {
          const cassaAmount = method === "misto" && extra?.paymentSplit
            ? (extra.paymentSplit["contanti"] ?? 0) + (extra.paymentSplit["carta"] ?? 0)
            : orderTotal;
          if (cassaAmount > 0) {
            await supabase.from("cash_movements").insert({
              session_id: cassaSessionId,
              created_by: user.id,
              type: "entrata",
              amount: cassaAmount,
              category: "vendita_bar",
              description: `Vendita bar${method === "misto" ? " (misto)" : ""} — ${cart.map((c) => `${c.quantity}x ${c.product.name}`).join(", ")}`,
            });
          }
        }

        // Show receipt if enabled
        if (isReceiptEnabled()) {
          setReceiptData({
            paymentMethod: method,
            cart: [...cart],
            subtotal,
            discount: discountAmount,
            total: orderTotal,
            isComplimentary: isGift,
            complimentaryReason: extra?.complimentaryReason,
            amountReceived: extra?.amountReceived,
            changeGiven: extra?.changeGiven,
            roomNumber: extra?.roomNumber,
            guestName: extra?.guestName,
            serviceArea,
            notes: notes || undefined,
            operatorName: barOperator.name,
          });
          setShowReceiptModal(true);
        }

        // Clear and refresh
        clearCart();
        setNotes("");
        setDiscountPercent(0);
        loadProducts();
        showToast(`Ordine completato — ${eur(orderTotal)}`, "ok");
      } catch {
        showToast("Errore imprevisto", "error");
      } finally {
        setCompleting(false);
      }
    },
    [cart, cartTotal, completing, notes, supabase, showToast, clearCart, loadProducts, serviceArea, discountPercent, barOperator]
  );

  /* ─── Cash payment flow ─── */
  const handleCashConfirm = useCallback(
    (amountReceived: number, changeGiven: number) => {
      setShowCashModal(false);
      completeOrder("contanti", { amountReceived, changeGiven });
    },
    [completeOrder]
  );

  /* ─── Gift flow ─── */
  const handleGiftConfirm = useCallback(
    (reason: string) => {
      setShowGiftModal(false);
      completeOrder("omaggio", { complimentaryReason: reason });
    },
    [completeOrder]
  );

  const handleRoomSelect = useCallback(
    (roomNumber: string, guestName: string) => {
      setShowRoomModal(false);
      completeOrder("camera", { roomNumber, guestName });
    },
    [completeOrder]
  );

  const handleSplitConfirm = useCallback(
    (split: { cashAmount: number; secondMethod: "carta" | "camera"; secondAmount: number; roomNumber?: string; guestName?: string }) => {
      setShowSplitModal(false);
      const splitMap: Record<string, number> = {
        contanti: split.cashAmount,
        [split.secondMethod]: split.secondAmount,
      };
      completeOrder("misto", { roomNumber: split.roomNumber, guestName: split.guestName, paymentSplit: splitMap });
    },
    [completeOrder]
  );

  const handleReceiptPrint = useCallback(() => {
    window.print();
  }, []);

  /* ─── Login screen ─── */
  if (!loginReady) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100%", fontFamily: "'Albert Sans', sans-serif",
        fontSize: 15, color: "#6C6B5D",
      }}>
        Caricamento...
      </div>
    );
  }

  if (!barOperator) {
    return <BarLoginScreen onLogin={handleLogin} />;
  }

  if (loading) {
    return (
      <>
        <BarHeader
          operatorName={barOperator.name}
          onChangeOperator={() => setShowOperatorModal(true)}
          onLogout={handleLogout}
        />
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          flex: 1, fontFamily: "'Albert Sans', sans-serif",
          fontSize: 15, color: "#6C6B5D",
        }}>
          Caricamento...
        </div>
      </>
    );
  }

  return (
    <>
      {/* Header */}
      <BarHeader
        operatorName={barOperator.name}
        onChangeOperator={() => setShowOperatorModal(true)}
        onLogout={handleLogout}
      />

      {/* Desktop / landscape layout */}
      <div className="bar-pos-layout" style={{ flex: 1 }}>
        {/* Left: products */}
        <div className="bar-pos-products">
          {/* Search */}
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid #D8CCB8",
              flexShrink: 0,
            }}
          >
            <div style={{ position: "relative" }}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6C6B5D"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  pointerEvents: "none",
                }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Cerca prodotto..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  fontFamily: "'Albert Sans', sans-serif",
                  fontSize: 15,
                  border: "1px solid #D8CCB8",
                  borderRadius: 8,
                  padding: "10px 14px 10px 36px",
                  color: "#1F3326",
                  background: "#fff",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  style={{
                    position: "absolute",
                    right: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "#D8CCB8",
                    color: "#1F3326",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    lineHeight: 1,
                    padding: 0,
                    fontFamily: "'Albert Sans', sans-serif",
                  }}
                  aria-label="Cancella ricerca"
                >
                  &times;
                </button>
              )}
            </div>
          </div>

          {/* Category tabs */}
          <CategoryTabs
            categories={categories}
            active={activeCategory}
            onSelect={setActiveCategory}
            bestSellers={bestSellers}
          />

          {/* Product grid */}
          <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
            {filteredProducts.length === 0 && searchQuery.trim() ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "40px 16px",
                  fontFamily: "'Albert Sans', sans-serif",
                  fontSize: 15,
                  color: "#6C6B5D",
                }}
              >
                Nessun prodotto trovato
              </div>
            ) : (
              <ProductGrid
                products={filteredProducts}
                onAdd={addToCart}
                categoryIconMap={categoryIconMap}
              />
            )}
          </div>
        </div>

        {/* Right: current order */}
        <div className="bar-pos-order">
          <CurrentOrder
            cart={cart}
            total={cartTotal}
            notes={notes}
            onNotesChange={setNotes}
            onUpdateQty={updateQty}
            onRemove={removeFromCart}
            onClear={clearCart}
            onPayCash={() => setShowCashModal(true)}
            onPayCard={() => completeOrder("carta")}
            onPayRoom={() => setShowRoomModal(true)}
            onPaySplit={() => setShowSplitModal(true)}
            onPayGift={() => setShowGiftModal(true)}
            onChangeOperator={() => setShowOperatorModal(true)}
            operatorOverrideName={barOperator.name}
            completing={completing}
            serviceArea={serviceArea}
            onServiceAreaChange={setServiceArea}
            discountPercent={discountPercent}
            onDiscountChange={setDiscountPercent}
          />
        </div>
      </div>

      {/* Cash payment modal */}
      <CashPaymentModal
        isOpen={showCashModal}
        onClose={() => setShowCashModal(false)}
        total={finalTotal}
        onConfirm={handleCashConfirm}
      />

      {/* Gift confirm modal */}
      <GiftConfirmModal
        isOpen={showGiftModal}
        onClose={() => setShowGiftModal(false)}
        onConfirm={handleGiftConfirm}
        total={cartTotal}
      />

      {/* Room charge modal */}
      <RoomChargeModal
        isOpen={showRoomModal}
        onClose={() => setShowRoomModal(false)}
        onSelect={handleRoomSelect}
      />

      {/* Split payment modal */}
      <SplitPaymentModal
        isOpen={showSplitModal}
        onClose={() => setShowSplitModal(false)}
        total={finalTotal}
        onConfirm={handleSplitConfirm}
      />

      {/* Operator change modal */}
      <OperatorChangeModal
        isOpen={showOperatorModal}
        onClose={() => setShowOperatorModal(false)}
        onSelect={handleOperatorChange}
      />

      {/* Receipt preview modal */}
      <ReceiptPreviewModal
        isOpen={showReceiptModal}
        onClose={() => setShowReceiptModal(false)}
        onPrint={handleReceiptPrint}
        order={receiptData}
      />

      <Toast toast={toast} />

      {/* Layout styles */}
      <style jsx global>{`
        .bar-pos-layout {
          display: flex;
          overflow: hidden;
        }

        .bar-pos-products {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border-right: 1px solid #D8CCB8;
        }

        .bar-pos-order {
          width: 360px;
          display: flex;
          flex-direction: column;
          background: #fff;
          flex-shrink: 0;
        }

        /* Portrait / mobile: stacked layout */
        @media (max-width: 1023px) {
          .bar-pos-layout {
            flex-direction: column;
          }

          .bar-pos-products {
            flex: 1;
            border-right: none;
            border-bottom: 1px solid #D8CCB8;
            min-height: 0;
          }

          .bar-pos-order {
            width: 100%;
            flex: 1;
            min-height: 0;
          }
        }

        /* Print styles for receipt */
        @media print {
          body * { visibility: hidden; }
          .modal-card, .modal-card * { visibility: visible; }
          .modal-card {
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm;
          }
          .modal-overlay { background: white !important; }
        }
      `}</style>
    </>
  );
}
