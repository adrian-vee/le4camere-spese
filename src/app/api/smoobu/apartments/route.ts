import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

const SMOOBU_BASE = "https://login.smoobu.com";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const apiKey = process.env.SMOOBU_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "SMOOBU_API_KEY non configurata" }, { status: 503 });

  try {
    const resp = await fetch(`${SMOOBU_BASE}/api/apartments`, {
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

    // Fetch our rooms with smoobu mapping
    const { data: rooms } = await supabase
      .from("rooms")
      .select("id, number, type, floor, smoobu_apartment_id")
      .eq("active", true)
      .order("number");

    return NextResponse.json({
      apartments: data.apartments ?? data,
      rooms: rooms ?? [],
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Errore" }, { status: 500 });
  }
}
