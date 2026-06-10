import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Solo admin" }, { status: 403 });

  const { userId } = await request.json();
  if (!userId) return NextResponse.json({ error: "userId obbligatorio" }, { status: 400 });

  // Cannot delete yourself
  if (userId === user.id) return NextResponse.json({ error: "Non puoi eliminare il tuo account" }, { status: 400 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY non configurata" }, { status: 503 });

  const admin = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  const today = new Date().toISOString().slice(0, 10);

  // Find linked staff records
  const { data: staffRows } = await admin
    .from("staff")
    .select("id")
    .eq("profile_id", userId);
  const staffIds = (staffRows ?? []).map((s: { id: string }) => s.id);

  if (staffIds.length > 0) {
    // Delete all availability data
    await admin.from("staff_week_availability").delete().in("staff_id", staffIds);
    await admin.from("staff_availability_submissions").delete().in("staff_id", staffIds);

    // Delete future shifts (today onward) — past shifts are kept for history
    await admin.from("shifts").delete().in("staff_id", staffIds).gte("shift_date", today);

    // Unassign future housekeeping tasks
    await admin
      .from("housekeeping_tasks")
      .update({ assigned_to: null })
      .in("assigned_to", staffIds)
      .gte("task_date", today);

    // Delete future leave requests
    await admin.from("staff_leaves").delete().in("staff_id", staffIds).gte("date", today);

    // Deactivate staff records (keeps history linkable)
    await admin
      .from("staff")
      .update({ active: false, profile_id: null })
      .in("id", staffIds);
  }

  // Delete profile first (FK constraint), then auth user
  await admin.from("profiles").delete().eq("id", userId);
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
