import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

interface NotifToCreate {
  user_id: string;
  type: string;
  title: string;
  message: string;
  link: string;
  ref_key: string;
}

async function insertIfNew(
  supabase: Awaited<ReturnType<typeof createClient>>,
  notif: NotifToCreate
) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", notif.user_id)
    .eq("type", notif.type)
    .eq("title", notif.ref_key)
    .gte("created_at", cutoff)
    .limit(1);

  if (existing && existing.length > 0) return;

  await supabase.from("notifications").insert({
    user_id: notif.user_id,
    type: notif.type,
    title: notif.title,
    message: notif.message,
    link: notif.link,
    read: false,
  });
}

function getSetting<T>(settings: Record<string, unknown>, key: string, fallback: T): T {
  if (settings[key] !== undefined) return settings[key] as T;
  return fallback;
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const userRole = (profile?.role as string) || "staff";

  const { data: staffLink } = await supabase
    .from("staff")
    .select("id, type")
    .eq("profile_id", user.id)
    .eq("active", true)
    .maybeSingle();

  const isAChiamata = (staffLink as { id: string; type: string } | null)?.type === "a_chiamata";

  const { data: settingsData } = await supabase.from("settings").select("key, value");
  const settings: Record<string, unknown> = {};
  for (const row of settingsData ?? []) {
    settings[row.key] = row.value;
  }

  const now = new Date();

  const isAdminManager = userRole === "admin" || userRole === "manager";

  if (isAdminManager) {
    const docWarning = getSetting<number>(settings, "documenti_scadenza_warning", 30);
    const docUrgent = getSetting<number>(settings, "documenti_scadenza_urgente", 7);
    const warningDate = new Date(now);
    warningDate.setDate(warningDate.getDate() + docWarning);
    const warningISO = warningDate.toISOString().slice(0, 10);

    const { data: expiringDocs } = await supabase
      .from("documents")
      .select("id, title, expiry_date, status")
      .neq("status", "archiviato")
      .not("expiry_date", "is", null)
      .lte("expiry_date", warningISO);

    for (const doc of (expiringDocs ?? []) as { id: string; title: string; expiry_date: string }[]) {
      const expDate = new Date(doc.expiry_date);
      const daysLeft = Math.ceil((expDate.getTime() - now.getTime()) / 86400000);
      const isExpired = daysLeft < 0;
      const isUrgent = daysLeft <= docUrgent;
      const label = isExpired
        ? `Scaduto da ${Math.abs(daysLeft)} giorni`
        : `Scade tra ${daysLeft} giorni`;

      const adminIds = await getAdminManagerIds(supabase);
      for (const uid of adminIds) {
        await insertIfNew(supabase, {
          user_id: uid,
          type: "doc_expiring",
          title: `doc_${doc.id}`,
          message: `${doc.title}: ${label}`,
          link: "/documenti",
          ref_key: `doc_${doc.id}`,
        });
      }
    }

    const magScadWarning = getSetting<number>(settings, "magazzino_scadenza_warning", 30);
    const expiryDate = new Date(now);
    expiryDate.setDate(expiryDate.getDate() + magScadWarning);
    const expiryISO = expiryDate.toISOString().slice(0, 10);

    const { data: expiringProducts } = await supabase
      .from("stock_levels")
      .select("product_id, name, expiry_date")
      .eq("active", true)
      .not("expiry_date", "is", null)
      .lte("expiry_date", expiryISO);

    for (const p of (expiringProducts ?? []) as { product_id: string; name: string; expiry_date: string }[]) {
      const expDate = new Date(p.expiry_date);
      const daysLeft = Math.ceil((expDate.getTime() - now.getTime()) / 86400000);
      const label = daysLeft < 0
        ? `Scaduto da ${Math.abs(daysLeft)} giorni`
        : `Scade tra ${daysLeft} giorni`;

      const adminIds = await getAdminManagerIds(supabase);
      for (const uid of adminIds) {
        await insertIfNew(supabase, {
          user_id: uid,
          type: "product_expiring",
          title: `prod_exp_${p.product_id}`,
          message: `${p.name}: ${label}`,
          link: "/magazzino",
          ref_key: `prod_exp_${p.product_id}`,
        });
      }
    }

    const { data: lowStockProducts } = await supabase
      .from("stock_levels")
      .select("product_id, name, current_stock, min_stock")
      .eq("active", true)
      .gt("min_stock", 0);

    for (const p of (lowStockProducts ?? []) as { product_id: string; name: string; current_stock: number; min_stock: number }[]) {
      if (p.current_stock <= p.min_stock) {
        const adminIds = await getAdminManagerIds(supabase);
        for (const uid of adminIds) {
          await insertIfNew(supabase, {
            user_id: uid,
            type: "low_stock",
            title: `low_${p.product_id}`,
            message: `${p.name}: ${p.current_stock}/${p.min_stock}`,
            link: "/magazzino",
            ref_key: `low_${p.product_id}`,
          });
        }
      }
    }

    if (now.getDate() >= 26) {
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const nextMonthStart = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;

      const [{ data: aChiamataAll }, { data: monthSubs }] = await Promise.all([
        supabase.from("staff").select("id, name").eq("type", "a_chiamata").eq("active", true),
        supabase.from("staff_availability_submissions").select("staff_id").eq("month_start", nextMonthStart),
      ]);

      const submittedIds = new Set(((monthSubs ?? []) as { staff_id: string }[]).map(s => s.staff_id));
      const missing = ((aChiamataAll ?? []) as { id: string; name: string }[]).filter(s => !submittedIds.has(s.id));

      if (missing.length > 0) {
        const adminIds = await getAdminManagerIds(supabase);
        for (const uid of adminIds) {
          await insertIfNew(supabase, {
            user_id: uid,
            type: "availability_missing",
            title: `avail_miss_${nextMonthStart}`,
            message: `${missing.length} staff non hanno inviato le disponibilità`,
            link: "/disponibilita",
            ref_key: `avail_miss_${nextMonthStart}`,
          });
        }
      }
    }

    const invDate = getSetting<string>(settings, "inventario_prossima_data", "");
    const invReminderDays = getSetting<number>(settings, "inventario_promemoria_giorni", 3);
    if (invDate) {
      const invD = new Date(invDate + "T00:00:00");
      const todayD = new Date(now.toISOString().slice(0, 10) + "T00:00:00");
      const daysUntil = Math.round((invD.getTime() - todayD.getTime()) / 86400000);

      if (daysUntil === invReminderDays || daysUntil === 0) {
        const { data: pomType } = await supabase
          .from("shift_types")
          .select("id")
          .ilike("name", "%pomeriggio%")
          .limit(1)
          .maybeSingle();

        let afternoonProfileId: string | null = null;
        if (pomType) {
          const { data: pomShift } = await supabase
            .from("shifts")
            .select("staff_id, staff!inner(profile_id)")
            .eq("shift_date", invDate)
            .eq("shift_type_id", pomType.id)
            .not("staff_id", "is", null)
            .limit(1)
            .maybeSingle();
          if (pomShift) {
            afternoonProfileId = (pomShift.staff as unknown as { profile_id: string | null })?.profile_id ?? null;
          }
        }

        const adminIds = await getAdminManagerIds(supabase);
        const label = daysUntil === 0 ? "oggi" : `tra ${daysUntil} giorni`;
        const suffix = daysUntil === 0 ? "_day" : "_pre";

        if (afternoonProfileId) {
          if (!adminIds.includes(afternoonProfileId)) {
            await insertIfNew(supabase, {
              user_id: afternoonProfileId,
              type: "inventory_reminder",
              title: `inv_${invDate}${suffix}`,
              message: `Inventario programmato ${label} — sei tu il turno pomeriggio`,
              link: "/inventario",
              ref_key: `inv_${invDate}${suffix}`,
            });
          }
          for (const uid of adminIds) {
            await insertIfNew(supabase, {
              user_id: uid,
              type: "inventory_reminder",
              title: `inv_${invDate}${suffix}`,
              message: `Inventario ${label} — turno pomeriggio assegnato`,
              link: "/inventario",
              ref_key: `inv_${invDate}${suffix}`,
            });
          }
        } else {
          for (const uid of adminIds) {
            await insertIfNew(supabase, {
              user_id: uid,
              type: "inventory_reminder",
              title: `inv_${invDate}${suffix}`,
              message: `Inventario ${label} — nessuno assegnato al pomeriggio!`,
              link: "/turni",
              ref_key: `inv_${invDate}${suffix}`,
            });
          }
        }
      }
    }
  }

  if (isAChiamata && staffLink && now.getDate() >= 20) {
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonthStart = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;
    const deadlineDay = getSetting<number>(settings, "disponibilita_scadenza_giorno", 25);

    if (now.getDate() <= deadlineDay) {
      const { data: ownSub } = await supabase
        .from("staff_availability_submissions")
        .select("id")
        .eq("staff_id", (staffLink as { id: string }).id)
        .eq("month_start", nextMonthStart)
        .maybeSingle();

      if (!ownSub) {
        await insertIfNew(supabase, {
          user_id: user.id,
          type: "availability_reminder",
          title: `avail_remind_${nextMonthStart}`,
          message: `Ricordati di inviare le tue disponibilità entro il ${deadlineDay}`,
          link: "/disponibilita",
          ref_key: `avail_remind_${nextMonthStart}`,
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}

let _adminManagerCache: string[] | null = null;

async function getAdminManagerIds(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string[]> {
  if (_adminManagerCache) return _adminManagerCache;
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .in("role", ["admin", "manager"]);
  _adminManagerCache = ((data ?? []) as { id: string }[]).map(p => p.id);
  return _adminManagerCache;
}
