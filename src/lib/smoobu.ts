/**
 * Smoobu API client — server-only.
 *
 * Tutta l'autenticazione è centralizzata in `smoobuHeaders()`.
 * Quando Smoobu migrerà da legacy API-Key a HMAC (25/09/2026),
 * modificare SOLO quella funzione.
 */

const SMOOBU_BASE = "https://login.smoobu.com";

// ── Auth (single point) ─────────────────────────────────────────

function smoobuHeaders(): Record<string, string> {
  const key = process.env.SMOOBU_API_KEY;
  if (!key) throw new Error("SMOOBU_API_KEY non configurata");
  return {
    "Api-Key": key,
    "Cache-Control": "no-cache",
  };
}

// ── Helpers ─────────────────────────────────────────────────────

async function smoobuFetch(path: string, params?: URLSearchParams): Promise<Response> {
  const url = params ? `${SMOOBU_BASE}${path}?${params}` : `${SMOOBU_BASE}${path}`;
  const res = await fetch(url, { headers: smoobuHeaders() });

  // 429 rate-limit: retry once after a short backoff
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After")) || 2;
    console.warn(`[smoobu] 429 rate-limit, retry after ${retryAfter}s`);
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    return fetch(url, { headers: smoobuHeaders() });
  }

  return res;
}

// ── Types ───────────────────────────────────────────────────────

export type SmoobuApartment = {
  id: number;
  name: string;
};

export type SmoobuBooking = {
  id: number;
  type: string; // 'reservation' | 'modification of booking' | 'cancellation'
  arrival: string;
  departure: string;
  "created-at": string;
  "modified-at": string;
  apartment: { id: number; name: string };
  channel: { id: number; name: string } | null;
  "guest-name": string;
  adults: number;
  children: number;
  price: number;
  "price-paid"?: boolean;
  prepayment: number;
  deposit: number;
  "is-blocked-booking": boolean;
};

// ── getApartments ───────────────────────────────────────────────

export async function getApartments(): Promise<SmoobuApartment[]> {
  const res = await smoobuFetch("/api/apartments");
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Smoobu /apartments ${res.status}: ${text}`);
  }
  const data = await res.json();
  return (data.apartments ?? []) as SmoobuApartment[];
}

// ── getReservations (paginated) ─────────────────────────────────

export type ReservationParams = {
  arrivalFrom: string; // yyyy-mm-dd
  arrivalTo: string;   // yyyy-mm-dd
};

export async function getReservations(opts: ReservationParams): Promise<SmoobuBooking[]> {
  const all: SmoobuBooking[] = [];
  let page = 1;

  console.log(`[smoobu] getReservations arrivalFrom=${opts.arrivalFrom} arrivalTo=${opts.arrivalTo}`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const params = new URLSearchParams({
      arrivalFrom: opts.arrivalFrom,
      arrivalTo: opts.arrivalTo,
      page: String(page),
      pageSize: "100",
      excludeBlocked: "false",
      showCancellation: "true",
    });

    const res = await smoobuFetch("/api/reservations", params);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Smoobu /reservations page ${page} ${res.status}: ${text}`);
    }

    const data = await res.json();
    const bookings = (data.bookings ?? []) as SmoobuBooking[];
    const pageCount = data.page_count ?? 1;
    const totalItems = data.total_items ?? "?";

    console.log(`[smoobu] page ${page}/${pageCount} — ${bookings.length} bookings (total_items=${totalItems}, accumulated=${all.length + bookings.length})`);

    all.push(...bookings);

    if (page >= pageCount) break;
    page++;
  }

  console.log(`[smoobu] getReservations done — ${all.length} total bookings fetched`);
  return all;
}
