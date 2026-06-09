import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { sendMail, credentialsEmailHtml, isMailerConfigured } from "@/lib/mailer";

export async function POST(request: Request) {
  // Verify the caller is an authenticated admin
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Solo admin" }, { status: 403 });

  if (!isMailerConfigured()) {
    return NextResponse.json({ error: "SMTP non configurato", noSmtp: true }, { status: 503 });
  }

  const { email, name, password } = await request.json();
  if (!email || !name || !password) {
    return NextResponse.json({ error: "email, name e password sono obbligatori" }, { status: 400 });
  }

  const html = credentialsEmailHtml(name, email, password);
  const sent = await sendMail({
    to: email,
    subject: "Le tue credenziali — Gestionale Le 4 Camere",
    html,
  });

  if (!sent) {
    return NextResponse.json({ error: "Errore invio email SMTP" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
