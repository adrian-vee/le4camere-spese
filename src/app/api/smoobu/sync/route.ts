import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { syncSmoobu, type SyncMode } from "@/lib/smoobu-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Hobby max

/**
 * GET  — chiamato dal cron Vercel (auth via CRON_SECRET) → incremental
 * POST — chiamato da admin autenticato → mode from body (default incremental)
 */

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const result = await syncSmoobu("incremental");
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function POST(req: Request) {
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

  let mode: SyncMode = "incremental";
  try {
    const body = await req.json();
    if (body?.mode === "full") mode = "full";
  } catch {
    // no body or invalid JSON — use default
  }

  const result = await syncSmoobu(mode);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
