import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: Request) {
  // Verify the caller is an authenticated admin
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Solo admin" }, { status: 403 });

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: "RESEND_API_KEY non configurata", noResend: true }, { status: 503 });
  }

  const { email, name, password } = await request.json();
  if (!email || !name || !password) {
    return NextResponse.json({ error: "email, name e password sono obbligatori" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://le4camere-spese.vercel.app";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAF9F5;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF9F5;padding:32px 0">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%">
        <!-- Header -->
        <tr><td style="background:#1F3326;padding:28px 32px;border-radius:12px 12px 0 0;text-align:center">
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:700;color:#FAF9F5;letter-spacing:3px">LE 4 CAMERE</div>
          <div style="font-size:11px;letter-spacing:4px;color:#BFA762;margin-top:4px;text-transform:uppercase">GESTIONALE ALBERGHIERO</div>
        </td></tr>
        <!-- Body -->
        <tr><td style="background:#FFFFFF;padding:32px;border-left:1px solid #D8CCB8;border-right:1px solid #D8CCB8">
          <p style="font-size:16px;color:#1F3326;margin:0 0 20px">Ciao <strong>${name}</strong>,</p>
          <p style="font-size:14px;color:#6C6B5D;line-height:1.6;margin:0 0 24px">
            Ti diamo il benvenuto nel gestionale di Le 4 Camere!<br>
            Ecco le tue credenziali di accesso:
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3EBDD;border-radius:10px;padding:20px;margin-bottom:24px">
            <tr><td style="padding:20px">
              <p style="margin:0 0 12px;font-size:14px;color:#6C6B5D">
                <span style="font-size:16px">&#128279;</span>&nbsp;
                <strong>Link:</strong> <a href="${appUrl}" style="color:#1F3326;font-weight:700">${appUrl}</a>
              </p>
              <p style="margin:0 0 12px;font-size:14px;color:#6C6B5D">
                <span style="font-size:16px">&#128231;</span>&nbsp;
                <strong>Email:</strong> <span style="color:#1F3326;font-weight:700">${email}</span>
              </p>
              <p style="margin:0;font-size:14px;color:#6C6B5D">
                <span style="font-size:16px">&#128273;</span>&nbsp;
                <strong>Password:</strong> <span style="color:#1F3326;font-weight:700">${password}</span>
              </p>
            </td></tr>
          </table>
          <p style="font-size:13px;color:#C77B4A;line-height:1.5;margin:0;padding:12px 16px;background:#FFF8F0;border-radius:8px;border-left:3px solid #C77B4A">
            Ti consigliamo di cambiare la password al primo accesso dalle <strong>Impostazioni profilo</strong>.
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#F3EBDD;padding:20px 32px;border-radius:0 0 12px 12px;text-align:center;border:1px solid #D8CCB8;border-top:none">
          <p style="margin:0;font-size:12px;color:#6C6B5D">
            Le 4 Camere Hotel &mdash; Gestionale Alberghiero
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const fromAddress = process.env.RESEND_FROM_EMAIL || "Le 4 Camere <onboarding@resend.dev>";

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [email],
      subject: "Le tue credenziali — Gestionale Le 4 Camere",
      html,
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text();
    return NextResponse.json({ error: "Errore invio email", detail }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
