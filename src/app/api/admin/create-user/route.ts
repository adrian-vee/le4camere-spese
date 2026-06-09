import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  // Verify the caller is an authenticated admin
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Solo admin" }, { status: 403 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY non configurata" }, { status: 503 });

  const { email, password, full_name, role } = await request.json();
  if (!email || !password || !full_name) {
    return NextResponse.json({ error: "email, password e full_name sono obbligatori" }, { status: 400 });
  }
  if (!["admin", "manager", "staff"].includes(role ?? "staff")) {
    return NextResponse.json({ error: "Ruolo non valido" }, { status: 400 });
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
  );

  // Create user without sending confirmation email, already confirmed
  const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });

  if (createErr) {
    return NextResponse.json({ error: createErr.message }, { status: 400 });
  }

  // Upsert profile with role and name
  if (newUser.user) {
    await admin.from("profiles").upsert({
      id: newUser.user.id,
      full_name,
      role: role ?? "staff",
    });
  }

  return NextResponse.json({ id: newUser.user?.id, email });
}
