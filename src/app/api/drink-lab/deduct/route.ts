import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getRecipeById } from "@/lib/barRecipes";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { recipeId, quantity: rawQty, orderId, reverse = false } = await req.json();
  const quantity = Math.max(1, Math.round(rawQty ?? 1));
  const recipe = getRecipeById(recipeId);
  if (!recipe) return NextResponse.json({ error: "Ricetta non trovata" }, { status: 400 });

  const moveType = reverse ? "in" as const : "out" as const;
  const label = reverse ? "Storno" : "Vendita";
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
    const orderRef = orderId ? ` #${String(orderId).slice(0, 8)}` : "";
    const noteText = `${label} bar${orderRef} — ${recipe.name}${quantity > 1 ? ` x${quantity}` : ""}`;

    if (product.tracking_type === "bottle" && product.bottle_capacity_ml) {
      const cap = product.bottle_capacity_ml;

      if (reverse) {
        const { data: batches } = await supabase
          .from("product_batches")
          .select("id, fill_level")
          .eq("product_id", product.product_id)
          .eq("is_open", true)
          .order("created_at", { ascending: false })
          .limit(1);

        const batch = (batches ?? [])[0] as {
          id: string; fill_level: number;
        } | undefined;

        if (batch) {
          const currentMl = (batch.fill_level / 10) * cap;
          const newMl = Math.min(cap, currentMl + totalMl);
          const newFill = Math.round((newMl / cap) * 100) / 10;

          await supabase.from("product_batches").update({
            fill_level: Math.min(10, newFill),
          }).eq("id", batch.id);
        }
      } else {
        let remaining = totalMl;

        while (remaining > 0) {
          const { data: batches } = await supabase
            .from("product_batches")
            .select("id, fill_level")
            .eq("product_id", product.product_id)
            .eq("is_open", true)
            .gt("fill_level", 0)
            .order("created_at", { ascending: true })
            .limit(1);

          const batch = (batches ?? [])[0] as {
            id: string; fill_level: number;
          } | undefined;

          if (!batch) {
            warnings.push(`Nessuna bottiglia aperta per ${product.name}`);
            break;
          }

          const batchMl = (batch.fill_level / 10) * cap;
          const deductMl = Math.min(remaining, batchMl);
          const newMl = Math.max(0, batchMl - deductMl);
          const newFill = Math.round((newMl / cap) * 100) / 10;

          const updates: Record<string, unknown> = {
            fill_level: Math.max(0, newFill),
          };

          if (newFill <= 0) {
            updates.is_open = false;
            updates.quantity_remaining = 0;
          }

          await supabase.from("product_batches").update(updates).eq("id", batch.id);

          remaining -= deductMl;

          if (newFill <= 0) {
            warnings.push(`${product.name} — bottiglia terminata, aprire una nuova`);
          }
        }
      }

      const bottleFraction = Math.round((totalMl / cap) * 1000) / 1000;

      await supabase.from("stock_movements").insert({
        product_id: product.product_id,
        type: moveType,
        quantity: bottleFraction,
        notes: noteText,
        created_by: user.id,
      });

      deducted.push(`${product.name}: ${reverse ? "+" : "-"}${bottleFraction} bt (${totalMl}ml)`);
    } else {
      const qtyToDeduct = product.bottle_capacity_ml
        ? Math.ceil(totalMl / product.bottle_capacity_ml)
        : quantity;

      if (!reverse && product.current_stock < qtyToDeduct) {
        warnings.push(`${product.name} — scorta insufficiente (rimanenza: ${product.current_stock} ${product.unit})`);
      }

      await supabase.from("stock_movements").insert({
        product_id: product.product_id,
        type: moveType,
        quantity: qtyToDeduct,
        notes: noteText,
        created_by: user.id,
      });

      deducted.push(`${product.name}: ${reverse ? "+" : "-"}${qtyToDeduct} ${product.unit}`);
    }
  }

  return NextResponse.json({ ok: true, deducted, warnings, recipeName: recipe.name });
}
