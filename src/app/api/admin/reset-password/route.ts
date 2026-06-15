import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rateLimit";

export async function POST(request: Request) {
  if (!rateLimit(`reset-pw:${getClientIp(request)}`, 5, 60_000)) return rateLimitResponse();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Solo admin" }, { status: 403 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY non configurata" }, { status: 503 });

  const { userId, password } = await request.json();
  if (!userId || !password) return NextResponse.json({ error: "userId e password obbligatori" }, { status: 400 });

  const admin = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  // Update password in auth
  const { error: authErr } = await admin.auth.admin.updateUserById(userId, { password });
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });

  // Set must_change_password = true
  const { error: profErr } = await admin.from("profiles").update({ must_change_password: true }).eq("id", userId);
  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
