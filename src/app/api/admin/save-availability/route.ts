import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY non configurata" }, { status: 503 });

  const admin = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  const body = await req.json();
  const { staff_id, month_start, month_end, notes, slots } = body as {
    staff_id: string;
    month_start: string;
    month_end: string;
    notes: string | null;
    slots: { avail_date: string; shift_type_id: string; available: boolean; status: string }[];
  };

  if (!staff_id || !month_start || !month_end || !Array.isArray(slots)) {
    return NextResponse.json({ error: "Parametri mancanti" }, { status: 400 });
  }

  // Verify the user owns this staff record
  const { data: staffRecord } = await admin
    .from("staff")
    .select("id, profile_id")
    .eq("id", staff_id)
    .single();

  if (!staffRecord || staffRecord.profile_id !== user.id) {
    return NextResponse.json({ error: "Non puoi modificare la disponibilita di un altro utente" }, { status: 403 });
  }

  // Server-side time window check: only 1-25 of current month
  const oggi = new Date();
  const giorno = oggi.getDate();
  if (giorno > 25) {
    return NextResponse.json({ error: "Finestra di invio chiusa (dopo il 25)" }, { status: 403 });
  }

  // Check edit_count: max 1 edit after first submit
  const { data: existingSub } = await admin
    .from("staff_availability_submissions")
    .select("id, edit_count")
    .eq("staff_id", staff_id)
    .eq("month_start", month_start)
    .maybeSingle();

  // Check if this staff already has availability slots (= already submitted once)
  const { count: existingSlotCount } = await admin
    .from("staff_week_availability")
    .select("id", { count: "exact", head: true })
    .eq("staff_id", staff_id)
    .gte("avail_date", month_start)
    .lte("avail_date", month_end);

  const currentEditCount = existingSub?.edit_count ?? 0;
  const hasExistingSlots = (existingSlotCount ?? 0) > 0;

  if (hasExistingSlots && currentEditCount >= 1) {
    return NextResponse.json({ error: "Modifica gia utilizzata. Contatta l'amministratore." }, { status: 403 });
  }

  // Delete existing slots for this month
  const { error: delErr } = await admin
    .from("staff_week_availability")
    .delete()
    .eq("staff_id", staff_id)
    .gte("avail_date", month_start)
    .lte("avail_date", month_end);

  if (delErr) {
    return NextResponse.json({ error: "Errore eliminazione slot: " + delErr.message }, { status: 500 });
  }

  // Insert new slots (only non-unspecified)
  const toInsert = slots
    .filter(s => s.status !== "unspecified")
    .map(s => ({
      staff_id,
      avail_date: s.avail_date,
      shift_type_id: s.shift_type_id,
      available: s.available,
      status: s.status,
    }));

  if (toInsert.length > 0) {
    const { error: insErr } = await admin.from("staff_week_availability").insert(toInsert);
    if (insErr) {
      return NextResponse.json({ error: "Errore inserimento slot: " + insErr.message }, { status: 500 });
    }
  }

  // Upsert submission record with incremented edit_count
  const newEditCount = hasExistingSlots ? currentEditCount + 1 : 0;

  const { error: subErr } = await admin
    .from("staff_availability_submissions")
    .upsert({
      staff_id,
      month_start,
      submitted_at: new Date().toISOString(),
      notes,
      edit_count: newEditCount,
    }, { onConflict: "staff_id,month_start" });

  if (subErr) {
    return NextResponse.json({ error: "Errore aggiornamento submission: " + subErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, edit_count: newEditCount });
}
