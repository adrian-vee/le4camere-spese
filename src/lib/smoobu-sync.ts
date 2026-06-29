/**
 * Smoobu → Supabase sync logic.
 * Chiamato dal cron e dalla route admin.
 * Usa service-role client (bypassa RLS).
 *
 * Modalità:
 * - "incremental" (default): usa modifiedFrom = ultima sync − 1 giorno
 * - "full": riscarica tutto dal 2025-01-01 a +24 mesi
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getApartments, getReservations, type SmoobuBooking, type ReservationDiag } from "./smoobu";

// ── Types ────────────────────────────────────────────────────────

export type SyncMode = "incremental" | "full";

export type SyncDiag = {
  mode: SyncMode;
  window: string;
  modifiedFrom?: string;
  totalItems: number;
  pageCount: number;
  pagesFetched: number;
  bookingsFetched: number;
  bookingsWritten: number;
  batchErrors: number;
  elapsedSec: number;
};

export type SyncResult = {
  ok: boolean;
  apartments: number;
  bookings: number;
  diag?: SyncDiag;
  error?: string;
};

// ── Service client ───────────────────────────────────────────────

function getServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ── Last sync timestamp (settings table) ─────────────────────────

const SYNC_KEY = "smoobu_last_sync_at";

async function getLastSyncAt(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", SYNC_KEY)
    .single();
  if (!data?.value) return null;
  // value is JSONB, stored as { "timestamp": "2026-06-29T12:00:00Z" }
  const ts = (data.value as { timestamp?: string }).timestamp;
  return ts ?? null;
}

async function saveLastSyncAt(supabase: SupabaseClient, ts: string): Promise<void> {
  await supabase
    .from("settings")
    .upsert({ key: SYNC_KEY, value: { timestamp: ts }, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

// ── Sync apartments ─────────────────────────────────────────────

async function syncApartments(supabase: SupabaseClient): Promise<number> {
  const apartments = await getApartments();

  // Load rooms for auto-mapping
  const { data: rooms } = await supabase
    .from("rooms")
    .select("id, number, name")
    .eq("active", true);

  const roomsList = rooms ?? [];

  for (const apt of apartments) {
    let roomId: string | null = null;
    const nameMatch = apt.name.match(/^(\d+)\b/);
    if (nameMatch) {
      const num = parseInt(nameMatch[1], 10);
      const found = roomsList.find(r => r.number === num);
      if (found) roomId = found.id;
    }
    if (!roomId) {
      const found = roomsList.find(r => r.name && apt.name.toLowerCase().includes(r.name.toLowerCase()));
      if (found) roomId = found.id;
    }

    const { error } = await supabase
      .from("smoobu_apartments")
      .upsert(
        { id: apt.id, name: apt.name, ...(roomId ? { room_id: roomId } : {}) },
        { onConflict: "id", ignoreDuplicates: false },
      );

    if (error) {
      if (roomId && error.message.includes("room_id")) {
        await supabase
          .from("smoobu_apartments")
          .upsert({ id: apt.id, name: apt.name }, { onConflict: "id" });
      } else {
        console.error(`[smoobu-sync] apartment upsert error id=${apt.id}:`, error.message);
      }
    }
  }

  return apartments.length;
}

// ── Sync bookings ───────────────────────────────────────────────

function diffDays(arrival: string, departure: string): number {
  const a = new Date(arrival);
  const b = new Date(departure);
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

function bookingToRow(b: SmoobuBooking) {
  return {
    id: b.id,
    apartment_id: b.apartment?.id ?? null,
    channel_name: b.channel?.name ?? null,
    booking_type: b.type ?? "reservation",
    arrival: b.arrival?.slice(0, 10),
    departure: b.departure?.slice(0, 10),
    nights: diffDays(b.arrival, b.departure),
    guest_name: b["guest-name"] ?? null,
    adults: b.adults ?? 0,
    children: b.children ?? 0,
    price: b.price ?? 0,
    price_paid: b["price-paid"] ?? false,
    prepayment: b.prepayment ?? 0,
    deposit: b.deposit ?? 0,
    is_blocked: b["is-blocked-booking"] ?? false,
    is_cancelled: (b.type ?? "").toLowerCase() === "cancellation",
    smoobu_created_at: b["created-at"] ?? null,
    smoobu_modified_at: b["modified-at"] ?? null,
    synced_at: new Date().toISOString(),
  };
}

type BookingSyncResult = {
  synced: number;
  batchErrors: number;
  fetchDiag: ReservationDiag;
  bookingsFetched: number;
  window: string;
  modifiedFrom?: string;
};

function buildFullWindow(): { from: string; to: string } {
  const now = new Date();
  const to = new Date(now);
  to.setMonth(to.getMonth() + 24);
  return { from: "2025-01-01", to: to.toISOString().slice(0, 10) };
}

async function syncBookings(supabase: SupabaseClient, mode: SyncMode): Promise<BookingSyncResult> {
  const { from: fromStr, to: toStr } = buildFullWindow();
  const window = `${fromStr} → ${toStr}`;

  // Build query params based on mode
  let queryParams: Record<string, string>;
  let modifiedFrom: string | undefined;

  if (mode === "incremental") {
    const lastSync = await getLastSyncAt(supabase);
    if (!lastSync) {
      // No previous sync — fall back to full
      console.log("[smoobu-sync] no previous sync found, falling back to full sync");
      queryParams = { from: fromStr, to: toStr };
    } else {
      // modifiedFrom = lastSync - 1 day (safety margin)
      const d = new Date(lastSync);
      d.setDate(d.getDate() - 1);
      modifiedFrom = d.toISOString().slice(0, 10);
      queryParams = { modifiedFrom };
      console.log(`[smoobu-sync] incremental sync: modifiedFrom=${modifiedFrom} (last sync: ${lastSync})`);
    }
  } else {
    queryParams = { from: fromStr, to: toStr };
  }

  console.log(`[smoobu-sync] syncBookings mode=${mode} window=${window}`);

  const { bookings, diag } = await getReservations(queryParams);
  console.log(`[smoobu-sync] received ${bookings.length} bookings from API (total_items=${diag.totalItems}, pages=${diag.pagesFetched}/${diag.pageCount})`);

  // Upsert in batches of 50
  const BATCH = 50;
  let synced = 0;
  let batchErrors = 0;

  for (let i = 0; i < bookings.length; i += BATCH) {
    const batch = bookings.slice(i, i + BATCH).map(bookingToRow);

    const { error } = await supabase
      .from("smoobu_bookings")
      .upsert(batch, { onConflict: "id", ignoreDuplicates: false });

    if (error) {
      batchErrors++;
      console.error(`[smoobu-sync] upsert batch ${Math.floor(i / BATCH) + 1} error:`, error.message);
      for (const row of batch) {
        const { error: rowErr } = await supabase
          .from("smoobu_bookings")
          .upsert(row, { onConflict: "id", ignoreDuplicates: false });
        if (rowErr) {
          console.error(`[smoobu-sync] row error id=${row.id}:`, rowErr.message);
        } else {
          synced++;
        }
      }
    } else {
      synced += batch.length;
    }
  }

  console.log(`[smoobu-sync] upsert done: ${synced} written, ${batchErrors} batch errors`);
  return { synced, batchErrors, fetchDiag: diag, bookingsFetched: bookings.length, window, modifiedFrom };
}

// ── Main sync ───────────────────────────────────────────────────

export async function syncSmoobu(mode: SyncMode = "incremental"): Promise<SyncResult> {
  const supabase = getServiceClient();
  const t0 = Date.now();
  const syncTimestamp = new Date().toISOString();

  try {
    const aptCount = await syncApartments(supabase);
    console.log(`[smoobu-sync] ${aptCount} apartments sincronizzati`);

    const bookResult = await syncBookings(supabase, mode);
    const elapsed = parseFloat(((Date.now() - t0) / 1000).toFixed(1));
    console.log(`[smoobu-sync] done in ${elapsed}s — ${bookResult.synced} prenotazioni sincronizzate (mode=${mode})`);

    // Save last sync timestamp only on success
    await saveLastSyncAt(supabase, syncTimestamp);

    return {
      ok: true,
      apartments: aptCount,
      bookings: bookResult.synced,
      diag: {
        mode,
        window: bookResult.window,
        modifiedFrom: bookResult.modifiedFrom,
        totalItems: bookResult.fetchDiag.totalItems,
        pageCount: bookResult.fetchDiag.pageCount,
        pagesFetched: bookResult.fetchDiag.pagesFetched,
        bookingsFetched: bookResult.bookingsFetched,
        bookingsWritten: bookResult.synced,
        batchErrors: bookResult.batchErrors,
        elapsedSec: elapsed,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[smoobu-sync] errore:", msg);
    return { ok: false, apartments: 0, bookings: 0, error: msg };
  }
}
