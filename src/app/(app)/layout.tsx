import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import BottomNav from "@/components/BottomNav";
import Sidebar from "@/components/Sidebar";
import PasswordGuard from "@/components/PasswordGuard";
import ContentHeader from "@/components/ContentHeader";
import ScrollToTop from "@/components/ScrollToTop";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: stockData }, { data: staffLink }] = await Promise.all([
    supabase.from("profiles").select("full_name, role, must_change_password, dismissed_alerts").eq("id", user.id).single(),
    supabase.from("stock_levels").select("current_stock, min_stock").eq("active", true).gt("min_stock", 0),
    supabase.from("staff").select("id, type").eq("profile_id", user.id).eq("active", true).maybeSingle(),
  ]);

  const who = profile?.full_name || user.email?.split("@")[0] || "Utente";
  const userRole = (profile?.role as "admin" | "manager" | "staff") || "staff";
  const mustChangePw = profile?.must_change_password ?? false;
  const lowStockCount = (stockData ?? []).filter(p => p.current_stock < p.min_stock).length;

  // Check if user is "a chiamata" staff (by profile_id link or name match fallback)
  let isAChiamata = (staffLink as { id: string; type: string } | null)?.type === "a_chiamata";
  if (!isAChiamata && userRole === "staff") {
    const { data: staffByName } = await supabase.from("staff").select("type").eq("name", who).eq("active", true).maybeSingle();
    isAChiamata = (staffByName as { type: string } | null)?.type === "a_chiamata";
  }

  // Build individual notifications for admin
  type Notif = { key: string; label: string; href: string; color: string };
  let notifications: Notif[] = [];
  let cassaAlertCount = 0;

  if (userRole === "admin") {
    const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: stuckData }, { data: diffData }, { data: dupData }, { data: lowItems }] = await Promise.all([
      supabase.from("cash_sessions").select("id").is("closed_at", null).lt("opened_at", tenHoursAgo),
      supabase.from("cash_sessions").select("id, expected_amount, actual_amount").not("closed_at", "is", null).gte("shift_date", today),
      supabase.from("cash_sessions").select("shift_date, shift_type").not("shift_type", "is", null).eq("shift_date", today),
      supabase.from("stock_levels").select("product_id, name, current_stock, min_stock").eq("active", true).gt("min_stock", 0),
    ]);

    const rawDismissed = (profile as { dismissed_alerts?: string[] })?.dismissed_alerts;
    const dismissedKeys = new Set(Array.isArray(rawDismissed) ? rawDismissed : []);

    // Cassa stuck (open > 10h)
    for (const s of (stuckData ?? []) as { id: string }[]) {
      notifications.push({ key: `cassa_stuck_${s.id}`, label: "Cassa aperta da oltre 10 ore", href: "/cassa", color: "#BFA762" });
    }
    // Cash differences > €10
    for (const s of (diffData ?? []) as { id: string; expected_amount: number | null; actual_amount: number | null }[]) {
      if (s.expected_amount != null && s.actual_amount != null && Math.abs(s.actual_amount - s.expected_amount) > 10) {
        const diff = Math.abs(s.actual_amount - s.expected_amount).toFixed(0);
        notifications.push({ key: `cassa_diff_${s.id}`, label: `Ammanco cassa: ${diff} EUR`, href: "/cassa", color: "#BFA762" });
      }
    }
    // Duplicate shifts
    const dupMap = new Map<string, number>();
    for (const s of (dupData ?? []) as { shift_date: string; shift_type: string }[]) {
      const k = `${s.shift_date}_${s.shift_type}`;
      dupMap.set(k, (dupMap.get(k) ?? 0) + 1);
    }
    for (const [k, c] of dupMap) {
      if (c > 1) notifications.push({ key: `cassa_dup_${k}`, label: `Turno cassa duplicato: ${k}`, href: "/cassa", color: "#BFA762" });
    }
    // Missing availability submissions for next week
    {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const nextMon = new Date(now);
      nextMon.setDate(now.getDate() + (dayOfWeek === 0 ? 1 : 8 - dayOfWeek));
      const nextWeekStart = nextMon.toISOString().slice(0, 10);
      const [{ data: aChiamataAll }, { data: subsAll }] = await Promise.all([
        supabase.from("staff").select("id, name").eq("type", "a_chiamata").eq("active", true),
        supabase.from("staff_availability_submissions").select("staff_id").eq("week_start", nextWeekStart),
      ]);
      const submittedIds = new Set(((subsAll ?? []) as { staff_id: string }[]).map(s => s.staff_id));
      const missing = ((aChiamataAll ?? []) as { id: string; name: string }[]).filter(s => !submittedIds.has(s.id));
      if (missing.length > 0) {
        notifications.push({
          key: `avail_missing_${nextWeekStart}`,
          label: `${missing.length} staff a chiamata senza disponibilità`,
          href: "/disponibilita",
          color: "#C77B4A",
        });
      }
    }
    // Low stock
    for (const p of (lowItems ?? []) as { product_id: string; name: string; current_stock: number; min_stock: number }[]) {
      if (p.current_stock < p.min_stock) {
        notifications.push({ key: `low_stock_${p.product_id}`, label: `Scorta bassa: ${p.name}`, href: "/magazzino", color: "#9E3B2E" });
      }
    }

    // Filter out dismissed
    notifications = notifications.filter(n => !dismissedKeys.has(n.key));
    cassaAlertCount = notifications.filter(n => n.href === "/cassa").length;
  }

  return (
    <div className="shell">
      <Sidebar userName={who} lowStockCount={userRole === "admin" ? notifications.filter(n => n.key.startsWith("low_stock_")).length : lowStockCount} cassaAlertCount={cassaAlertCount} userRole={userRole} isAChiamata={isAChiamata} />
      <div className="shell-content">
        <header className="topbar-mobile">
          <div className="brand">
            <div className="mark serif">4</div>
            <div className="brand-text">
              <h1>Le 4 Camere</h1>
              <div className="sub">Gestionale Alberghiero</div>
            </div>
          </div>
        </header>
        <ContentHeader userRole={userRole} notifications={notifications} />
        <ScrollToTop />
        <PasswordGuard mustChange={mustChangePw}>
          <main className="wrap">{children}</main>
        </PasswordGuard>
      </div>
      <BottomNav isAChiamata={isAChiamata} />
    </div>
  );
}
