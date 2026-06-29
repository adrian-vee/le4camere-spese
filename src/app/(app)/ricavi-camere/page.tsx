import { createClient } from "@/utils/supabase/server";
import { eur } from "@/lib/format";
import RoomRevenueChart from "./RoomRevenueChart";
import SmoobuSyncPanel from "./SmoobuSyncPanel";
import RicaviCamereClient from "./RicaviCamereClient";

export const dynamic = "force-dynamic";

type BookingRow = {
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
  apartment_id: number | null;
  smoobu_apartments: { name: string }[] | { name: string } | null;
};

function getAptName(row: BookingRow): string | null {
  if (Array.isArray(row.smoobu_apartments)) return row.smoobu_apartments[0]?.name ?? null;
  return row.smoobu_apartments?.name ?? null;
}

export default async function RicaviCamerePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const userRole = profile?.role ?? "staff";
  const isManager = userRole === "admin" || userRole === "manager";
  const isAdmin = userRole === "admin";
  if (!isManager) return <div style={{ padding: 40, textAlign: "center", color: "#6C6B5D" }}>Accesso riservato.</div>;

  const now = new Date();
  const curM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // 12 months back for KPIs and chart
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const from12 = `${twelveMonthsAgo.getFullYear()}-${String(twelveMonthsAgo.getMonth() + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  // Fetch ALL bookings for the table (no date filter — client filters)
  // Fetch 12-month bookings for KPIs/chart
  const [{ data: allBookingsRaw }, { data: kpiBookingsRaw }, { data: lastSyncRow }] = await Promise.all([
    supabase
      .from("smoobu_bookings")
      .select("id, arrival, departure, nights, guest_name, channel_name, price, adults, children, is_cancelled, is_blocked, booking_type, apartment_id, smoobu_apartments(name)")
      .order("arrival", { ascending: false }),
    supabase
      .from("smoobu_bookings")
      .select("id, arrival, price, nights, channel_name, is_cancelled, is_blocked")
      .gte("arrival", from12)
      .lte("arrival", monthEnd)
      .eq("is_cancelled", false)
      .eq("is_blocked", false),
    supabase
      .from("settings")
      .select("value")
      .eq("key", "smoobu_last_sync_at")
      .single(),
  ]);

  const allBookings = (allBookingsRaw ?? []) as BookingRow[];
  const kpiBookings = (kpiBookingsRaw ?? []) as { id: number; arrival: string; price: number; nights: number; channel_name: string | null; is_cancelled: boolean; is_blocked: boolean }[];

  // Last sync info
  const lastSyncAt = (lastSyncRow?.value as { timestamp?: string } | null)?.timestamp ?? null;
  const lastSyncFormatted = lastSyncAt
    ? new Date(lastSyncAt).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  // ── KPIs (12 months, valid only) ──
  const totalRevenue12m = kpiBookings.reduce((s, b) => s + (Number(b.price) || 0), 0);
  const curMonthBookings = kpiBookings.filter(b => b.arrival?.slice(0, 7) === curM);
  const revenueMonth = curMonthBookings.reduce((s, b) => s + (Number(b.price) || 0), 0);
  const totalNights = kpiBookings.reduce((s, b) => s + (b.nights || 0), 0);
  const adr = totalNights > 0 ? totalRevenue12m / totalNights : 0;

  // ── Monthly chart data (12 months) ──
  const monthlyData: { label: string; revenue: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const lbl = d.toLocaleDateString("it-IT", { month: "short" });
    const label = lbl.charAt(0).toUpperCase() + lbl.slice(1);
    const revenue = kpiBookings.filter(b => b.arrival?.slice(0, 7) === key).reduce((s, b) => s + (Number(b.price) || 0), 0);
    monthlyData.push({ label, revenue });
  }

  // ── Channel breakdown (12 months, valid) ──
  const byChannel: Record<string, { count: number; revenue: number }> = {};
  for (const b of kpiBookings) {
    const ch = b.channel_name || "Sconosciuto";
    byChannel[ch] = byChannel[ch] || { count: 0, revenue: 0 };
    byChannel[ch].count++;
    byChannel[ch].revenue += Number(b.price) || 0;
  }
  const channelStats = Object.entries(byChannel)
    .map(([name, v]) => ({ name, ...v, pct: totalRevenue12m > 0 ? (v.revenue / totalRevenue12m) * 100 : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
  const maxChRev = Math.max(1, ...channelStats.map(c => c.revenue));

  const CH_COLORS: Record<string, string> = {
    "Booking.com": "#003580",
    "Airbnb": "#FF5A5F",
    "Direct booking": "#2D5A3D",
    "Expedia": "#FBAF17",
  };

  // ── Prepare client data ──
  const clientBookings = allBookings.map(b => ({
    id: b.id,
    arrival: b.arrival,
    departure: b.departure,
    nights: b.nights,
    guest_name: b.guest_name,
    channel_name: b.channel_name,
    price: b.price,
    adults: b.adults,
    children: b.children,
    is_cancelled: b.is_cancelled,
    is_blocked: b.is_blocked,
    booking_type: b.booking_type,
    apartment_name: getAptName(b),
  }));

  // Unique channels and apartments for filter dropdowns
  const uniqueChannels = Array.from(new Set(allBookings.map(b => b.channel_name).filter(Boolean) as string[])).sort();
  const uniqueApartments = Array.from(new Set(allBookings.map(b => getAptName(b)).filter(Boolean) as string[])).sort();

  const rawDate = now.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="page-content" style={{ padding: "24px 28px", maxWidth: "100%" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: "#1F3326", margin: 0 }}>
          Ricavi Camere
        </h1>
        <p style={{ color: "#9C8E78", fontSize: 14, fontFamily: "'Albert Sans', sans-serif", margin: "4px 0 0" }}>
          Dati da Smoobu &middot; Aggiornato al {rawDate}
          {lastSyncFormatted && <> &middot; Ultima sync: {lastSyncFormatted}</>}
        </p>
      </div>

      {/* Sync Panel — admin only */}
      {isAdmin && (
        <div style={{ marginBottom: 24 }}>
          <SmoobuSyncPanel />
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 28 }}>
        {[
          { label: "Ricavi 12 mesi", value: eur(totalRevenue12m), color: "#BFA762" },
          { label: "Ricavi mese corrente", value: eur(revenueMonth), color: "#2D5A3D" },
          { label: "Prenotazioni valide (12m)", value: String(kpiBookings.length), color: "#4F7B8C" },
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
          <span className="muted">Ultimi 12 mesi &middot; Solo prenotazioni valide</span>
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
          {channelStats.length === 0 ? (
            <p style={{ color: "#9C8E78", fontSize: 14 }}>Nessuna prenotazione nel periodo.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {channelStats.map((ch, i) => (
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

      {/* Bookings Table with filters + pagination */}
      <div className="section">
        <div className="section-head">
          <h2>Prenotazioni</h2>
          <span className="muted">{allBookings.length} totali nel database</span>
        </div>
        <div className="section-body">
          <RicaviCamereClient
            bookings={clientBookings}
            channels={uniqueChannels}
            apartments={uniqueApartments}
          />
        </div>
      </div>
    </div>
  );
}
