import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rateLimit";
import { checkOrigin } from "@/lib/csrf";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServerClient(url, key);
}

export async function GET(request: Request) {
  if (!rateLimit(`consent:${getClientIp(request)}`, 10, 60_000)) return rateLimitResponse();
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Token mancante" }, { status: 400 });

  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "Configurazione server mancante" }, { status: 503 });
  const { data, error } = await supabase
    .from("privacy_consents")
    .select("staff_id, profile_id, consent_given, token_expires_at")
    .eq("accept_token", token)
    .single();

  if (error || !data) {
    console.error("[privacy/accept] Token lookup failed:", error?.message, "token:", token.slice(0, 8) + "...");
    return NextResponse.json({ error: "Token non valido" }, { status: 404 });
  }

  if (data.token_expires_at && new Date(data.token_expires_at) < new Date()) {
    return NextResponse.json({ error: "Token scaduto" }, { status: 410 });
  }

  let staffName = "Utente";
  if (data.staff_id) {
    const { data: staff } = await supabase.from("staff").select("name").eq("id", data.staff_id).single();
    if (staff?.name) staffName = staff.name;
  } else if (data.profile_id) {
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", data.profile_id).single();
    if (profile?.full_name) staffName = profile.full_name;
  }

  return NextResponse.json({
    staff_name: staffName,
    already_accepted: data.consent_given === true,
  });
}

export async function POST(request: Request) {
  if (!rateLimit(`consent-post:${getClientIp(request)}`, 10, 60_000)) return rateLimitResponse();
  const originErr = checkOrigin(request); if (originErr) return originErr;
  let body: { token?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON non valido" }, { status: 400 }); }
  const { token } = body;
  if (!token) return NextResponse.json({ error: "Token mancante" }, { status: 400 });

  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "Configurazione server mancante" }, { status: 503 });
  const { data, error } = await supabase
    .from("privacy_consents")
    .select("staff_id, profile_id, token_expires_at")
    .eq("accept_token", token)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Token non valido" }, { status: 404 });
  }

  if (data.token_expires_at && new Date(data.token_expires_at) < new Date()) {
    return NextResponse.json({ error: "Token scaduto" }, { status: 410 });
  }

  const now = new Date().toISOString();
  const { error: upErr } = await supabase.from("privacy_consents").update({
    consent_given: true,
    consent_date: now,
    accepted_via: "email",
    updated_at: now,
  }).eq("accept_token", token);
  if (upErr) return NextResponse.json({ error: "Errore salvataggio consenso" }, { status: 500 });

  return NextResponse.json({ ok: true, accepted_at: now });
}
