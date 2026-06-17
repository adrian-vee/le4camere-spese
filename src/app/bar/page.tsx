"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/Toast";
import { eur } from "@/lib/format";
import type { BarCategory, BarProduct, CartItem } from "@/lib/bar/types";
import CategoryTabs from "@/components/bar/CategoryTabs";
import ProductGrid from "@/components/bar/ProductGrid";
import CurrentOrder from "@/components/bar/CurrentOrder";
import RoomChargeModal from "@/components/bar/RoomChargeModal";

export default function BarPOSPage() {
  const supabase = createClient();
  const { toast, showToast } = useToast();

  const [categories, setCategories] = useState<BarCategory[]>([]);
  const [products, setProducts] = useState<BarProduct[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [serviceArea, setServiceArea] = useState("bar");
  const [discountPercent, setDiscountPercent] = useState(0);
  const [isComplimentary, setIsComplimentary] = useState(false);
  const [cassaOpen, setCassaOpen] = useState<boolean | null>(null);

  /* ─── Load categories ─── */
  const loadCategories = useCallback(async () => {
    const { data } = await supabase
      .from("bar_categories")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");
    if (data) setCategories(data);
  }, [supabase]);

  /* ─── Load products + stock ─── */
  const loadProducts = useCallback(async () => {
    const { data: prods } = await supabase
      .from("bar_products")
      .select("*, bar_categories(name)")
      .eq("is_active", true)
      .order("sort_order");

    if (!prods) return;

    const warehouseIds = prods
      .filter((p: Record<string, unknown>) => p.warehouse_product_id)
      .map((p: Record<string, unknown>) => p.warehouse_product_id as string);

    let stockMap: Record<string, number> = {};

    if (warehouseIds.length > 0) {
      const { data: stockData } = await supabase
        .from("stock_levels")
        .select("product_id, current_stock")
        .in("product_id", warehouseIds);

      if (stockData) {
        stockMap = Object.fromEntries(
          stockData.map((s: { product_id: string; current_stock: number }) => [
            s.product_id,
            s.current_stock,
          ])
        );
      }
    }

    const enriched: BarProduct[] = prods.map((p: Record<string, unknown>) => ({
      id: p.id as string,
      category_id: p.category_id as string | null,
      warehouse_product_id: p.warehouse_product_id as string | null,
      name: p.name as string,
      price: p.price as number,
      sort_order: p.sort_order as number,
      is_active: p.is_active as boolean,
      image_url: (p.image_url as string | null) ?? null,
      drink_lab_id: (p.drink_lab_id as string) || undefined,
      stock: p.warehouse_product_id
        ? stockMap[p.warehouse_product_id as string] ?? 0
        : null,
    }));

    setProducts(enriched);
  }, [supabase]);

  /* ─── Check cassa session ─── */
  const checkCassa = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("cash_sessions")
      .select("id")
      .eq("shift_date", today)
      .is("closed_at", null)
      .limit(1)
      .maybeSingle();
    setCassaOpen(!!data);
  }, [supabase]);

  /* ─── Initial load ─── */
  useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([loadCategories(), loadProducts(), checkCassa()]);
      setLoading(false);
    }
    init();
  }, [loadCategories, loadProducts, checkCassa]);

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

  /* ─── Filtered products ─── */
  const filteredProducts = useMemo(() => {
    let list = products;

    if (activeCategory) {
      list = list.filter((p) => p.category_id === activeCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }

    return list;
  }, [products, activeCategory, searchQuery]);

  /* ─── Cart logic ─── */
  const addToCart = useCallback((product: BarProduct) => {
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

  /* ─── Complete order ─── */
  const completeOrder = useCallback(
    async (
      method: "contanti" | "carta" | "camera",
      roomNumber?: string,
      guestName?: string
    ) => {
      if (cart.length === 0 || completing) return;
      setCompleting(true);

      try {
        // 1. Current user
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          showToast("Sessione scaduta, ricarica la pagina", "error");
          setCompleting(false);
          return;
        }

        // 2. Active cassa session for cash/card — block if missing
        let cassaSessionId: string | null = null;
        if (method !== "camera" && !isComplimentary) {
          const today = new Date().toISOString().slice(0, 10);
          const { data: session } = await supabase
            .from("cash_sessions")
            .select("id")
            .eq("shift_date", today)
            .is("closed_at", null)
            .limit(1)
            .maybeSingle();
          if (!session) {
            showToast("Nessuna cassa aperta — apri una sessione cassa prima di registrare vendite contanti/carta", "error");
            setCassaOpen(false);
            setCompleting(false);
            return;
          }
          cassaSessionId = session.id;
          setCassaOpen(true);
        }

        // 3. Insert order
        const subtotal = cartTotal;
        const discountAmount = isComplimentary ? subtotal : subtotal * (discountPercent / 100);
        const finalTotal = isComplimentary ? 0 : subtotal - discountAmount;
        const { data: order, error } = await supabase
          .from("bar_orders")
          .insert({
            operator_id: user.id,
            payment_method: method,
            room_number: roomNumber ?? null,
            guest_name: guestName ?? null,
            subtotal,
            discount: discountAmount,
            total: finalTotal,
            status: "pagato",
            cassa_session_id: cassaSessionId,
            notes: notes || null,
            completed_at: new Date().toISOString(),
            service_area: serviceArea,
            discount_type: discountPercent > 0 ? "percentuale" : null,
            discount_value: discountPercent > 0 ? discountPercent : 0,
            is_complimentary: isComplimentary,
            complimentary_reason: isComplimentary ? (notes || "Omaggio") : null,
          })
          .select("id")
          .single();

        if (error || !order) {
          showToast("Errore creazione ordine", "error");
          setCompleting(false);
          return;
        }

        // 4. Insert items
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

        // 5. Deduct stock for warehouse-linked products
        for (const c of cart) {
          if (c.product.warehouse_product_id) {
            await supabase.from("stock_movements").insert({
              product_id: c.product.warehouse_product_id,
              type: "out",
              quantity: c.quantity,
              notes: `Vendita bar #${order.id.slice(0, 8)}`,
              created_by: user.id,
            });
          }
        }

        // 5b. Deduct Drink Lab ingredients for recipe-linked products
        for (const c of cart) {
          if (c.product.drink_lab_id) {
            try {
              await fetch("/api/drink-lab/deduct", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ recipeId: c.product.drink_lab_id, quantity: c.quantity }),
              });
            } catch {
              // Drink Lab deduction failure should never block the sale
            }
          }
        }

        // 6. Record in cassa if session active and not camera payment
        if (cassaSessionId && method !== "camera" && finalTotal > 0) {
          await supabase.from("cash_movements").insert({
            session_id: cassaSessionId,
            created_by: user.id,
            type: "entrata",
            amount: finalTotal,
            category: "vendita_bar",
            description: `Vendita bar — ${cart.map((c) => `${c.quantity}x ${c.product.name}`).join(", ")}`,
            payment_method: method,
          });
        }

        // 7. Clear and refresh
        clearCart();
        setNotes("");
        setDiscountPercent(0);
        setIsComplimentary(false);
        loadProducts();
        showToast(`Ordine completato — ${eur(finalTotal)}`, "ok");
      } catch {
        showToast("Errore imprevisto", "error");
      } finally {
        setCompleting(false);
      }
    },
    [cart, cartTotal, completing, notes, supabase, showToast, clearCart, loadProducts, serviceArea, discountPercent, isComplimentary]
  );

  const handleRoomSelect = useCallback(
    (roomNumber: string, guestName: string) => {
      setShowRoomModal(false);
      completeOrder("camera", roomNumber, guestName);
    },
    [completeOrder]
  );

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          fontFamily: "'Albert Sans', sans-serif",
          fontSize: 15,
          color: "#6C6B5D",
        }}
      >
        Caricamento...
      </div>
    );
  }

  return (
    <>
      {/* Desktop / landscape layout */}
      <div className="bar-pos-layout">
        {/* Left: products */}
        <div className="bar-pos-products">
          {/* Cassa indicator */}
          <div
            style={{
              padding: "8px 16px",
              background: cassaOpen ? "rgba(45,90,61,0.08)" : "rgba(158,59,46,0.08)",
              borderBottom: "1px solid #D8CCB8",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: cassaOpen ? "#2D5A3D" : "#9E3B2E",
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 13,
                fontFamily: "'Albert Sans', sans-serif",
                fontWeight: 600,
                color: cassaOpen ? "#2D5A3D" : "#9E3B2E",
              }}
            >
              {cassaOpen === null ? "Verifica cassa..." : cassaOpen ? "Cassa aperta" : "Cassa chiusa"}
            </span>
          </div>

          {/* Search */}
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid #D8CCB8",
              flexShrink: 0,
            }}
          >
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
                padding: "10px 14px",
                color: "#1F3326",
                background: "#fff",
                outline: "none",
              }}
            />
          </div>

          {/* Category tabs */}
          <CategoryTabs
            categories={categories}
            active={activeCategory}
            onSelect={setActiveCategory}
          />

          {/* Product grid */}
          <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
            <ProductGrid products={filteredProducts} onAdd={addToCart} />
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
            onPayCash={() => completeOrder("contanti")}
            onPayCard={() => completeOrder("carta")}
            onPayRoom={() => setShowRoomModal(true)}
            completing={completing}
            serviceArea={serviceArea}
            onServiceAreaChange={setServiceArea}
            discountPercent={discountPercent}
            onDiscountChange={setDiscountPercent}
            isComplimentary={isComplimentary}
            onComplimentaryChange={setIsComplimentary}
          />
        </div>
      </div>

      {/* Room charge modal */}
      <RoomChargeModal
        isOpen={showRoomModal}
        onClose={() => setShowRoomModal(false)}
        onSelect={handleRoomSelect}
      />

      <Toast toast={toast} />

      {/* Layout styles */}
      <style jsx global>{`
        .bar-pos-layout {
          display: flex;
          height: 100%;
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
      `}</style>
    </>
  );
}
