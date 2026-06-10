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

  const { data: allProfiles } = await admin.from("profiles").select("id");
  const profileIds = new Set((allProfiles ?? []).map((p: { id: string }) => p.id));

  // Find staff records whose profile_id points to a deleted user
  const { data: allStaff } = await admin.from("staff").select("id, name, profile_id, active");
  const orphanStaff = (allStaff ?? []).filter(
    (s: { id: string; profile_id: string | null; active: boolean }) =>
      s.profile_id && !profileIds.has(s.profile_id)
  );
  const orphanIds = orphanStaff.map((s: { id: string }) => s.id);

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
    orphanStaff: orphanStaff.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })),
    cleaned,
  });
}
