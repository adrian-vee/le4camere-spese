import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { syncSmoobu } from "@/lib/smoobu-sync";

export const dynamic = "force-dynamic";

/**
 * GET  — chiamato dal cron Vercel (auth via CRON_SECRET)
 * POST — chiamato da admin autenticato
 */

export async function GET(req: Request) {
  // Cron auth: Bearer CRON_SECRET
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const result = await syncSmoobu();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function POST() {
  // Admin auth: user must be admin
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

  const result = await syncSmoobu();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
