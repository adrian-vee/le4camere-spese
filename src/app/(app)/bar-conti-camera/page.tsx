"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { useRole } from "@/lib/useRole";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/Toast";
import { eur, fmtDate, isoToday } from "@/lib/format";
import type { BarOrder, BarOrderItem } from "@/lib/bar/types";
import { generateRoomSummaryPdf } from "@/lib/bar-pdf";

/* ── Types ── */

type RoomOrder = BarOrder & {
  bar_order_items?: BarOrderItem[];
};

type RoomGroup = {
  room_number: string;
  guest_name: string | null;
  orders: RoomOrder[];
  total: number;
};

/* ── Helpers ── */

function fmtDateTime(s: string): string {
  const d = new Date(s);
  return (
    d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }) +
    " " +
    d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
  );
}

function summarizeItems(items?: BarOrderItem[]): string {
  if (!items || items.length === 0) return "—";
  if (items.length <= 2) return items.map((i) => i.product_name).join(", ");
  return items.slice(0, 2).map((i) => i.product_name).join(", ") + ` +${items.length - 2}`;
}

/* ── Component ── */

export default function BarContiCameraPage() {
  const supabase = createClient();
  const router = useRouter();
  const { isAdmin, isManager, loading: roleLoading } = useRole();
  const { toast, showToast } = useToast();

  /* Filters */
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState(isoToday());
  const [searchGuest, setSearchGuest] = useState("");

  /* Data */
  const [groups, setGroups] = useState<RoomGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRoom, setExpandedRoom] = useState<string | null>(null);
  const [settlingRoom, setSettlingRoom] = useState<string | null>(null);

  /* Role guard */
  useEffect(() => {
    if (!roleLoading && !isAdmin && !isManager) {
      router.replace("/");
    }
  }, [roleLoading, isAdmin, isManager, router]);

  /* Fetch unsettled camera orders */
  const fetchOrders = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from("bar_orders")
      .select("*, bar_order_items(*)")
      .eq("payment_method", "camera")
      .eq("status", "pagato")
      .or("room_folio_settled.is.null,room_folio_settled.eq.false")
      .order("created_at", { ascending: false });

    if (dateFrom) query = query.gte("created_at", dateFrom + "T00:00:00");
    if (dateTo) query = query.lte("created_at", dateTo + "T23:59:59");

    const { data, error } = await query;
    if (error) {
      showToast("Errore caricamento addebiti", "error");
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as RoomOrder[];

    /* Group by room_number */
    const map = new Map<string, RoomGroup>();
    for (const order of rows) {
      const key = order.room_number ?? "—";
      if (!map.has(key)) {
        map.set(key, { room_number: key, guest_name: order.guest_name, orders: [], total: 0 });
      }
      const g = map.get(key)!;
      g.orders.push(order);
      g.total += Number(order.total);
      if (!g.guest_name && order.guest_name) g.guest_name = order.guest_name;
    }

    let result = Array.from(map.values());

    /* Filter by guest name */
    if (searchGuest.trim()) {
      const q = searchGuest.trim().toLowerCase();
      result = result.filter(
        (g) =>
          (g.guest_name ?? "").toLowerCase().includes(q) ||
          g.room_number.toLowerCase().includes(q),
      );
    }

    /* Sort by room number */
    result.sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }));
    setGroups(result);
    setLoading(false);
  }, [dateFrom, dateTo, searchGuest]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (roleLoading || (!isAdmin && !isManager)) return;
    fetchOrders();
  }, [fetchOrders, roleLoading, isAdmin, isManager]);

  /* Settle a room folio */
  async function settleRoom(roomNumber: string) {
    if (settlingRoom) return;
    setSettlingRoom(roomNumber);

    const group = groups.find((g) => g.room_number === roomNumber);
    if (!group) { setSettlingRoom(null); return; }

    const ids = group.orders.map((o) => o.id);
    const now = new Date().toISOString();

    const { error } = await supabase
      .from("bar_orders")
      .update({ room_folio_settled: true, room_checkout_date: now })
      .in("id", ids);

    if (error) {
      showToast("Errore durante il saldo", "error");
      setSettlingRoom(null);
      return;
    }

    showToast(`Camera ${roomNumber} saldata`, "ok");
    setExpandedRoom(null);
    setSettlingRoom(null);
    fetchOrders();
  }

  /* KPI calculations */
  const totalUnsettled = groups.reduce((s, g) => s + g.total, 0);
  const roomCount = groups.length;
  const todayStr = isoToday();
  const ordersToday = groups.reduce(
    (s, g) => s + g.orders.filter((o) => o.created_at.startsWith(todayStr)).length,
    0,
  );

  /* Loading guard */
  if (roleLoading || (!isAdmin && !isManager)) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#6C6B5D", fontFamily: "'Albert Sans', sans-serif" }}>
        Caricamento...
      </div>
    );
  }

  /* Shared styles */
  const inputStyle: React.CSSProperties = {
    fontSize: 13.5, padding: "9px 12px", borderRadius: 9,
    border: "1px solid var(--line, #D8CCB8)", fontFamily: "inherit",
    background: "var(--surface, #FFFFFF)", color: "var(--ink, #1F3326)",
  };

  return (
    <div style={{ padding: "24px 32px", fontFamily: "'Albert Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C77B4A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7v11a2 2 0 002 2h14a2 2 0 002-2V7" />
          <path d="M1 4h22v3H1z" />
          <path d="M10 11h4" />
        </svg>
        <h1 className="serif" style={{ fontSize: 28, fontWeight: 700, color: "var(--ink, #1F3326)", margin: 0 }}>
          Conti Camera
        </h1>
        {roomCount > 0 && (
          <span style={{
            background: "#C77B4A",
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            padding: "3px 10px",
            borderRadius: 20,
            fontFamily: "'Albert Sans', sans-serif",
          }}>
            {roomCount}
          </span>
        )}
      </div>
      <p style={{ fontSize: 14, color: "var(--ink-soft, #6C6B5D)", margin: "0 0 24px" }}>
        Addebiti bar sulle camere in attesa di saldo al checkout
      </p>

      {/* Filters */}
      <div className="filters" style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24, alignItems: "center" }}>
        <label style={{ fontSize: 13, color: "var(--ink-soft, #6C6B5D)", display: "flex", alignItems: "center", gap: 6 }}>
          Da
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ fontSize: 13, color: "var(--ink-soft, #6C6B5D)", display: "flex", alignItems: "center", gap: 6 }}>
          A
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} />
        </label>
        <input
          type="text"
          placeholder="Cerca ospite o camera..."
          value={searchGuest}
          onChange={(e) => setSearchGuest(e.target.value)}
          style={{ ...inputStyle, minWidth: 200 }}
        />
      </div>

      {/* KPI cards */}
      <div className="cards cards-3" style={{ marginBottom: 28 }}>
        <div className="card" style={{ borderTop: "3px solid var(--warn, #C77B4A)" }}>
          <div style={{ fontSize: 32, fontFamily: "'Bebas Neue', sans-serif", color: "var(--ink, #1F3326)", lineHeight: 1.1 }}>
            {eur(totalUnsettled)}
          </div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--ink-soft, #6C6B5D)", marginTop: 4 }}>
            Totale non saldato
          </div>
        </div>
        <div className="card" style={{ borderTop: "3px solid var(--gold, #BFA762)" }}>
          <div style={{ fontSize: 32, fontFamily: "'Bebas Neue', sans-serif", color: "var(--ink, #1F3326)", lineHeight: 1.1 }}>
            {roomCount}
          </div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--ink-soft, #6C6B5D)", marginTop: 4 }}>
            Camere con addebiti
          </div>
        </div>
        <div className="card" style={{ borderTop: "3px solid var(--ok, #2D5A3D)" }}>
          <div style={{ fontSize: 32, fontFamily: "'Bebas Neue', sans-serif", color: "var(--ink, #1F3326)", lineHeight: 1.1 }}>
            {ordersToday}
          </div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--ink-soft, #6C6B5D)", marginTop: 4 }}>
            Addebiti oggi
          </div>
        </div>
      </div>

      {/* Room list */}
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--ink-soft, #6C6B5D)", fontSize: 14 }}>
          Caricamento...
        </div>
      ) : groups.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <p style={{ fontSize: 15, color: "var(--ink-soft, #6C6B5D)" }}>
            Nessun addebito camera in sospeso.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {groups.map((group) => {
            const isExpanded = expandedRoom === group.room_number;
            const isSettling = settlingRoom === group.room_number;

            return (
              <div key={group.room_number} className="card" style={{ padding: 0, overflow: "hidden" }}>
                {/* Room header (clickable) */}
                <div
                  onClick={() => setExpandedRoom(isExpanded ? null : group.room_number)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "18px 24px", cursor: "pointer", transition: "background 0.15s",
                    flexWrap: "wrap", gap: 12,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(191,167,98,0.06)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    {/* Room number badge */}
                    <div style={{
                      width: 52, height: 52, borderRadius: 12, display: "flex",
                      alignItems: "center", justifyContent: "center",
                      background: "var(--surface-2, #F3EBDD)", color: "var(--ink, #1F3326)",
                      fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, fontWeight: 400,
                    }}>
                      {group.room_number}
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink, #1F3326)" }}>
                        Camera {group.room_number}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--ink-soft, #6C6B5D)", marginTop: 2 }}>
                        {group.guest_name ?? "Ospite non specificato"} &middot; {group.orders.length} ordini
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{
                      fontSize: 22, fontFamily: "'Bebas Neue', sans-serif",
                      color: "var(--warn, #C77B4A)", letterSpacing: "0.5px",
                    }}>
                      {eur(group.total)}
                    </div>
                    <span style={{
                      fontSize: 18, color: "var(--ink-soft, #6C6B5D)",
                      transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.2s",
                      display: "inline-block",
                    }}>
                      &#9660;
                    </span>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{
                    borderTop: "1px solid var(--line, #D8CCB8)",
                    background: "var(--surface-2, #F3EBDD)",
                  }}>
                    {/* Orders detail table */}
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            {["Data/Ora", "Prodotto", "Qta", "Importo"].map((h) => (
                              <th key={h} style={{
                                padding: "10px 16px", textAlign: h === "Qta" ? "center" : "left", fontSize: 12,
                                fontWeight: 600, color: "var(--ink-soft, #6C6B5D)",
                                borderBottom: "1px solid var(--line, #D8CCB8)",
                                fontFamily: "'Albert Sans', sans-serif",
                                textTransform: "uppercase",
                                letterSpacing: "0.3px",
                              }}>
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {group.orders.flatMap((order) =>
                            (order.bar_order_items ?? []).map((item, idx) => (
                              <tr key={`${order.id}-${idx}`}>
                                <td style={{ padding: "10px 16px", fontSize: 13, color: "var(--ink-soft, #6C6B5D)", borderBottom: "1px solid rgba(216,204,184,0.3)" }}>
                                  {idx === 0 ? fmtDateTime(order.created_at) : ""}
                                </td>
                                <td style={{ padding: "10px 16px", fontSize: 13, color: "var(--ink, #1F3326)", borderBottom: "1px solid rgba(216,204,184,0.3)" }}>
                                  {item.product_name}
                                </td>
                                <td style={{ padding: "10px 16px", fontSize: 13, color: "var(--ink, #1F3326)", textAlign: "center", borderBottom: "1px solid rgba(216,204,184,0.3)" }}>
                                  {item.quantity}
                                </td>
                                <td style={{ padding: "10px 16px", fontSize: 13, fontWeight: 600, color: "var(--ink, #1F3326)", borderBottom: "1px solid rgba(216,204,184,0.3)" }}>
                                  {eur(item.line_total)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Settle button */}
                    <div style={{
                      padding: "16px 24px", display: "flex",
                      justifyContent: "space-between", alignItems: "center",
                      borderTop: "1px solid var(--line, #D8CCB8)",
                    }}>
                      <div style={{ fontSize: 13, color: "var(--ink-soft, #6C6B5D)" }}>
                        Totale camera: <strong style={{ color: "var(--ink, #1F3326)" }}>{eur(group.total)}</strong>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          generateRoomSummaryPdf({
                            roomNumber: group.room_number,
                            guestName: group.guest_name,
                            orders: group.orders.map((o) => ({
                              created_at: o.created_at,
                              total: Number(o.total),
                              items: (o.bar_order_items ?? []).map((item) => ({
                                product_name: item.product_name,
                                quantity: item.quantity,
                                unit_price: item.unit_price,
                                line_total: item.line_total,
                              })),
                            })),
                            grandTotal: group.total,
                          });
                        }}
                        style={{
                          padding: "10px 20px", borderRadius: 8,
                          border: "1px solid var(--line, #D8CCB8)",
                          background: "#fff", color: "var(--ink, #1F3326)",
                          fontFamily: "'Albert Sans', sans-serif",
                          fontSize: 13, fontWeight: 600, cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 6,
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        Stampa PDF
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); settleRoom(group.room_number); }}
                        disabled={isSettling}
                        style={{
                          padding: "10px 24px", borderRadius: 8, border: "none",
                          background: isSettling ? "var(--ink-soft, #6C6B5D)" : "var(--ink, #1F3326)",
                          color: "#fff", fontFamily: "'Albert Sans', sans-serif",
                          fontSize: 14, fontWeight: 600, cursor: isSettling ? "default" : "pointer",
                          opacity: isSettling ? 0.6 : 1, transition: "opacity 0.15s",
                        }}
                      >
                        {isSettling ? "Saldo in corso..." : "Salda conto"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Toast toast={toast} />
    </div>
  );
}
