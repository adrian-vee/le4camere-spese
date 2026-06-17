"use client";

export const dynamic = "force-dynamic";

import { Fragment, useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { useRole } from "@/lib/useRole";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/Toast";
import { eur, isoToday } from "@/lib/format";
import { BarOrder, BarOrderItem } from "@/lib/bar/types";
import { getRecipeById } from "@/lib/barRecipes";
import { generateBarDailyReport, generateBarReceipt } from "@/lib/bar-pdf";

const PAGE_SIZE = 20;

type OrderRow = BarOrder & {
  profiles?: { full_name: string | null } | null;
};

type TotalsRow = {
  total: number;
  payment_method: string | null;
  status: string;
};

/* ── Helpers ── */

function fmtDateTime(s: string): string {
  const d = new Date(s);
  return (
    d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " +
    d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
  );
}

function paymentLabel(m: string | null): string {
  if (m === "contanti") return "Contanti";
  if (m === "carta") return "Carta";
  if (m === "camera") return "Camera";
  if (m === "misto") return "Misto";
  if (m === "omaggio") return "Omaggio";
  return "—";
}

function statusLabel(s: string): string {
  if (s === "pagato") return "Pagato";
  if (s === "annullato") return "Annullato";
  return s;
}

/* ── Badge styles ── */

const statusBadge: Record<string, React.CSSProperties> = {
  pagato: { background: "#E8F0EA", color: "var(--ok, #2D5A3D)" },
  annullato: { background: "#F5E3E0", color: "var(--danger, #9E3B2E)" },
};

const paymentBadge: Record<string, React.CSSProperties> = {
  contanti: { background: "#F3EBDD", color: "var(--ink, #1F3326)" },
  carta: { background: "#E3EDF5", color: "#4F7B8C" },
  camera: { background: "#F6E3D3", color: "var(--warn, #C77B4A)" },
  misto: { background: "#EDE3F5", color: "#7B61A6" },
  omaggio: { background: "#E8F0EA", color: "var(--ok, #2D5A3D)" },
};

/* ── Component ── */

export default function BarStoricoPage() {
  const supabase = createClient();
  const router = useRouter();
  const { isManager, loading: roleLoading } = useRole();
  const { toast, showToast } = useToast();

  /* Filters */
  const [dateFrom, setDateFrom] = useState(isoToday());
  const [dateTo, setDateTo] = useState(isoToday());
  const [paymentFilter, setPaymentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  /* Data */
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totals, setTotals] = useState<TotalsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  /* Expand */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<BarOrderItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  /* Role guard */
  useEffect(() => {
    if (!roleLoading && !isManager) {
      router.replace("/");
    }
  }, [roleLoading, isManager, router]);

  /* Fetch orders (paginated) */
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    const to = page * PAGE_SIZE - 1;

    let query = supabase
      .from("bar_orders")
      .select("*, profiles!bar_orders_operator_id_fkey(full_name)", { count: "exact" })
      .gte("created_at", dateFrom + "T00:00:00")
      .lte("created_at", dateTo + "T23:59:59")
      .order("created_at", { ascending: false });

    if (paymentFilter) query = query.eq("payment_method", paymentFilter);
    if (statusFilter) query = query.eq("status", statusFilter);

    query = query.range(from, to);

    const { data, count, error } = await query;
    if (error) {
      showToast("Errore caricamento ordini", "error");
      setLoading(false);
      return;
    }

    setOrders((data ?? []) as OrderRow[]);
    setTotalCount(count ?? 0);
    setLoading(false);
  }, [page, dateFrom, dateTo, paymentFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Fetch totals (no pagination) */
  const fetchTotals = useCallback(async () => {
    let query = supabase
      .from("bar_orders")
      .select("total, payment_method, status")
      .gte("created_at", dateFrom + "T00:00:00")
      .lte("created_at", dateTo + "T23:59:59");

    if (paymentFilter) query = query.eq("payment_method", paymentFilter);
    if (statusFilter) query = query.eq("status", statusFilter);

    const { data } = await query;
    setTotals((data ?? []) as TotalsRow[]);
  }, [dateFrom, dateTo, paymentFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Load on filter / page change */
  useEffect(() => {
    if (roleLoading || !isManager) return;
    fetchOrders();
    fetchTotals();
  }, [fetchOrders, fetchTotals, roleLoading, isManager]);

  /* Reset page when filters change */
  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [dateFrom, dateTo, paymentFilter, statusFilter]);

  /* Expand order detail */
  async function toggleExpand(orderId: string) {
    if (expandedId === orderId) {
      setExpandedId(null);
      setExpandedItems([]);
      return;
    }
    setExpandedId(orderId);
    setLoadingItems(true);
    const { data, error } = await supabase
      .from("bar_order_items")
      .select("*, bar_products(drink_lab_id, warehouse_product_id)")
      .eq("order_id", orderId);
    if (error) {
      showToast("Errore caricamento articoli", "error");
      setLoadingItems(false);
      return;
    }
    setExpandedItems((data ?? []) as BarOrderItem[]);
    setLoadingItems(false);
  }

  /* Get recipe deduction summary for display */
  function getRecipeDeductions(item: Record<string, unknown>): string | null {
    const bp = item.bar_products as { drink_lab_id?: string | null } | null;
    if (!bp?.drink_lab_id) return null;
    const recipe = getRecipeById(bp.drink_lab_id);
    if (!recipe) return null;
    const critical = recipe.ingredients.filter(i => !i.optional && i.amountMl > 0);
    if (critical.length === 0) return null;
    const qty = (item.quantity as number) ?? 1;
    return critical.map(i => {
      const totalMl = i.amountMl * qty;
      return `${i.productName} ${totalMl}ml`;
    }).join(", ");
  }

  /* Cancel order with reason + stock reversal */
  async function cancelOrder(order: OrderRow) {
    const reason = window.prompt("Motivo dell'annullamento:");
    if (!reason) return;
    setCancelling(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { showToast("Sessione scaduta", "error"); setCancelling(false); return; }

    const { error } = await supabase.from("bar_orders").update({
      status: "annullato",
      cancelled_by: user.id,
      cancelled_at: new Date().toISOString(),
      cancel_reason: reason,
    }).eq("id", order.id);

    if (error) { showToast("Errore annullamento: " + error.message, "error"); setCancelling(false); return; }

    const { data: items } = await supabase
      .from("bar_order_items")
      .select("bar_product_id, quantity")
      .eq("order_id", order.id);

    if (items && items.length > 0) {
      const { data: products } = await supabase
        .from("bar_products")
        .select("id, warehouse_product_id")
        .in("id", items.map((i: { bar_product_id: string }) => i.bar_product_id));

      const wpMap = new Map((products ?? []).map((p: { id: string; warehouse_product_id: string | null }) => [p.id, p.warehouse_product_id]));

      for (const item of items as { bar_product_id: string; quantity: number }[]) {
        const wpId = wpMap.get(item.bar_product_id);
        if (wpId) {
          await supabase.from("stock_movements").insert({
            product_id: wpId,
            type: "in",
            quantity: item.quantity,
            notes: `Storno bar — annullamento ordine`,
            created_by: user.id,
          });
        }
      }
    }

    setCancelling(false);
    showToast("Ordine annullato — scorte ripristinate");
    fetchOrders();
    fetchTotals();
  }

  /* Generate daily report PDF */
  async function generateDailyPdf() {
    setGeneratingPdf(true);
    try {
      const { data: allOrders } = await supabase
        .from("bar_orders")
        .select("*, profiles!bar_orders_operator_id_fkey(full_name), bar_order_items(*)")
        .gte("created_at", dateFrom + "T00:00:00")
        .lte("created_at", dateTo + "T23:59:59")
        .order("created_at", { ascending: false });

      if (!allOrders || allOrders.length === 0) {
        showToast("Nessun ordine nel periodo selezionato", "error");
        setGeneratingPdf(false);
        return;
      }

      generateBarDailyReport({
        date: dateFrom,
        orders: allOrders.map((o: Record<string, unknown>) => ({
          id: o.id as string,
          total: o.total as number,
          payment_method: o.payment_method as string | null,
          service_area: o.service_area as string | null,
          status: o.status as string,
          is_complimentary: (o.is_complimentary as boolean) ?? false,
          discount: (o.discount as number) ?? 0,
          operator_name: ((o.profiles as { full_name: string | null } | null)?.full_name) ?? "Sconosciuto",
          items: ((o.bar_order_items as { product_name: string; quantity: number; unit_price: number; line_total: number }[]) ?? []),
        })),
      });
      showToast("PDF generato");
    } catch {
      showToast("Errore generazione PDF", "error");
    }
    setGeneratingPdf(false);
  }

  /* KPI calculations */
  const paidOrders = totals.filter((t) => t.status === "pagato");
  const totaleSales = paidOrders.reduce((s, t) => s + Number(t.total), 0);
  const numOrders = totals.length;
  const avgOrder = numOrders > 0 ? totaleSales / paidOrders.length : 0;

  const byMethod = {
    contanti: paidOrders.filter((t) => t.payment_method === "contanti").reduce((s, t) => s + Number(t.total), 0),
    carta: paidOrders.filter((t) => t.payment_method === "carta").reduce((s, t) => s + Number(t.total), 0),
    camera: paidOrders.filter((t) => t.payment_method === "camera").reduce((s, t) => s + Number(t.total), 0),
  };

  const omaggiOrders = paidOrders.filter((t) => t.payment_method === "omaggio");
  const omaggiCount = omaggiOrders.length;

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  /* Loading guard */
  if (roleLoading || !isManager) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#6C6B5D", fontFamily: "'Albert Sans', sans-serif" }}>
        Caricamento...
      </div>
    );
  }

  /* ── Render ── */
  return (
    <div style={{ padding: "24px 32px", fontFamily: "'Albert Sans', sans-serif" }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#BFA762" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" />
          </svg>
          <h1 className="serif" style={{ fontSize: 28, fontWeight: 700, color: "var(--ink, #1F3326)", margin: 0 }}>
            Storico Vendite Bar
          </h1>
        </div>
        <button
          type="button"
          onClick={generateDailyPdf}
          disabled={generatingPdf}
          style={{
            padding: "10px 20px", borderRadius: 8, border: "none",
            background: generatingPdf ? "#6C6B5D" : "var(--ink, #1F3326)",
            color: "#fff", fontFamily: "'Albert Sans', sans-serif",
            fontSize: 13, fontWeight: 600, cursor: generatingPdf ? "default" : "pointer",
            opacity: generatingPdf ? 0.6 : 1, display: "flex", alignItems: "center", gap: 8,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          {generatingPdf ? "Generazione..." : "Chiusura giornaliera PDF"}
        </button>
      </div>
      <p style={{ fontSize: 14, color: "var(--ink-soft, #6C6B5D)", margin: "4px 0 24px" }}>
        {dateFrom === dateTo
          ? `Ordini del ${new Date(dateFrom).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}`
          : `Dal ${new Date(dateFrom).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })} al ${new Date(dateTo).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}`}
      </p>

      {/* Filters */}
      <div className="filters" style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24, alignItems: "center" }}>
        <label style={{ fontSize: 13, color: "var(--ink-soft, #6C6B5D)", display: "flex", alignItems: "center", gap: 6 }}>
          Da
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{
              fontSize: 13.5, padding: "9px 12px", borderRadius: 9,
              border: "1px solid var(--line, #D8CCB8)", fontFamily: "inherit",
              background: "var(--surface, #FFFFFF)", color: "var(--ink, #1F3326)",
            }}
          />
        </label>
        <label style={{ fontSize: 13, color: "var(--ink-soft, #6C6B5D)", display: "flex", alignItems: "center", gap: 6 }}>
          A
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{
              fontSize: 13.5, padding: "9px 12px", borderRadius: 9,
              border: "1px solid var(--line, #D8CCB8)", fontFamily: "inherit",
              background: "var(--surface, #FFFFFF)", color: "var(--ink, #1F3326)",
            }}
          />
        </label>
        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
          style={{
            fontSize: 13.5, padding: "9px 12px", borderRadius: 9,
            border: "1px solid var(--line, #D8CCB8)", fontFamily: "inherit",
            background: "var(--surface, #FFFFFF)", color: "var(--ink, #1F3326)",
          }}
        >
          <option value="">Tutti i metodi</option>
          <option value="contanti">Contanti</option>
          <option value="carta">Carta</option>
          <option value="camera">Camera</option>
          <option value="misto">Misto</option>
          <option value="omaggio">Omaggio</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            fontSize: 13.5, padding: "9px 12px", borderRadius: 9,
            border: "1px solid var(--line, #D8CCB8)", fontFamily: "inherit",
            background: "var(--surface, #FFFFFF)", color: "var(--ink, #1F3326)",
          }}
        >
          <option value="">Tutti gli stati</option>
          <option value="pagato">Pagato</option>
          <option value="annullato">Annullato</option>
        </select>
      </div>

      {/* KPI cards */}
      <div className="cards cards-4" style={{ marginBottom: 28, flexWrap: "wrap" }}>
        {/* Totale vendite */}
        <div className="card" style={{ borderTop: "3px solid var(--ok, #2D5A3D)" }}>
          <div style={{ fontSize: 32, fontFamily: "'Bebas Neue', sans-serif", color: "var(--ink, #1F3326)", lineHeight: 1.1 }}>
            {eur(totaleSales)}
          </div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--ink-soft, #6C6B5D)", marginTop: 4 }}>
            Totale vendite
          </div>
        </div>

        {/* N. ordini */}
        <div className="card" style={{ borderTop: "3px solid var(--gold, #BFA762)" }}>
          <div style={{ fontSize: 32, fontFamily: "'Bebas Neue', sans-serif", color: "var(--ink, #1F3326)", lineHeight: 1.1 }}>
            {numOrders}
          </div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--ink-soft, #6C6B5D)", marginTop: 4 }}>
            N. ordini
          </div>
        </div>

        {/* Media ordine */}
        <div className="card" style={{ borderTop: "3px solid var(--ink, #1F3326)" }}>
          <div style={{ fontSize: 32, fontFamily: "'Bebas Neue', sans-serif", color: "var(--ink, #1F3326)", lineHeight: 1.1 }}>
            {eur(avgOrder)}
          </div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--ink-soft, #6C6B5D)", marginTop: 4 }}>
            Media ordine
          </div>
        </div>

        {/* Per metodo */}
        <div className="card" style={{ borderTop: "3px solid var(--warn, #C77B4A)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--ink-soft, #6C6B5D)" }}>Contanti</span>
              <span style={{ fontSize: 16, fontFamily: "'Bebas Neue', sans-serif", color: "var(--ink, #1F3326)" }}>
                {eur(byMethod.contanti)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--ink-soft, #6C6B5D)" }}>Carta</span>
              <span style={{ fontSize: 16, fontFamily: "'Bebas Neue', sans-serif", color: "var(--ink, #1F3326)" }}>
                {eur(byMethod.carta)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--ink-soft, #6C6B5D)" }}>Camera</span>
              <span style={{ fontSize: 16, fontFamily: "'Bebas Neue', sans-serif", color: "var(--ink, #1F3326)" }}>
                {eur(byMethod.camera)}
              </span>
            </div>
          </div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--ink-soft, #6C6B5D)", marginTop: 6 }}>
            Per metodo
          </div>
        </div>

        {/* Omaggi */}
        {omaggiCount > 0 && (
          <div className="card" style={{ borderTop: "3px solid #C4453C" }}>
            <div style={{ fontSize: 32, fontFamily: "'Bebas Neue', sans-serif", color: "#C4453C", lineHeight: 1.1 }}>
              {omaggiCount}
            </div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--ink-soft, #6C6B5D)", marginTop: 4 }}>
              Omaggi
            </div>
          </div>
        )}
      </div>

      {/* Orders table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-soft, #6C6B5D)", fontSize: 14 }}>
            Caricamento...
          </div>
        ) : orders.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-soft, #6C6B5D)", fontSize: 14 }}>
            Nessun ordine trovato per i filtri selezionati.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--surface-2, #F3EBDD)" }}>
                {["Data/Ora", "Operatore", "Articoli", "Metodo", "Totale", "Stato"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "12px 16px", textAlign: "left", fontSize: 13,
                      fontWeight: 600, color: "var(--ink-soft, #6C6B5D)",
                      borderBottom: "1px solid var(--line, #D8CCB8)",
                      fontFamily: "'Albert Sans', sans-serif",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((order, idx) => {
                const isExpanded = expandedId === order.id;
                const operatorName = order.profiles?.full_name ?? "—";
                const itemCount = order.items?.length ?? "—";
                return (
                  <Fragment key={order.id}>
                    <tr
                      onClick={() => toggleExpand(order.id)}
                      style={{
                        cursor: "pointer",
                        background: idx % 2 === 1 ? "rgba(243,235,221,0.3)" : "transparent",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(191,167,98,0.08)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 1 ? "rgba(243,235,221,0.3)" : "transparent")}
                    >
                      <td style={{ padding: "12px 16px", fontSize: 14, borderBottom: "1px solid var(--line, #D8CCB8)", color: "var(--ink, #1F3326)" }}>
                        {fmtDateTime(order.created_at)}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 14, borderBottom: "1px solid var(--line, #D8CCB8)", color: "var(--ink, #1F3326)" }}>
                        {operatorName}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 14, borderBottom: "1px solid var(--line, #D8CCB8)", color: "var(--ink, #1F3326)", textAlign: "center" }}>
                        {itemCount}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 14, borderBottom: "1px solid var(--line, #D8CCB8)" }}>
                        {order.payment_method ? (
                          <span
                            style={{
                              display: "inline-block", borderRadius: 20, padding: "4px 12px",
                              fontSize: 12, fontWeight: 500,
                              ...(paymentBadge[order.payment_method] ?? {}),
                            }}
                          >
                            {paymentLabel(order.payment_method)}
                          </span>
                        ) : (
                          <span style={{ color: "var(--ink-soft, #6C6B5D)" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 14, borderBottom: "1px solid var(--line, #D8CCB8)", fontWeight: 600, color: "var(--ink, #1F3326)" }}>
                        {eur(order.total)}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 14, borderBottom: "1px solid var(--line, #D8CCB8)" }}>
                        <span
                          style={{
                            display: "inline-block", borderRadius: 20, padding: "4px 12px",
                            fontSize: 12, fontWeight: 500,
                            ...(statusBadge[order.status] ?? { background: "#F3EBDD", color: "var(--ink-soft, #6C6B5D)" }),
                          }}
                        >
                          {statusLabel(order.status)}
                        </span>
                      </td>
                    </tr>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <tr key={order.id + "-detail"}>
                        <td colSpan={6} style={{ padding: 0, borderBottom: "1px solid var(--line, #D8CCB8)" }}>
                          <div
                            style={{
                              padding: "16px 32px", background: "var(--surface-2, #F3EBDD)",
                              borderTop: "1px dashed var(--line, #D8CCB8)",
                            }}
                          >
                            {loadingItems ? (
                              <div style={{ fontSize: 13, color: "var(--ink-soft, #6C6B5D)" }}>Caricamento articoli...</div>
                            ) : expandedItems.length === 0 ? (
                              <div style={{ fontSize: 13, color: "var(--ink-soft, #6C6B5D)" }}>Nessun articolo</div>
                            ) : (
                              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead>
                                  <tr>
                                    {["Prodotto", "Qtà", "Prezzo unitario", "Totale riga"].map((h) => (
                                      <th
                                        key={h}
                                        style={{
                                          padding: "8px 12px", textAlign: "left", fontSize: 12,
                                          fontWeight: 600, color: "var(--ink-soft, #6C6B5D)",
                                          borderBottom: "1px solid var(--line, #D8CCB8)",
                                        }}
                                      >
                                        {h}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {expandedItems.map((item, i) => {
                                    const deductions = getRecipeDeductions(item as unknown as Record<string, unknown>);
                                    return (
                                      <Fragment key={item.id ?? i}>
                                        <tr>
                                          <td style={{ padding: "8px 12px", fontSize: 13, color: "var(--ink, #1F3326)" }}>
                                            {item.product_name}
                                          </td>
                                          <td style={{ padding: "8px 12px", fontSize: 13, color: "var(--ink, #1F3326)" }}>
                                            {item.quantity}
                                          </td>
                                          <td style={{ padding: "8px 12px", fontSize: 13, color: "var(--ink, #1F3326)" }}>
                                            {eur(item.unit_price)}
                                          </td>
                                          <td style={{ padding: "8px 12px", fontSize: 13, fontWeight: 600, color: "var(--ink, #1F3326)" }}>
                                            {eur(item.line_total)}
                                          </td>
                                        </tr>
                                        {deductions && (
                                          <tr>
                                            <td colSpan={4} style={{
                                              padding: "0 12px 8px 28px", fontSize: 11,
                                              color: "#6C6B5D", fontStyle: "italic",
                                            }}>
                                              Scarico: {deductions}
                                            </td>
                                          </tr>
                                        )}
                                      </Fragment>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                            {order.notes && (
                              <div style={{ marginTop: 10, fontSize: 13, color: "var(--ink-soft, #6C6B5D)", fontStyle: "italic" }}>
                                Note: {order.notes}
                              </div>
                            )}
                            {order.room_number && (
                              <div style={{ marginTop: 4, fontSize: 13, color: "var(--ink-soft, #6C6B5D)" }}>
                                Camera: {order.room_number}
                                {order.guest_name ? ` — ${order.guest_name}` : ""}
                              </div>
                            )}
                            {order.cancel_reason && (
                              <div style={{ marginTop: 6, fontSize: 13, color: "#9E3B2E", fontWeight: 600 }}>
                                Motivo annullamento: {order.cancel_reason}
                              </div>
                            )}
                            {order.service_area && order.service_area !== "bar" && (
                              <div style={{ marginTop: 4, fontSize: 13, color: "var(--ink-soft, #6C6B5D)" }}>
                                Area: {order.service_area}
                              </div>
                            )}
                            {order.status === "pagato" && (
                              <div style={{ marginTop: 12, textAlign: "right", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    generateBarReceipt({
                                      paymentMethod: order.payment_method ?? "contanti",
                                      items: expandedItems.map(it => ({
                                        name: it.product_name,
                                        quantity: it.quantity,
                                        unitPrice: it.unit_price,
                                        lineTotal: it.line_total,
                                      })),
                                      subtotal: Number(order.subtotal),
                                      discount: Number(order.discount),
                                      total: Number(order.total),
                                      isComplimentary: order.is_complimentary ?? false,
                                      complimentaryReason: order.complimentary_reason ?? undefined,
                                      amountReceived: (order as unknown as Record<string, unknown>).amount_received as number | undefined,
                                      changeGiven: (order as unknown as Record<string, unknown>).change_given as number | undefined,
                                      roomNumber: order.room_number ?? undefined,
                                      guestName: order.guest_name ?? undefined,
                                      serviceArea: order.service_area ?? "bar",
                                      notes: order.notes ?? undefined,
                                      operatorName: operatorName,
                                      date: new Date(order.created_at),
                                    });
                                  }}
                                  style={{
                                    padding: "8px 16px",
                                    borderRadius: 8,
                                    border: "1px solid #D8CCB8",
                                    background: "#fff",
                                    color: "var(--ink, #1F3326)",
                                    fontSize: 13,
                                    fontWeight: 600,
                                    fontFamily: "'Albert Sans', sans-serif",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                  }}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="6 9 6 2 18 2 18 9" />
                                    <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
                                    <rect x="6" y="14" width="12" height="8" />
                                  </svg>
                                  Ristampa
                                </button>
                                <button
                                  type="button"
                                  disabled={cancelling}
                                  onClick={(e) => { e.stopPropagation(); cancelOrder(order); }}
                                  style={{
                                    padding: "8px 16px",
                                    borderRadius: 8,
                                    border: "1px solid #9E3B2E",
                                    background: "rgba(158,59,46,.08)",
                                    color: "#9E3B2E",
                                    fontSize: 13,
                                    fontWeight: 600,
                                    fontFamily: "'Albert Sans', sans-serif",
                                    cursor: cancelling ? "not-allowed" : "pointer",
                                    opacity: cancelling ? 0.6 : 1,
                                  }}
                                >
                                  {cancelling ? "Annullamento..." : "Annulla ordine"}
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalCount > PAGE_SIZE && (
        <div
          style={{
            display: "flex", justifyContent: "center", alignItems: "center",
            gap: 16, marginTop: 20,
          }}
        >
          <button
            className="btn btn-ghost"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={{ opacity: page <= 1 ? 0.4 : 1 }}
          >
            Precedente
          </button>
          <span style={{ fontSize: 13, color: "var(--ink-soft, #6C6B5D)" }}>
            Pagina {page} di {totalPages}
          </span>
          <button
            className="btn btn-ghost"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            style={{ opacity: page >= totalPages ? 0.4 : 1 }}
          >
            Successiva
          </button>
        </div>
      )}

      <Toast toast={toast} />
    </div>
  );
}
