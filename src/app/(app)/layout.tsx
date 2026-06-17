import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import BottomNav from "@/components/BottomNav";
import Sidebar from "@/components/Sidebar";
import PasswordGuard from "@/components/PasswordGuard";
import ContentHeader from "@/components/ContentHeader";
import ScrollToTop from "@/components/ScrollToTop";
import InstallBanner from "@/components/InstallBanner";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: stockData }, { data: staffLink }, { count: pendingFolioCount }] = await Promise.all([
    supabase.from("profiles").select("full_name, role, must_change_password, dismissed_alerts").eq("id", user.id).single(),
    supabase.from("stock_levels").select("product_id, name, current_stock, min_stock").eq("active", true).gt("min_stock", 0),
    supabase.from("staff").select("id, type").eq("profile_id", user.id).eq("active", true).maybeSingle(),
    supabase.from("bar_orders").select("id", { count: "exact", head: true }).eq("payment_method", "camera").eq("status", "pagato").or("room_folio_settled.is.null,room_folio_settled.eq.false"),
  ]);

  const who = profile?.full_name || user.email?.split("@")[0] || "Utente";
  const userRole = (profile?.role as "admin" | "manager" | "staff") || "staff";
  const mustChangePw = profile?.must_change_password ?? false;
  const lowStockCount = (stockData ?? []).filter(p => p.current_stock < p.min_stock).length;

  // Check if user is "a chiamata" staff via profile_id link (the only reliable match)
  const isAChiamata = (staffLink as { id: string; type: string } | null)?.type === "a_chiamata";

  // Build individual notifications for admin
  type Notif = { key: string; label: string; href: string; color: string };
  let notifications: Notif[] = [];
  let cassaAlertCount = 0;

  if (userRole === "admin") {
    const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonthStart = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;

    // Cassa + availability data — all in parallel
    const [{ data: stuckData }, { data: todayCashData }, { data: monthSubs }, { data: aChiamataAll }] = await Promise.all([
      supabase.from("cash_sessions").select("id, opened_at, shift_type").is("closed_at", null).lt("opened_at", tenHoursAgo),
      supabase.from("cash_sessions").select("id, shift_date, shift_type, opened_at, closed_at, expected_amount, actual_amount").eq("shift_date", today).limit(50),
      supabase.from("staff_availability_submissions").select("staff_id").eq("month_start", nextMonthStart),
      supabase.from("staff").select("id, name").eq("type", "a_chiamata").eq("active", true),
    ]);

    const rawDismissed = (profile as { dismissed_alerts?: string[] })?.dismissed_alerts;
    const dismissedKeys = new Set(Array.isArray(rawDismissed) ? rawDismissed : []);

    // Cassa stuck (open > 10h)
    for (const s of (stuckData ?? []) as { id: string }[]) {
      notifications.push({ key: `cassa_stuck_${s.id}`, label: "Cassa aperta da oltre 10 ore", href: "/cassa", color: "#BFA762" });
    }
    // Cash differences > €10 (from today's closed sessions)
    const todayCash = (todayCashData ?? []) as { id: string; shift_date: string; shift_type: string | null; closed_at: string | null; expected_amount: number | null; actual_amount: number | null }[];
    for (const s of todayCash) {
      if (s.closed_at && s.expected_amount != null && s.actual_amount != null && Math.abs(s.actual_amount - s.expected_amount) > 10) {
        const diff = Math.abs(s.actual_amount - s.expected_amount).toFixed(0);
        notifications.push({ key: `cassa_diff_${s.id}`, label: `Ammanco cassa: ${diff} EUR`, href: "/cassa", color: "#BFA762" });
      }
    }
    // Duplicate shifts (from today's sessions with shift_type)
    const dupMap = new Map<string, number>();
    for (const s of todayCash) {
      if (!s.shift_type) continue;
      const k = `${s.shift_date}_${s.shift_type}`;
      dupMap.set(k, (dupMap.get(k) ?? 0) + 1);
    }
    for (const [k, c] of dupMap) {
      if (c > 1) notifications.push({ key: `cassa_dup_${k}`, label: `Turno cassa duplicato: ${k}`, href: "/cassa", color: "#BFA762" });
    }
    // Missing monthly availability submissions for next month
    {
      const submittedIds = new Set(((monthSubs ?? []) as { staff_id: string }[]).map(s => s.staff_id));
      const missing = ((aChiamataAll ?? []) as { id: string; name: string }[]).filter(s => !submittedIds.has(s.id));
      if (missing.length > 0) {
        notifications.push({
          key: `avail_missing_${nextMonthStart}`,
          label: `${missing.length} staff a chiamata senza disponibilità`,
          href: "/disponibilita",
          color: "#C77B4A",
        });
      }
    }
    // Low stock — reuse stockData from initial Promise.all (no duplicate query)
    for (const p of (stockData ?? []) as { current_stock: number; min_stock: number; product_id?: string; name?: string }[]) {
      if (p.current_stock < p.min_stock) {
        const key = `low_stock_${p.product_id ?? "unknown"}`;
        notifications.push({ key, label: `Scorta bassa: ${p.name ?? "?"}`, href: "/magazzino", color: "#9E3B2E" });
      }
    }

    // Filter out dismissed
    notifications = notifications.filter(n => !dismissedKeys.has(n.key));
    cassaAlertCount = notifications.filter(n => n.href === "/cassa").length;
  }

  // Availability pending: for staff a_chiamata check own submission, for admin/manager check any missing
  let availabilityPending = false;
  if (userRole === "admin" || userRole === "manager") {
    availabilityPending = notifications.some(n => n.key.startsWith("avail_missing_"));
  } else if (isAChiamata && staffLink) {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonthStart = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;
    const { data: ownSub } = await supabase
      .from("staff_availability_submissions")
      .select("id")
      .eq("staff_id", (staffLink as { id: string }).id)
      .eq("month_start", nextMonthStart)
      .maybeSingle();
    availabilityPending = !ownSub;
  }

  return (
    <div className="shell">
      <Sidebar userName={who} lowStockCount={userRole === "admin" ? notifications.filter(n => n.key.startsWith("low_stock_")).length : lowStockCount} pendingFolioCount={pendingFolioCount ?? 0} userRole={userRole} isAChiamata={isAChiamata} availabilityPending={availabilityPending} />
      <div className="shell-content">
        <header className="topbar-mobile">
          <div className="brand">
            <div className="mark serif">4</div>
            <div className="brand-text">
              <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1.5 }}>LE 4 CAMERE HOTEL ★★★</h1>
              <div className="sub">GESTIONALE ALBERGHIERO</div>
            </div>
          </div>
        </header>
        <ContentHeader userRole={userRole} notifications={notifications} userName={who} />
        <ScrollToTop />
        <PasswordGuard mustChange={mustChangePw}>
          <main className="wrap">{children}</main>
        </PasswordGuard>
      </div>
      <InstallBanner />
      <BottomNav isAChiamata={isAChiamata} userName={who} userRole={userRole} />
    </div>
  );
}
