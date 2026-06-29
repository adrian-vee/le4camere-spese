import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { probeReservations } from "@/lib/smoobu";

export const dynamic = "force-dynamic";

/**
 * GET /api/smoobu/probe — admin-only diagnostic endpoint.
 * Tests multiple query strategies against Smoobu API and returns total_items for each.
 * TEMPORARY — remove after diagnosis.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  }

  const strategies: { name: string; params: Record<string, string> }[] = [
    {
      name: "A: arrivalFrom/arrivalTo (current)",
      params: { arrivalFrom: "2025-06-01", arrivalTo: "2028-06-29", excludeBlocked: "false", showCancellation: "true" },
    },
    {
      name: "B: from/to (broad date range)",
      params: { from: "2025-06-01", to: "2028-06-29", excludeBlocked: "false", showCancellation: "true" },
    },
    {
      name: "C: created_from/created_to",
      params: { created_from: "2025-01-01", created_to: "2026-12-31", excludeBlocked: "false", showCancellation: "true" },
    },
    {
      name: "D: no date filters at all",
      params: { excludeBlocked: "false", showCancellation: "true" },
    },
    {
      name: "E: from/to wide + showCancellation",
      params: { from: "2020-01-01", to: "2030-12-31", excludeBlocked: "false", showCancellation: "true" },
    },
    {
      name: "F: arrivalFrom very wide",
      params: { arrivalFrom: "2020-01-01", arrivalTo: "2030-12-31", excludeBlocked: "false", showCancellation: "true" },
    },
    {
      name: "G: modifiedFrom (recent changes)",
      params: { modifiedFrom: "2025-01-01", modifiedTo: "2026-12-31", excludeBlocked: "false", showCancellation: "true" },
    },
    {
      name: "H: departureFrom/departureTo",
      params: { departureFrom: "2025-06-01", departureTo: "2028-12-31", excludeBlocked: "false", showCancellation: "true" },
    },
  ];

  const results = [];

  for (const s of strategies) {
    const result = await probeReservations(s.params);
    results.push({ strategy: s.name, ...result });
    // delay between calls to avoid rate limit
    await new Promise(r => setTimeout(r, 500));
  }

  return NextResponse.json({ results }, { status: 200 });
}
