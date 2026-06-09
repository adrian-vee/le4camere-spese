import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logActivity } from "@/lib/activityLog";

export async function POST(request: Request) {
  const supabase = await createClient();

  // Log before signing out
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
    logActivity(supabase, {
      userId: user.id,
      userName: profile?.full_name || user.email || "Utente",
      action: "logout",
      module: "auth",
      description: "Logout effettuato",
    });
  }

  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
