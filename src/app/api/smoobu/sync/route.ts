import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

const SMOOBU_BASE = "https://login.smoobu.com";

type SmoobuReservation = {
  id: number;
  arrival: string;
  departure: string;
  apartment: { id: number; name: string };
  channel: { id: number; name: string } | null;
  "guest-name": string;
  "check-in": string | null;
  "check-out": string | null;
  "is-blocked-booking": boolean;
  adults: number;
  children: number;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const apiKey = process.env.SMOOBU_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "SMOOBU_API_KEY non configurata" }, { status: 503 });

  try {
    // Parse optional date from request body, default to today
    let targetDate: string;
    try {
      const body = await request.json();
      targetDate = body.date || new Date().toISOString().slice(0, 10);
    } catch {
      targetDate = new Date().toISOString().slice(0, 10);
    }

    // Get rooms with smoobu mapping
    const { data: rooms } = await supabase
      .from("rooms")
      .select("id, number, name, type, floor, smoobu_apartment_id")
      .eq("active", true);

    const mappedRooms = (rooms ?? []).filter((r) => r.smoobu_apartment_id != null);
    if (mappedRooms.length === 0) {
      return NextResponse.json({
        error: "Nessuna camera mappata a Smoobu. Configura le mappature prima.",
        synced: 0,
      }, { status: 400 });
    }

    // Fetch reservations that overlap with target date
    // Use from/to to get all bookings active on that date
    const params = new URLSearchParams({
      from: targetDate,
      to: targetDate,
      pageSize: "100",
      excludeBlocked: "true",
    });

    const resp = await fetch(`${SMOOBU_BASE}/api/reservations?${params}`, {
      headers: {
        "Api-Key": apiKey,
        "Cache-Control": "no-cache",
      },
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({ error: "Errore Smoobu API", detail: text }, { status: resp.status });
    }

    const data = await resp.json();
    const reservations = (data.bookings ?? data.data ?? []) as SmoobuReservation[];

    // Build a map: smoobu_apartment_id -> reservation info
    const apartmentMap = new Map<number, SmoobuReservation>();
    for (const res of reservations) {
      if (res["is-blocked-booking"]) continue;
      const aptId = res.apartment?.id;
      if (aptId) apartmentMap.set(aptId, res);
    }

    // Get existing tasks for the target date
    const { data: existingTasks } = await supabase
      .from("housekeeping_tasks")
      .select("id, room_id")
      .eq("task_date", targetDate);

    const taskByRoom = new Map((existingTasks ?? []).map((t) => [t.room_id, t.id]));

    let synced = 0;
    const results: { room: number | string; status: string; guest: string | null }[] = [];

    for (const room of mappedRooms) {
      const res = apartmentMap.get(room.smoobu_apartment_id!);

      let occupancyStatus: "checkout" | "stayover" | "vacant";
      let guestName: string | null = null;
      let channel: string | null = null;
      let checkInDate: string | null = null;
      let checkOutDate: string | null = null;
      let nights: number | null = null;

      if (res) {
        const arrival = res.arrival.slice(0, 10);
        const departure = res.departure.slice(0, 10);
        guestName = res["guest-name"] || null;
        channel = res.channel?.name || null;
        checkInDate = arrival;
        checkOutDate = departure;

        const arrDate = new Date(arrival);
        const depDate = new Date(departure);
        nights = Math.round((depDate.getTime() - arrDate.getTime()) / 86400000);

        if (departure === targetDate) {
          occupancyStatus = "checkout";
        } else {
          occupancyStatus = "stayover";
        }
      } else {
        occupancyStatus = "vacant";
      }

      // Determine appropriate checklist based on occupancy
      const checklist = occupancyStatus === "checkout"
        ? [
            { id: "letto", label: "Letto", checked: false },
            { id: "bagno", label: "Bagno", checked: false },
            { id: "polvere", label: "Polvere", checked: false },
            { id: "pavimento", label: "Pavimento", checked: false },
            { id: "minibar", label: "Minibar", checked: false },
            { id: "asciugamani", label: "Asciugamani", checked: false },
            { id: "cestini", label: "Cestini", checked: false },
          ]
        : occupancyStatus === "stayover"
        ? [
            { id: "riassetto", label: "Riassetto", checked: false },
            { id: "bagno", label: "Bagno", checked: false },
            { id: "asciugamani", label: "Asciugamani", checked: false },
            { id: "cestini", label: "Cestini", checked: false },
          ]
        : []; // vacant rooms: no tasks

      const existingTaskId = taskByRoom.get(room.id);

      const payload = {
        guest_name: guestName,
        channel,
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        nights,
        occupancy_status: occupancyStatus,
      };

      if (existingTaskId) {
        // Update existing task with Smoobu data (don't overwrite status/checklist if already in progress)
        await supabase
          .from("housekeeping_tasks")
          .update(payload)
          .eq("id", existingTaskId);
      } else {
        // Create new task
        await supabase
          .from("housekeeping_tasks")
          .insert({
            room_id: room.id,
            task_date: targetDate,
            status: occupancyStatus === "vacant" ? "pulita" : "da_pulire",
            checklist,
            ...payload,
          });
      }

      synced++;
      results.push({ room: room.name || room.number, status: occupancyStatus, guest: guestName });
    }

    return NextResponse.json({
      synced,
      results,
      date: targetDate,
      debug: {
        totalReservations: reservations.length,
        mappedRooms: mappedRooms.length,
        apartmentIds: mappedRooms.map((r) => r.smoobu_apartment_id),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Errore sync" }, { status: 500 });
  }
}
