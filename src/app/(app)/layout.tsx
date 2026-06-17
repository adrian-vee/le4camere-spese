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
    supabase.from("profiles").select("full_name, role, must_change_password").eq("id", user.id).single(),
    supabase.from("stock_levels").select("product_id, name, current_stock, min_stock").eq("active", true).gt("min_stock", 0),
    supabase.from("staff").select("id, type").eq("profile_id", user.id).eq("active", true).maybeSingle(),
    supabase.from("bar_orders").select("id", { count: "exact", head: true }).eq("payment_method", "camera").eq("status", "pagato").or("room_folio_settled.is.null,room_folio_settled.eq.false"),
  ]);

  const who = profile?.full_name || user.email?.split("@")[0] || "Utente";
  const userRole = (profile?.role as "admin" | "manager" | "staff") || "staff";
  const mustChangePw = profile?.must_change_password ?? false;
  const lowStockCount = (stockData ?? []).filter(p => p.current_stock < p.min_stock).length;

  const isAChiamata = (staffLink as { id: string; type: string } | null)?.type === "a_chiamata";

  let availabilityPending = false;
  if (userRole === "admin" || userRole === "manager") {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonthStart = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;
    const [{ data: monthSubs }, { data: aChiamataAll }] = await Promise.all([
      supabase.from("staff_availability_submissions").select("staff_id").eq("month_start", nextMonthStart),
      supabase.from("staff").select("id").eq("type", "a_chiamata").eq("active", true),
    ]);
    const submittedIds = new Set(((monthSubs ?? []) as { staff_id: string }[]).map(s => s.staff_id));
    const missing = ((aChiamataAll ?? []) as { id: string }[]).filter(s => !submittedIds.has(s.id));
    availabilityPending = missing.length > 0;
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
      <Sidebar userName={who} lowStockCount={lowStockCount} pendingFolioCount={pendingFolioCount ?? 0} userRole={userRole} isAChiamata={isAChiamata} availabilityPending={availabilityPending} />
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
        <ContentHeader userRole={userRole} userName={who} />
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
