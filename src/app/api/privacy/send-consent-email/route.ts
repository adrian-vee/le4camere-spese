import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { sendMail, consentEmailHtml, isMailerConfigured } from "@/lib/mailer";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rateLimit";
import { checkOrigin } from "@/lib/csrf";
import { randomUUID } from "crypto";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key);
}

async function upsertProfileConsent(
  serviceSupabase: NonNullable<ReturnType<typeof getServiceSupabase>>,
  profileId: string,
  fields: Record<string, unknown>
) {
  const { data: existing } = await serviceSupabase
    .from("privacy_consents")
    .select("profile_id")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (existing) {
    return serviceSupabase
      .from("privacy_consents")
      .update(fields)
      .eq("profile_id", profileId);
  }
  return serviceSupabase
    .from("privacy_consents")
    .insert({ profile_id: profileId, ...fields });
}

export async function POST(request: Request) {
  if (!rateLimit(`consent-email:${getClientIp(request)}`, 3, 60_000)) return rateLimitResponse();
  const originErr = checkOrigin(request); if (originErr) return originErr;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Solo admin" }, { status: 403 });

  if (!isMailerConfigured()) {
    return NextResponse.json({ error: "SMTP non configurato", noSmtp: true }, { status: 503 });
  }

  const serviceSupabase = getServiceSupabase();
  if (!serviceSupabase) return NextResponse.json({ error: "Configurazione server mancante" }, { status: 503 });
  const { staff_ids, test_email, profile_ids } = await request.json() as {
    staff_ids?: string[];
    test_email?: string;
    profile_ids?: string[];
  };

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
    const now = new Date().toISOString();

    const { data: adminStaff } = await supabase.from("staff").select("id").eq("profile_id", user.id).eq("active", true).maybeSingle();
    const staffId = (adminStaff as { id: string } | null)?.id;

    let saveError: string | null = null;
    if (staffId) {
      const { error } = await serviceSupabase.from("privacy_consents").upsert(
        { staff_id: staffId, profile_id: user.id, accept_token: token, token_expires_at: expiresAt, email_sent_at: now, updated_at: now },
        { onConflict: "staff_id" }
      );
      if (error) saveError = error.message;
    } else {
      const { error } = await upsertProfileConsent(serviceSupabase, user.id, {
        accept_token: token, token_expires_at: expiresAt, email_sent_at: now, updated_at: now,
      });
      if (error) saveError = error.message;
    }

    if (saveError) {
      console.error("[privacy] Test upsert error:", saveError);
      return NextResponse.json({ error: "Errore salvataggio token: " + saveError }, { status: 500 });
    }

    const acceptUrl = `${siteUrl}/privacy/accept?token=${token}`;
    const privacyUrl = `${siteUrl}/privacy`;
    const html = consentEmailHtml({ name: adminName, acceptUrl, privacyUrl, hotelName, hotelAddress, hotelEmail });
    const sent = await sendMail({ to: test_email, subject: `Informativa Privacy — ${hotelName}`, html });

    if (!sent) return NextResponse.json({ error: "Errore invio email" }, { status: 502 });
    return NextResponse.json({ ok: true, sent: 1 });
  }

  let totalSent = 0;
  const allErrors: string[] = [];

  // Send to profile-based users (admin/manager without staff records)
  if (profile_ids && profile_ids.length > 0) {
    for (const pid of profile_ids) {
      const { data: profileData } = await supabase.from("profiles").select("full_name").eq("id", pid).single();
      const name = profileData?.full_name || "Utente";

      const { data: authData } = await serviceSupabase.auth.admin.getUserById(pid);
      const email = authData?.user?.email;
      if (!email) {
        allErrors.push(`${name}: nessuna email trovata`);
        continue;
      }

      const token = randomUUID();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const now = new Date().toISOString();

      const { error: saveErr } = await upsertProfileConsent(serviceSupabase, pid, {
        accept_token: token, token_expires_at: expiresAt, email_sent_at: now, updated_at: now,
      });
      if (saveErr) {
        allErrors.push(`${name}: errore salvataggio token — ${saveErr.message}`);
        continue;
      }

      const acceptUrl = `${siteUrl}/privacy/accept?token=${token}`;
      const privacyUrl = `${siteUrl}/privacy`;
      const html = consentEmailHtml({ name, acceptUrl, privacyUrl, hotelName, hotelAddress, hotelEmail });
      const sent = await sendMail({ to: email, subject: `Informativa Privacy — ${hotelName}`, html });

      if (sent) totalSent++;
      else allErrors.push(`${name}: errore invio`);
    }
  }

  // Send to staff members
  if (staff_ids && staff_ids.length > 0) {
    const { data: staffList } = await supabase.from("staff").select("id, name, profile_id").in("id", staff_ids);
    if (!staffList || staffList.length === 0) {
      if (totalSent === 0 && allErrors.length === 0) {
        return NextResponse.json({ error: "Staff non trovati" }, { status: 404 });
      }
    } else {
      // Load all auth users + profiles once for email lookup
      const { data: authData } = await serviceSupabase.auth.admin.listUsers({ perPage: 1000 });
      const authUsers = authData?.users ?? [];
      const emailById = new Map<string, string>();
      const profileByName = new Map<string, { id: string; email: string }>();
      for (const u of authUsers) {
        if (u.email) emailById.set(u.id, u.email);
      }
      const { data: allProfiles } = await serviceSupabase.from("profiles").select("id, full_name");
      for (const p of (allProfiles ?? []) as { id: string; full_name: string | null }[]) {
        const email = emailById.get(p.id);
        if (p.full_name && email) {
          profileByName.set(p.full_name.trim().toLowerCase(), { id: p.id, email });
        }
      }

      for (const staff of staffList as { id: string; name: string; profile_id: string | null }[]) {
        let email = staff.profile_id ? emailById.get(staff.profile_id) ?? null : null;
        let resolvedProfileId = staff.profile_id;

        // Fallback: match by name if no profile_id linked
        if (!email) {
          const match = profileByName.get(staff.name.trim().toLowerCase());
          if (match) {
            email = match.email;
            resolvedProfileId = match.id;
            // Auto-link the staff record for future lookups
            await serviceSupabase.from("staff").update({ profile_id: match.id }).eq("id", staff.id);
          }
        }

        if (!email) {
          allErrors.push(`${staff.name}: nessuna email trovata (account non collegato)`);
          continue;
        }

        const token = randomUUID();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        const { error: upsertErr } = await serviceSupabase.from("privacy_consents").upsert(
          {
            staff_id: staff.id,
            profile_id: resolvedProfileId,
            accept_token: token,
            token_expires_at: expiresAt,
            email_sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "staff_id" }
        );
        if (upsertErr) {
          allErrors.push(`${staff.name}: errore salvataggio token — ${upsertErr.message}`);
          continue;
        }

        const acceptUrl = `${siteUrl}/privacy/accept?token=${token}`;
        const privacyUrl = `${siteUrl}/privacy`;
        const html = consentEmailHtml({ name: staff.name, acceptUrl, privacyUrl, hotelName, hotelAddress, hotelEmail });
        const sent = await sendMail({ to: email, subject: `Informativa Privacy — ${hotelName}`, html });

        if (sent) totalSent++;
        else {
          console.error(`[privacy] Email send failed for ${staff.name} (${email})`);
          allErrors.push(`${staff.name}: errore invio email`);
        }
      }
    }
  }

  if (!staff_ids?.length && !profile_ids?.length) {
    return NextResponse.json({ error: "Nessun destinatario fornito" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, sent: totalSent, errors: allErrors.length ? allErrors : undefined });
}
