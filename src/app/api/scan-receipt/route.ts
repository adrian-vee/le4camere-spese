import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

const PROMPT = `Sei un assistente che estrae dati da scontrini, fatture e bolle italiane.
Analizza l'immagine e restituisci ESCLUSIVAMENTE un oggetto JSON valido, senza testo prima o dopo, con questi campi:
{
  "amount": numero (totale pagato, usa il punto come separatore decimale, es. 42.50),
  "date": "YYYY-MM-DD" (data del documento; se assente usa null),
  "supplier": "nome dell'esercente/fornitore" (o null),
  "doc_type": uno tra "Scontrino", "Fattura", "Bolla/DDT", "Ricevuta", "Altro",
  "category": una breve parola chiave di categoria spesa (es. "alimentari", "utenze", "manutenzione", "pulizie", "forniture") o null
}
Se un dato non è leggibile, usa null. Non inventare valori.`;

export async function POST(request: Request) {
  // Solo utenti autenticati
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OCR non configurato (manca ANTHROPIC_API_KEY)" }, { status: 503 });

  try {
    const { image } = await request.json();
    if (!image || typeof image !== "string") {
      return NextResponse.json({ error: "Immagine mancante" }, { status: 400 });
    }
    // Rimuove il prefisso data URL: "data:image/jpeg;base64,...."
    const base64 = image.includes(",") ? image.split(",")[1] : image;
    const mediaMatch = image.match(/^data:(image\/[a-zA-Z]+);base64,/);
    const mediaType = mediaMatch ? mediaMatch[1] : "image/jpeg";

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      return NextResponse.json({ error: "Errore API Claude", detail: t }, { status: 502 });
    }

    const data = await resp.json();
    const text: string = (data.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("")
      .trim();

    // Estrae il blocco JSON anche se il modello aggiunge testo
    const jsonStr = text.replace(/```json|```/g, "").trim();
    const start = jsonStr.indexOf("{");
    const end = jsonStr.lastIndexOf("}");
    const parsed = start >= 0 && end >= 0 ? JSON.parse(jsonStr.slice(start, end + 1)) : {};

    return NextResponse.json(parsed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore OCR";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
