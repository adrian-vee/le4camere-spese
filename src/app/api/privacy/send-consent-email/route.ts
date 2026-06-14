import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { sendMail, consentEmailHtml, isMailerConfigured } from "@/lib/mailer";
import { randomUUID } from "crypto";

function getServiceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Solo admin" }, { status: 403 });

  if (!isMailerConfigured()) {
    return NextResponse.json({ error: "SMTP non configurato", noSmtp: true }, { status: 503 });
  }

  const serviceSupabase = getServiceSupabase();
  const { staff_ids, test_email } = await request.json() as { staff_ids?: string[]; test_email?: string };

  // Load settings for email template
  const { data: settingsData } = await supabase.from("settings").select("key, value");
  const settings: Record<string, string> = {};
  for (const row of (settingsData ?? []) as { key: string; value: string }[]) {
    settings[row.key] = typeof row.value === "string" ? row.value : String(row.value ?? "");
  }
  const hotelName = settings.hotel_name || "Le 4 Camere";
  const hotelAddress = settings.hotel_address || "";
  const hotelEmail = settings.hotel_email || "";
  const siteUrl = settings.site_url || process.env.NEXT_PUBLIC_APP_URL || "https://my.le4camere.com";

  // Test email to admin
  if (test_email) {
    const { data: adminProfile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
    const adminName = adminProfile?.full_name || "Admin";
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Create a test consent record for the admin's staff link (or use profile id)
    const { data: adminStaff } = await supabase.from("staff").select("id").eq("profile_id", user.id).eq("active", true).maybeSingle();
    const staffId = (adminStaff as { id: string } | null)?.id;

    if (staffId) {
      await serviceSupabase.from("privacy_consents").upsert(
        { staff_id: staffId, accept_token: token, token_expires_at: expiresAt, updated_at: new Date().toISOString() },
        { onConflict: "staff_id" }
      );
    }

    const acceptUrl = `${siteUrl}/privacy/accept?token=${token}`;
    const privacyUrl = `${siteUrl}/privacy`;
    const html = consentEmailHtml({ name: adminName, acceptUrl, privacyUrl, hotelName, hotelAddress, hotelEmail });
    const sent = await sendMail({ to: test_email, subject: `Informativa Privacy — ${hotelName}`, html });

    if (!sent) return NextResponse.json({ error: "Errore invio email" }, { status: 502 });
    return NextResponse.json({ ok: true, sent: 1 });
  }

  // Send to staff members
  if (!staff_ids || staff_ids.length === 0) {
    return NextResponse.json({ error: "Nessun staff_id fornito" }, { status: 400 });
  }

  const { data: staffList } = await supabase.from("staff").select("id, name, profile_id").in("id", staff_ids);
  if (!staffList || staffList.length === 0) {
    return NextResponse.json({ error: "Staff non trovati" }, { status: 404 });
  }

  // Resolve emails via service role (auth.users access)
  const emailMap = new Map<string, string>();
  for (const s of staffList as { id: string; name: string; profile_id: string | null }[]) {
    if (!s.profile_id) continue;
    const { data } = await serviceSupabase.auth.admin.getUserById(s.profile_id);
    if (data?.user?.email) emailMap.set(s.profile_id, data.user.email);
  }

  let sentCount = 0;
  const errors: string[] = [];

  for (const staff of staffList as { id: string; name: string; profile_id: string | null }[]) {
    const email = staff.profile_id ? emailMap.get(staff.profile_id) : null;
    if (!email) {
      errors.push(`${staff.name}: nessuna email trovata`);
      continue;
    }

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await serviceSupabase.from("privacy_consents").upsert(
      {
        staff_id: staff.id,
        accept_token: token,
        token_expires_at: expiresAt,
        email_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "staff_id" }
    );

    const acceptUrl = `${siteUrl}/privacy/accept?token=${token}`;
    const privacyUrl = `${siteUrl}/privacy`;
    const html = consentEmailHtml({ name: staff.name, acceptUrl, privacyUrl, hotelName, hotelAddress, hotelEmail });
    const sent = await sendMail({ to: email, subject: `Informativa Privacy — ${hotelName}`, html });

    if (sent) {
      sentCount++;
    } else {
      errors.push(`${staff.name}: errore invio`);
    }
  }

  return NextResponse.json({ ok: true, sent: sentCount, errors });
}
