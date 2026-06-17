import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getRecipeById } from "@/lib/barRecipes";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { recipeId, quantity = 1, reverse = false } = await req.json();
  const recipe = getRecipeById(recipeId);
  if (!recipe) return NextResponse.json({ error: "Ricetta non trovata" }, { status: 400 });

  const moveType = reverse ? "in" as const : "out" as const;
  const label = reverse ? "Storno" : "Vendita";
  const qtyLabel = quantity > 1 ? ` x${quantity}` : "";
  const warnings: string[] = [];
  const deducted: string[] = [];

  const nonOptional = recipe.ingredients.filter(i => !i.optional && i.amountMl > 0);

  for (const ing of nonOptional) {
    const { data: products } = await supabase
      .from("stock_levels")
      .select("product_id, name, current_stock, tracking_type, bottle_capacity_ml, unit")
      .eq("active", true)
      .ilike("name", `%${ing.productName}%`)
      .limit(3);

    const product = (products ?? [])[0] as {
      product_id: string; name: string; current_stock: number;
      tracking_type: string | null; bottle_capacity_ml: number | null; unit: string;
    } | undefined;

    if (!product) {
      warnings.push(`${ing.productName} — prodotto non trovato in magazzino`);
      continue;
    }

    const totalMl = ing.amountMl * quantity;

    if (product.tracking_type === "bottle" && product.bottle_capacity_ml) {
      const { data: batches } = await supabase
        .from("product_batches")
        .select("id, is_open, quantity_remaining, fill_level")
        .eq("product_id", product.product_id)
        .eq("is_open", true)
        .order("created_at", { ascending: true })
        .limit(1);

      const batch = (batches ?? [])[0] as {
        id: string; is_open: boolean; quantity_remaining: number; fill_level: number;
      } | undefined;

      if (!batch && !reverse) {
        warnings.push(`${product.name} — nessuna bottiglia aperta`);
        continue;
      }

      if (batch) {
        const newRemaining = reverse
          ? batch.quantity_remaining + totalMl
          : Math.max(0, batch.quantity_remaining - totalMl);
        const newFill = product.bottle_capacity_ml > 0
          ? Math.round((newRemaining / product.bottle_capacity_ml) * 10)
          : 0;

        await supabase.from("product_batches").update({
          quantity_remaining: newRemaining,
          fill_level: Math.max(0, Math.min(10, newFill)),
        }).eq("id", batch.id);

        if (!reverse && newRemaining <= 0) {
          warnings.push(`${product.name} — bottiglia terminata, aprire una nuova`);
        }
      }

      await supabase.from("stock_movements").insert({
        product_id: product.product_id,
        type: moveType,
        quantity: totalMl,
        notes: `${label} ${recipe.name}${qtyLabel}`,
        created_by: user.id,
      });

      deducted.push(`${product.name}: ${reverse ? "+" : "-"}${totalMl}ml`);
    } else {
      const qtyToDeduct = 1 * quantity;

      await supabase.from("stock_movements").insert({
        product_id: product.product_id,
        type: moveType,
        quantity: qtyToDeduct,
        notes: `${label} ${recipe.name}${qtyLabel}`,
        created_by: user.id,
      });

      deducted.push(`${product.name}: ${reverse ? "+" : "-"}${qtyToDeduct} ${product.unit}`);
    }
  }

  return NextResponse.json({ ok: true, deducted, warnings, recipeName: recipe.name });
}
