import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const [
    { data: profile },
    { data: staffLink },
  ] = await Promise.all([
    supabase.from("profiles").select("full_name, role, created_at").eq("id", user.id).single(),
    supabase.from("staff").select("id, name, type").eq("profile_id", user.id).eq("active", true).maybeSingle(),
  ]);

  const staffId = (staffLink as { id: string } | null)?.id;

  // Fetch shifts from the actual shifts table (not shift_assignments which may be empty)
  const [
    { data: shifts },
    { data: leaves },
    { data: cashMovements },
    { data: availability },
    { data: shiftTypes },
  ] = await Promise.all([
    staffId
      ? supabase.from("shifts").select("shift_date, shift_type_id").eq("staff_id", staffId).order("shift_date", { ascending: false }).limit(500)
      : Promise.resolve({ data: [] }),
    supabase.from("staff_leaves").select("date, type, period, reason, status, created_at").eq("staff_id", user.id).order("date", { ascending: false }).limit(200),
    supabase.from("cash_movements").select("type, amount, category, description, created_at").eq("created_by", user.id).order("created_at", { ascending: false }).limit(500),
    staffId
      ? supabase.from("staff_week_availability").select("avail_date, shift_type_id, available, status").eq("staff_id", staffId).order("avail_date", { ascending: false }).limit(200)
      : Promise.resolve({ data: [] }),
    supabase.from("shift_types").select("id, name, start_time, end_time").order("sort"),
  ]);

  const exportData = {
    export_date: new Date().toISOString(),
    gdpr_article: "Art. 15 GDPR - Diritto di accesso",
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
    shift_types: shiftTypes ?? [],
    shifts: shifts ?? [],
    leaves: leaves ?? [],
    cash_movements: cashMovements ?? [],
    availability: availability ?? [],
  };

  return NextResponse.json(exportData);
}
