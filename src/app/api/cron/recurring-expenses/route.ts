import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { shouldGenerate } from "@/lib/recurring";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear = now.getFullYear();
  const monthStart = `${curYear}-${String(curMonth).padStart(2, "0")}-01`;

  const { data: recurrings, error: recErr } = await supabase
    .from("recurring_expenses")
    .select("*")
    .eq("active", true);

  if (recErr) {
    return NextResponse.json({ error: recErr.message }, { status: 500 });
  }

  let generated = 0;
  let skipped = 0;

  for (const r of recurrings ?? []) {
    if (!shouldGenerate(r.frequency, curMonth)) { skipped++; continue; }
    if (r.last_generated && r.last_generated >= monthStart) { skipped++; continue; }

    const day = Math.min(r.day_of_month, new Date(curYear, curMonth, 0).getDate());
    const expenseDate = `${curYear}-${String(curMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const { error } = await supabase.from("expenses").insert({
      amount: r.amount,
      expense_date: expenseDate,
      category_id: r.category_id,
      supplier_name: r.supplier_name,
      payment_method: r.payment_method,
      payment_status: "da_pagare",
      doc_type: "Fattura",
      notes: `Spesa ricorrente: ${r.name}`,
      created_by: r.created_by,
    });
    if (error) { skipped++; continue; }

    await supabase
      .from("recurring_expenses")
      .update({ last_generated: now.toISOString().slice(0, 10) })
      .eq("id", r.id);
    generated++;
  }

  return NextResponse.json({ ok: true, generated, skipped });
}
