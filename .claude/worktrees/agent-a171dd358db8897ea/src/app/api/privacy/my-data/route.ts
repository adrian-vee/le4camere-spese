import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  // Gather all user data in parallel
  const [
    { data: profile },
    { data: staffLink },
  ] = await Promise.all([
    supabase.from("profiles").select("full_name, role, created_at").eq("id", user.id).single(),
    supabase.from("staff").select("id, name, type").eq("profile_id", user.id).eq("active", true).maybeSingle(),
  ]);

  const staffId = (staffLink as { id: string } | null)?.id;

  // Second round: queries that depend on staffId
  const [
    { data: shifts },
    { data: leaves },
    { data: cashMovements },
    { data: stockMovements },
    { data: availability },
  ] = await Promise.all([
    staffId
      ? supabase.from("shift_assignments").select("date, shift_type_id, created_at").eq("staff_id", staffId).order("date", { ascending: false })
      : Promise.resolve({ data: [] }),
    staffId
      ? supabase.from("staff_leaves").select("staff_id, type, start_date, end_date, period, notes, created_at").eq("staff_id", user.id).order("start_date", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase.from("cash_movements").select("id, type, amount, category, description, created_at").eq("created_by", user.id).order("created_at", { ascending: false }),
    supabase.from("stock_movements").select("id, product_id, type, quantity, notes, created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
    staffId
      ? supabase.from("staff_availability").select("date, period, status, created_at").eq("staff_id", staffId).order("date", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const exportData = {
    export_date: new Date().toISOString(),
    gdpr_article: "Art. 15 GDPR — Diritto di accesso",
    profile: {
      name: profile?.full_name ?? null,
      email: user.email ?? null,
      role: profile?.role ?? null,
      account_created: profile?.created_at ?? user.created_at ?? null,
    },
    staff_info: staffLink ? {
      name: (staffLink as { name: string }).name,
      type: (staffLink as { type: string }).type,
    } : null,
    shifts: shifts ?? [],
    leaves: leaves ?? [],
    cash_movements: cashMovements ?? [],
    stock_movements: stockMovements ?? [],
    availability: availability ?? [],
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="i-miei-dati-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
