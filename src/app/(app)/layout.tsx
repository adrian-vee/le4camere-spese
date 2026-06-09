import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import BottomNav from "@/components/BottomNav";
import Sidebar from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: stockData }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    supabase.from("stock_levels").select("current_stock, min_stock").eq("active", true).gt("min_stock", 0),
  ]);

  const who = profile?.full_name || user.email?.split("@")[0] || "Utente";
  const lowStockCount = (stockData ?? []).filter(p => p.current_stock < p.min_stock).length;

  return (
    <div className="shell">
      <Sidebar userName={who} lowStockCount={lowStockCount} />
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
        <main className="wrap">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
