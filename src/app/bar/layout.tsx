import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "POS Bar — Le 4 Camere",
};

export default async function BarLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100dvh",
      overflow: "hidden",
      background: "#FAF9F5",
    }}>
      {children}
    </div>
  );
}
