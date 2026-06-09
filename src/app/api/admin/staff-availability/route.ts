import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin" && profile?.role !== "manager")
    return NextResponse.json({ error: "Solo admin/manager" }, { status: 403 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY non configurata" }, { status: 503 });

  const admin = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  const monthStart = req.nextUrl.searchParams.get("month_start");
  const monthEnd = req.nextUrl.searchParams.get("month_end");
  const staffIds = req.nextUrl.searchParams.get("staff_ids")?.split(",").filter(Boolean) ?? [];

  if (!monthStart || !monthEnd || staffIds.length === 0) {
    return NextResponse.json({ error: "Parametri mancanti" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("staff_week_availability")
    .select("staff_id, avail_date, shift_type_id, available, status, created_at")
    .gte("avail_date", monthStart)
    .lte("avail_date", monthEnd)
    .in("staff_id", staffIds);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}
