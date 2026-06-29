/**
 * Smoobu → Supabase sync logic.
 * Chiamato dal cron e dalla route admin.
 * Usa service-role client (bypassa RLS).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getApartments, getReservations, type SmoobuBooking, type ReservationDiag } from "./smoobu";

function getServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
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
    // Try auto-map: match apartment name starting number with room number
    // e.g. "1 Matrimoniale" → room.number = 1; "Suite 1" → room.name containing "Suite 1"
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

    // Upsert: update name, keep existing room_id if already mapped
    const { error } = await supabase
      .from("smoobu_apartments")
      .upsert(
        {
          id: apt.id,
          name: apt.name,
          ...(roomId ? { room_id: roomId } : {}),
        },
        {
          onConflict: "id",
          ignoreDuplicates: false,
        },
      );

    if (error) {
      // If upsert fails because room_id would be overwritten, try without it
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
};

async function syncBookings(supabase: SupabaseClient): Promise<BookingSyncResult> {
  const now = new Date();
  const fromStr = "2025-06-01";
  const to = new Date(now);
  to.setMonth(to.getMonth() + 24);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const toStr = fmt(to);
  const window = `${fromStr} → ${toStr}`;
  console.log(`[smoobu-sync] syncBookings window: ${window}`);

  const { bookings, diag } = await getReservations({ arrivalFrom: fromStr, arrivalTo: toStr });
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
      console.error(`[smoobu-sync] upsert batch ${Math.floor(i / BATCH) + 1} error (rows ${i}-${i + batch.length - 1}):`, error.message);
      // Try individual rows to identify the problem record
      for (const row of batch) {
        const { error: rowErr } = await supabase
          .from("smoobu_bookings")
          .upsert(row, { onConflict: "id", ignoreDuplicates: false });
        if (rowErr) {
          console.error(`[smoobu-sync] row error id=${row.id} apt=${row.apartment_id}:`, rowErr.message);
        } else {
          synced++;
        }
      }
    } else {
      synced += batch.length;
    }
  }

  console.log(`[smoobu-sync] upsert done: ${synced} written, ${batchErrors} batch errors`);
  return { synced, batchErrors, fetchDiag: diag, bookingsFetched: bookings.length, window };
}

// ── Main sync ───────────────────────────────────────────────────

export type SyncDiag = {
  window: string;
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

export async function syncSmoobu(): Promise<SyncResult> {
  const supabase = getServiceClient();
  const t0 = Date.now();

  try {
    const aptCount = await syncApartments(supabase);
    console.log(`[smoobu-sync] ${aptCount} apartments sincronizzati`);

    const bookResult = await syncBookings(supabase);
    const elapsed = parseFloat(((Date.now() - t0) / 1000).toFixed(1));
    console.log(`[smoobu-sync] done in ${elapsed}s — ${bookResult.synced} prenotazioni sincronizzate`);

    return {
      ok: true,
      apartments: aptCount,
      bookings: bookResult.synced,
      diag: {
        window: bookResult.window,
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
