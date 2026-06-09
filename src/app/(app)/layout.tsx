import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import BottomNav from "@/components/BottomNav";
import Sidebar from "@/components/Sidebar";
import PasswordGuard from "@/components/PasswordGuard";
import ContentHeader from "@/components/ContentHeader";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: stockData }] = await Promise.all([
    supabase.from("profiles").select("full_name, role, must_change_password").eq("id", user.id).single(),
    supabase.from("stock_levels").select("current_stock, min_stock").eq("active", true).gt("min_stock", 0),
  ]);

  const who = profile?.full_name || user.email?.split("@")[0] || "Utente";
  const userRole = (profile?.role as "admin" | "manager" | "staff") || "staff";
  const mustChangePw = profile?.must_change_password ?? false;
  const lowStockCount = (stockData ?? []).filter(p => p.current_stock < p.min_stock).length;

  // Cassa alerts for admin badge
  let cassaAlertCount = 0;
  if (userRole === "admin") {
    const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: stuckData }, { data: diffData }, { data: dupData }] = await Promise.all([
      supabase.from("cash_sessions").select("id").is("closed_at", null).lt("opened_at", tenHoursAgo),
      supabase.from("cash_sessions").select("id, expected_amount, actual_amount").not("closed_at", "is", null).gte("shift_date", today),
      supabase.from("cash_sessions").select("shift_date, shift_type").not("shift_type", "is", null).eq("shift_date", today),
    ]);
    const stuckCount = (stuckData ?? []).length;
    const diffCount = (diffData ?? []).filter((s: { expected_amount: number | null; actual_amount: number | null }) =>
      s.expected_amount != null && s.actual_amount != null && Math.abs(s.actual_amount - s.expected_amount) > 10
    ).length;
    const dupMap = new Map<string, number>();
    for (const s of (dupData ?? []) as { shift_date: string; shift_type: string }[]) {
      const key = `${s.shift_date}_${s.shift_type}`;
      dupMap.set(key, (dupMap.get(key) ?? 0) + 1);
    }
    const dupCount = Array.from(dupMap.values()).filter(c => c > 1).length;
    cassaAlertCount = stuckCount + diffCount + dupCount;
  }

  return (
    <div className="shell">
      <Sidebar userName={who} lowStockCount={lowStockCount} cassaAlertCount={cassaAlertCount} userRole={userRole} />
      <div className="shell-content">
        <header className="topbar-mobile">
          <div className="brand">
            <div className="mark serif">4</div>
            <div className="brand-text">
              <h1>Le 4 Camere</h1>
              <div className="sub">Gestione Spese</div>
            </div>
          </div>
          <div className="who">{who}</div>
        </header>
        <PasswordGuard mustChange={mustChangePw}>
          <main className="wrap">
            <ContentHeader userRole={userRole} lowStockCount={lowStockCount} cassaAlertCount={cassaAlertCount} adminNotifCount={cassaAlertCount + lowStockCount} />
            {children}
          </main>
        </PasswordGuard>
      </div>
      <BottomNav />
    </div>
  );
}
