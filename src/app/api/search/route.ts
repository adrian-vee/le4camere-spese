import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ products: [], suppliers: [], staff: [], expenses: [] });
  }

  const supabase = await createClient();
  const term = `%${q}%`;

  const [productsRes, suppliersRes, staffRes, expensesRes] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, category, unit")
      .ilike("name", term)
      .eq("active", true)
      .limit(4),
    supabase
      .from("suppliers")
      .select("id, name, category")
      .ilike("name", term)
      .limit(4),
    supabase
      .from("profiles")
      .select("id, full_name, role")
      .ilike("full_name", term)
      .limit(4),
    supabase
      .from("expenses")
      .select("id, description, vendor, amount, date")
      .or(`description.ilike.${term},vendor.ilike.${term}`)
      .order("date", { ascending: false })
      .limit(4),
  ]);

  return NextResponse.json({
    products: productsRes.data ?? [],
    suppliers: suppliersRes.data ?? [],
    staff: staffRes.data ?? [],
    expenses: expensesRes.data ?? [],
  });
}
