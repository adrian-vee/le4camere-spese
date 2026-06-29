import { createClient } from "@/utils/supabase/server";
import { eur } from "@/lib/format";
import RoomRevenueChart from "./RoomRevenueChart";

export const dynamic = "force-dynamic";

type Booking = {
  id: number;
  arrival: string;
  departure: string;
  nights: number;
  guest_name: string | null;
  channel_name: string | null;
  price: number;
  adults: number;
  children: number;
  is_cancelled: boolean;
  is_blocked: boolean;
  booking_type: string | null;
  smoobu_apartments: { name: string }[] | { name: string } | null;
};

export default async function RicaviCamerePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const isManager = profile?.role === "admin" || profile?.role === "manager";
  if (!isManager) return <div style={{ padding: 40, textAlign: "center", color: "#6C6B5D" }}>Accesso riservato.</div>;

  const now = new Date();
  const curM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // 12 months back for KPIs and chart
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const from12 = `${twelveMonthsAgo.getFullYear()}-${String(twelveMonthsAgo.getMonth() + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const { data: bookingsRaw } = await supabase
    .from("smoobu_bookings")
    .select("id, arrival, departure, nights, guest_name, channel_name, price, adults, children, is_cancelled, is_blocked, booking_type, smoobu_apartments(name)")
    .gte("arrival", from12)
    .lte("arrival", monthEnd)
    .order("arrival", { ascending: false });

  const allBookings = (bookingsRaw ?? []) as Booking[];

  // Valid bookings: not cancelled, not blocked
  const validBookings = allBookings.filter(b => !b.is_cancelled && !b.is_blocked);

  // ── KPIs ──
  const totalRevenue12m = validBookings.reduce((s, b) => s + (Number(b.price) || 0), 0);
  const curMonthBookings = validBookings.filter(b => b.arrival?.slice(0, 7) === curM);
  const revenueMonth = curMonthBookings.reduce((s, b) => s + (Number(b.price) || 0), 0);
  const totalNights = validBookings.reduce((s, b) => s + (b.nights || 0), 0);
  const adr = totalNights > 0 ? totalRevenue12m / totalNights : 0;

  // ── Monthly chart data (12 months) ──
  const monthlyData: { label: string; revenue: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const lbl = d.toLocaleDateString("it-IT", { month: "short" });
    const label = lbl.charAt(0).toUpperCase() + lbl.slice(1);
    const revenue = validBookings.filter(b => b.arrival?.slice(0, 7) === key).reduce((s, b) => s + (Number(b.price) || 0), 0);
    monthlyData.push({ label, revenue });
  }

  // ── Channel breakdown ──
  const byChannel: Record<string, { count: number; revenue: number }> = {};
  for (const b of validBookings) {
    const ch = b.channel_name || "Sconosciuto";
    byChannel[ch] = byChannel[ch] || { count: 0, revenue: 0 };
    byChannel[ch].count++;
    byChannel[ch].revenue += Number(b.price) || 0;
  }
  const channels = Object.entries(byChannel)
    .map(([name, v]) => ({ name, ...v, pct: totalRevenue12m > 0 ? (v.revenue / totalRevenue12m) * 100 : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
  const maxChRev = Math.max(1, ...channels.map(c => c.revenue));

  // Channel colors
  const CH_COLORS: Record<string, string> = {
    "Booking.com": "#003580",
    "Airbnb": "#FF5A5F",
    "Direct booking": "#2D5A3D",
    "Expedia": "#FBAF17",
  };

  // ── Recent bookings (last 30) ──
  const recentBookings = validBookings.slice(0, 30);

  const rawDate = now.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="page-content" style={{ padding: "24px 28px", maxWidth: "100%" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: "#1F3326", margin: 0 }}>
          Ricavi Camere
        </h1>
        <p style={{ color: "#9C8E78", fontSize: 14, fontFamily: "'Albert Sans', sans-serif", margin: "4px 0 0" }}>
          Dati da Smoobu &middot; Aggiornato al {rawDate}
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 28 }}>
        {[
          { label: "Ricavi 12 mesi", value: eur(totalRevenue12m), color: "#BFA762" },
          { label: "Ricavi mese corrente", value: eur(revenueMonth), color: "#2D5A3D" },
          { label: "Prenotazioni valide", value: String(validBookings.length), color: "#4F7B8C" },
          { label: "ADR (prezzo medio/notte)", value: eur(adr), color: "#1F3326" },
        ].map((kpi, i) => (
          <div key={i} style={{
            background: "#fff", border: "1px solid #D8CCB8", borderRadius: 12,
            borderTop: `3px solid ${kpi.color}`, padding: "18px 20px",
          }}>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, fontWeight: 800,
              color: "#1F3326", lineHeight: 1.1,
            }}>
              {kpi.value}
            </div>
            <div style={{ fontSize: 12, color: "#9C8E78", fontFamily: "'Albert Sans', sans-serif", marginTop: 4 }}>
              {kpi.label}
            </div>
          </div>
        ))}
      </div>

      {/* Monthly Revenue Chart */}
      <div className="section" style={{ marginBottom: 28 }}>
        <div className="section-head">
          <h2>Ricavi mensili</h2>
          <span className="muted">Ultimi 12 mesi</span>
        </div>
        <div className="section-body" style={{ paddingBottom: 8 }}>
          <RoomRevenueChart data={monthlyData} />
        </div>
      </div>

      {/* Channel Breakdown */}
      <div className="section" style={{ marginBottom: 28 }}>
        <div className="section-head">
          <h2>Ripartizione per canale</h2>
          <span className="muted">Ultimi 12 mesi</span>
        </div>
        <div className="section-body">
          {channels.length === 0 ? (
            <p style={{ color: "#9C8E78", fontSize: 14 }}>Nessuna prenotazione nel periodo.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {channels.map((ch, i) => (
                <div key={i}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: "#1F3326", fontFamily: "'Albert Sans', sans-serif" }}>
                      {ch.name}
                    </span>
                    <span style={{ fontSize: 13, color: "#6C6B5D", fontFamily: "'Albert Sans', sans-serif" }}>
                      {eur(ch.revenue)} &middot; {ch.count} pren. &middot; {ch.pct.toFixed(1)}%
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: "#F3EBDD", overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 4,
                      width: `${(ch.revenue / maxChRev) * 100}%`,
                      background: CH_COLORS[ch.name] || "#BFA762",
                      transition: "width 0.3s ease",
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Bookings Table */}
      <div className="section">
        <div className="section-head">
          <h2>Prenotazioni recenti</h2>
          <span className="muted">{recentBookings.length} risultati</span>
        </div>
        <div className="section-body" style={{ overflowX: "auto" }}>
          {recentBookings.length === 0 ? (
            <p style={{ color: "#9C8E78", fontSize: 14 }}>Nessuna prenotazione trovata.</p>
          ) : (
            <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "'Albert Sans', sans-serif" }}>
              <thead>
                <tr style={{ background: "#F3EBDD", textAlign: "left" }}>
                  <th style={{ padding: "8px 12px", fontWeight: 600, color: "#1F3326" }}>Camera</th>
                  <th style={{ padding: "8px 12px", fontWeight: 600, color: "#1F3326" }}>Ospite</th>
                  <th style={{ padding: "8px 12px", fontWeight: 600, color: "#1F3326" }}>Arrivo</th>
                  <th style={{ padding: "8px 12px", fontWeight: 600, color: "#1F3326" }}>Partenza</th>
                  <th style={{ padding: "8px 12px", fontWeight: 600, color: "#1F3326", textAlign: "center" }}>Notti</th>
                  <th style={{ padding: "8px 12px", fontWeight: 600, color: "#1F3326" }}>Canale</th>
                  <th style={{ padding: "8px 12px", fontWeight: 600, color: "#1F3326", textAlign: "right" }}>Prezzo</th>
                </tr>
              </thead>
              <tbody>
                {recentBookings.map((b, i) => (
                  <tr key={b.id} style={{ borderBottom: "1px solid #E8E0D0", background: i % 2 === 0 ? "#fff" : "#FDFCF9" }}>
                    <td style={{ padding: "8px 12px", color: "#1F3326" }}>
                      {(Array.isArray(b.smoobu_apartments) ? b.smoobu_apartments[0]?.name : b.smoobu_apartments?.name) ?? "—"}
                    </td>
                    <td style={{ padding: "8px 12px", color: "#6C6B5D" }}>{b.guest_name || "—"}</td>
                    <td style={{ padding: "8px 12px", color: "#6C6B5D" }}>{b.arrival ? new Date(b.arrival).toLocaleDateString("it-IT", { day: "2-digit", month: "short" }) : "—"}</td>
                    <td style={{ padding: "8px 12px", color: "#6C6B5D" }}>{b.departure ? new Date(b.departure).toLocaleDateString("it-IT", { day: "2-digit", month: "short" }) : "—"}</td>
                    <td style={{ padding: "8px 12px", textAlign: "center", color: "#6C6B5D" }}>{b.nights || "—"}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <span style={{
                        display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 12,
                        background: b.channel_name === "Booking.com" ? "#E8EFF7" : b.channel_name === "Airbnb" ? "#FEECEC" : "#F3EBDD",
                        color: b.channel_name === "Booking.com" ? "#003580" : b.channel_name === "Airbnb" ? "#FF5A5F" : "#1F3326",
                      }}>
                        {b.channel_name || "—"}
                      </span>
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#1F3326" }}>
                      {eur(Number(b.price) || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
