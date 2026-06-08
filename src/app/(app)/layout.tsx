import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import BottomNav from "@/components/BottomNav";
import Sidebar from "@/components/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const who = profile?.full_name || user.email?.split("@")[0] || "Utente";

  return (
    <div className="shell">
      <Sidebar userName={who} />
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
