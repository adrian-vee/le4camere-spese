import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const body = await request.json();
  const { action, module, description, details } = body;

  if (!action || !module) {
    return NextResponse.json({ error: "action e module sono obbligatori" }, { status: 400 });
  }

  await supabase.from("activity_log").insert({
    user_id: user.id,
    user_name: profile?.full_name || user.email || "Utente",
    action,
    module,
    description: description || "",
    details: details ?? null,
  });

  return NextResponse.json({ ok: true });
}
