import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import BottomNav from "@/components/BottomNav";

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
      <header className="topbar">
        <div className="brand">
          <div className="mark serif">4</div>
          <div>
            <h1>Le 4 Camere</h1>
            <div className="sub">Gestione Spese</div>
          </div>
        </div>
        <div className="who">
          <span className="hide-sm">{who}</span>
          <form action="/auth/signout" method="post">
            <button type="submit" style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontWeight: 600, fontSize: 12.5 }}>
              Esci
            </button>
          </form>
        </div>
      </header>
      <main className="wrap">{children}</main>
      <BottomNav />
    </div>
  );
}
