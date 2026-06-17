import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Solo admin" }, { status: 403 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY non configurata" }, { status: 503 });

  const admin = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: allProfilesData }, { data: allStaffData }] = await Promise.all([
    admin.from("profiles").select("id, full_name"),
    admin.from("staff").select("id, name, profile_id, active"),
  ]);

  const allProfiles = (allProfilesData ?? []) as { id: string; full_name: string | null }[];
  const profileIds = new Set(allProfiles.map(p => p.id));
  const profileNames = new Set(allProfiles.map(p => p.full_name?.trim().toLowerCase()).filter(Boolean));

  const allStaff = (allStaffData ?? []) as { id: string; name: string; profile_id: string | null; active: boolean }[];

  // Case 1: profile_id set but profile doesn't exist
  const orphansByFk = allStaff.filter(s => s.active && s.profile_id && !profileIds.has(s.profile_id));

  // Case 2: profile_id NULL (FK cascade set it to null when profile was deleted)
  //         AND no profile exists with a matching name → orphan
  const orphansByNull = allStaff.filter(s =>
    s.active && !s.profile_id && !profileNames.has(s.name.trim().toLowerCase())
  );

  const orphanStaff = [...orphansByFk, ...orphansByNull];
  const orphanIds = orphanStaff.map(s => s.id);
  const cleaned: string[] = [];

  if (orphanIds.length > 0) {
    const { count: c1 } = await admin.from("staff_week_availability").delete({ count: "exact" }).in("staff_id", orphanIds);
    if (c1) cleaned.push(`staff_week_availability: ${c1} righe`);

    const { count: c2 } = await admin.from("staff_availability_submissions").delete({ count: "exact" }).in("staff_id", orphanIds);
    if (c2) cleaned.push(`staff_availability_submissions: ${c2} righe`);

    const { count: c3 } = await admin.from("shifts").delete({ count: "exact" }).in("staff_id", orphanIds).gte("shift_date", today);
    if (c3) cleaned.push(`shifts futuri: ${c3} righe`);

    const { count: c4 } = await admin.from("housekeeping_tasks").update({ assigned_to: null }).in("assigned_to", orphanIds).gte("task_date", today);
    if (c4) cleaned.push(`housekeeping futuri disassegnati: ${c4}`);

    const { count: c5 } = await admin.from("staff_leaves").delete({ count: "exact" }).in("staff_id", orphanIds).gte("date", today);
    if (c5) cleaned.push(`ferie future: ${c5} righe`);

    await admin.from("staff").update({ active: false, profile_id: null }).in("id", orphanIds);
    cleaned.push(`staff disattivati: ${orphanIds.length}`);
  }

  return NextResponse.json({
    orphansByFk: orphansByFk.map(s => ({ id: s.id, name: s.name, reason: "profile_id points to deleted user" })),
    orphansByNull: orphansByNull.map(s => ({ id: s.id, name: s.name, reason: "profile_id NULL, no matching profile name" })),
    cleaned,
  });
}
