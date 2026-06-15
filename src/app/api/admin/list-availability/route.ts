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

  console.log("[list-availability] params:", { monthStart, monthEnd });

  const [subsResult, availResult, staffResult] = await Promise.all([
    admin.from("staff_availability_submissions").select("*"),
    admin.from("staff_week_availability").select("*"),
    admin.from("staff").select("id, name, type, active").eq("type", "a_chiamata").eq("active", true),
  ]);

  console.log("[list-availability] staff_availability_submissions:", {
    count: subsResult.data?.length ?? 0,
    error: subsResult.error?.message ?? null,
    data: subsResult.data,
  });

  console.log("[list-availability] staff_week_availability:", {
    count: availResult.data?.length ?? 0,
    error: availResult.error?.message ?? null,
    sample: availResult.data?.slice(0, 5),
  });

  console.log("[list-availability] staff a_chiamata:", {
    count: staffResult.data?.length ?? 0,
    data: staffResult.data,
  });

  const filteredAvail = monthStart && monthEnd
    ? (availResult.data ?? []).filter(
        (r: Record<string, string>) => r.avail_date >= monthStart && r.avail_date <= monthEnd
      )
    : availResult.data ?? [];

  const filteredSubs = monthStart
    ? (subsResult.data ?? []).filter((r: Record<string, string>) => r.month_start === monthStart)
    : subsResult.data ?? [];

  const staffList = (staffResult.data ?? []) as { id: string; name: string; type: string }[];
  const staffIds = new Set(staffList.map(s => s.id));

  const submissions = staffList.map(s => {
    const sub = filteredSubs.find((x: Record<string, string>) => x.staff_id === s.id);
    const staffSlots = filteredAvail.filter((a: Record<string, string>) => a.staff_id === s.id);
    return {
      staff_id: s.id,
      staff_name: s.name,
      submitted: !!sub,
      submitted_at: sub?.submitted_at ?? null,
      notes: sub?.notes ?? null,
      slot_count: staffSlots.length,
      slots: staffSlots.map((a: Record<string, string | boolean>) => ({
        avail_date: a.avail_date,
        shift_type_id: a.shift_type_id,
        available: a.available,
        status: a.status || (a.available ? "available" : "unavailable"),
      })),
    };
  });

  const orphanAvail = filteredAvail.filter((a: Record<string, string>) => !staffIds.has(a.staff_id));

  const debug = {
    total_submissions_in_db: subsResult.data?.length ?? 0,
    total_availability_rows_in_db: availResult.data?.length ?? 0,
    filtered_submissions: filteredSubs.length,
    filtered_availability_rows: filteredAvail.length,
    a_chiamata_staff_count: staffList.length,
    orphan_availability_rows: orphanAvail.length,
    staff_ids: staffList.map(s => ({ id: s.id, name: s.name })),
    raw_submissions: filteredSubs,
    orphan_sample: orphanAvail.slice(0, 10),
  };

  console.log("[list-availability] debug summary:", JSON.stringify(debug, null, 2));

  if (process.env.NODE_ENV === "development") {
    return NextResponse.json({ submissions, debug });
  }
  return NextResponse.json({ submissions });
}
