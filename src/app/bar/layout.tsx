import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import BarHeader from "@/components/bar/BarHeader";

export const dynamic = "force-dynamic";

export default async function BarLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  const operatorName = profile?.full_name || user.email?.split("@")[0] || "Operatore";

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100dvh",
      overflow: "hidden",
      background: "#FAF9F5",
    }}>
      <BarHeader operatorName={operatorName} />
      <div style={{ flex: 1, overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}
