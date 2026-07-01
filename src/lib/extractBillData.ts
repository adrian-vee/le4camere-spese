/**
 * Extract bill data from a PDF file using pdfjs-dist (client-side, no API).
 * Returns partial form fields — only what could be parsed from the text.
 */

import * as pdfjsLib from "pdfjs-dist";

// Use the local worker served from public/ (avoids CSP issues with external CDN)
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export interface ExtractedBillData {
  utility_type?: string;
  supplier?: string;
  period_start?: string; // ISO yyyy-mm-dd
  period_end?: string;
  consumption?: string;
  unit?: string;
  amount?: string;
}

/** Known Italian utility suppliers */
const KNOWN_SUPPLIERS: { pattern: RegExp; name: string }[] = [
  { pattern: /\benel\b/i, name: "Enel" },
  { pattern: /\ba2a\b/i, name: "A2A" },
  { pattern: /\bhera\b/i, name: "Hera" },
  { pattern: /\biren\b/i, name: "Iren" },
  { pattern: /\bacea\b/i, name: "Acea" },
  { pattern: /\bedison\b/i, name: "Edison" },
  { pattern: /\bsorgenia\b/i, name: "Sorgenia" },
  { pattern: /\beni\s*plenitude\b/i, name: "Eni Plenitude" },
  { pattern: /\bplenitude\b/i, name: "Eni Plenitude" },
  { pattern: /\billumia\b/i, name: "Illumia" },
  { pattern: /\bdolomiti\s*energia\b/i, name: "Dolomiti Energia" },
  { pattern: /\balperia\b/i, name: "Alperia" },
  { pattern: /\baxpo\b/i, name: "Axpo" },
  { pattern: /\be\.on\b/i, name: "E.ON" },
  { pattern: /\bwekiwi\b/i, name: "Wekiwi" },
  { pattern: /\bengie\b/i, name: "Engie" },
  { pattern: /\btim\b/i, name: "TIM" },
  { pattern: /\bfastweb\b/i, name: "Fastweb" },
  { pattern: /\bvodafone\b/i, name: "Vodafone" },
  { pattern: /\bwindtre\b|wind\s*tre/i, name: "WindTre" },
  { pattern: /\btiscali\b/i, name: "Tiscali" },
  { pattern: /\bskyitalia\b|\bsky\s*wifi\b/i, name: "Sky" },
  { pattern: /\bcontarina\b/i, name: "Contarina" },
  { pattern: /\bveritas\b/i, name: "Veritas" },
  { pattern: /\bacque\s*veronesi\b/i, name: "Acque Veronesi" },
  { pattern: /\bacque\s*del\s*chiampo\b/i, name: "Acque del Chiampo" },
  { pattern: /\bviveracqua\b/i, name: "Viveracqua" },
  { pattern: /\bagsm\b/i, name: "AGSM" },
];

/** Detect utility type from text content.
 *  Returns lowercase values matching DB constraint: 'luce','gas','acqua','immondizia','internet','telefono','altro'.
 *  Order matters: check luce/gas/acqua/immondizia FIRST (strong indicators),
 *  internet/telefono LAST (weak keywords appear in other bill types too). */
function detectType(text: string): { type: string; unit: string } | null {
  const lower = text.toLowerCase();

  // Electricity indicators (checked first — kWh / "energia elettrica" are unambiguous)
  if (/\bkwh\b/.test(lower) || /\b(energia elettrica|fornitura elettrica|luce)\b/.test(lower) || /\bpod\b/.test(lower)) {
    return { type: "luce", unit: "kWh" };
  }
  // Gas indicators
  if (/\bsmc\b/.test(lower) || /\b(gas\s*(naturale|metano)?|fornitura gas)\b/.test(lower) || /\bpdr\b/.test(lower)) {
    return { type: "gas", unit: "Smc" };
  }
  // Water indicators
  if (/\b(acqua|idrico|servizio idrico|fognatura|depurazione)\b/.test(lower) && /\bm[³3c]\b/.test(lower)) {
    return { type: "acqua", unit: "m\u00B3" };
  }
  if (/\b(servizio idrico|acquedotto|fornitura acqua)\b/.test(lower)) {
    return { type: "acqua", unit: "m\u00B3" };
  }
  // Waste
  if (/\b(rifiuti|tari|immondizia|raccolta differenziata|nettezza urbana)\b/.test(lower)) {
    return { type: "immondizia", unit: "kg" };
  }
  // Telecom (phone-specific)
  if (/\b(telefon|fonia|voip|chiamate)\b/.test(lower)
    && !/\bkwh\b/.test(lower) && !/\bsmc\b/.test(lower)) {
    return { type: "telefono", unit: "" };
  }
  // Internet — LAST, only if no other type matched
  if (/\b(fibra|adsl|banda larga|internet|modem|router)\b/.test(lower)
    && !/\bkwh\b/.test(lower) && !/\bsmc\b/.test(lower)) {
    return { type: "internet", unit: "" };
  }

  return null;
}

/** Parse Italian date dd/mm/yyyy or dd.mm.yyyy or dd-mm-yyyy → ISO */
function parseItalianDate(d: string): string | null {
  const m = d.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const month = m[2].padStart(2, "0");
  const year = m[3];
  if (parseInt(month) < 1 || parseInt(month) > 12) return null;
  if (parseInt(day) < 1 || parseInt(day) > 31) return null;
  return `${year}-${month}-${day}`;
}

/** Italian month names → two-digit number */
const MONTH_NAMES: Record<string, string> = {
  gennaio: "01", febbraio: "02", marzo: "03", aprile: "04",
  maggio: "05", giugno: "06", luglio: "07", agosto: "08",
  settembre: "09", ottobre: "10", novembre: "11", dicembre: "12",
};
const MONTH_ALT = Object.keys(MONTH_NAMES).join("|");

/** Parse "01 Novembre 2025" or "1 novembre 2025" → ISO yyyy-mm-dd */
function parseItalianTextDate(d: string): string | null {
  const pat = new RegExp(`(\\d{1,2})\\s+(${MONTH_ALT})\\s+(\\d{4})`, "i");
  const m = d.match(pat);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const mon = MONTH_NAMES[m[2].toLowerCase()];
  const year = m[3];
  if (!mon) return null;
  if (parseInt(day) < 1 || parseInt(day) > 31) return null;
  return `${year}-${mon}-${day}`;
}

/** Validate that start and end are different; if same, return empty */
function validatePeriod(start?: string, end?: string): { start?: string; end?: string } {
  if (start && end && start === end) return {};
  const res: { start?: string; end?: string } = {};
  if (start) res.start = start;
  if (end) res.end = end;
  return res;
}

/** Extract period dates.
 *  Priority: "PERIODO dal ... al ..." block (billing period).
 *  Avoid: "CONSUMO ANNUO dal ... al ..." (yearly consumption, not billing period). */
function extractPeriod(text: string): { start?: string; end?: string } {
  // --- 1. Look for "PERIODO" block with Italian text dates: "PERIODO dal 01 Novembre 2025 al 30 Novembre 2025"
  const periodoTextPat = new RegExp(
    `periodo\\s+dal\\s+(\\d{1,2}\\s+(?:${MONTH_ALT})\\s+\\d{4})\\s+al\\s+(\\d{1,2}\\s+(?:${MONTH_ALT})\\s+\\d{4})`,
    "i"
  );
  const ptm = text.match(periodoTextPat);
  if (ptm) {
    const s = parseItalianTextDate(ptm[1]);
    const e = parseItalianTextDate(ptm[2]);
    return validatePeriod(s ?? undefined, e ?? undefined);
  }

  // --- 2. "PERIODO" block with numeric dates: "PERIODO dal DD/MM/YYYY al DD/MM/YYYY"
  const periodoNumPat = /periodo\s+dal\s+(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})\s+al\s+(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})/i;
  const pnm = text.match(periodoNumPat);
  if (pnm) {
    const s = parseItalianDate(pnm[1]);
    const e = parseItalianDate(pnm[2]);
    return validatePeriod(s ?? undefined, e ?? undefined);
  }

  // --- 3. Generic "dal ... al ..." but EXCLUDE lines containing "consumo annuo"
  //    Split text into chunks and skip chunks that mention "consumo annuo"
  const genericPatText = new RegExp(
    `dal\\s+(\\d{1,2}\\s+(?:${MONTH_ALT})\\s+\\d{4})\\s+al\\s+(\\d{1,2}\\s+(?:${MONTH_ALT})\\s+\\d{4})`,
    "gi"
  );
  for (const m of text.matchAll(genericPatText)) {
    const surroundingStart = Math.max(0, (m.index ?? 0) - 40);
    const surrounding = text.slice(surroundingStart, (m.index ?? 0) + m[0].length).toLowerCase();
    if (/consumo\s*annuo/.test(surrounding)) continue;
    const s = parseItalianTextDate(m[1]);
    const e = parseItalianTextDate(m[2]);
    const res = validatePeriod(s ?? undefined, e ?? undefined);
    if (res.start || res.end) return res;
  }

  // --- 4. Generic "dal DD/MM/YYYY al DD/MM/YYYY" (exclude "consumo annuo" context)
  const genericPatNum = /dal\s+(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})\s*(?:al|a|-|–)\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})/gi;
  for (const m of text.matchAll(genericPatNum)) {
    const surroundingStart = Math.max(0, (m.index ?? 0) - 40);
    const surrounding = text.slice(surroundingStart, (m.index ?? 0) + m[0].length).toLowerCase();
    if (/consumo\s*annuo/.test(surrounding)) continue;
    const s = parseItalianDate(m[1]);
    const e = parseItalianDate(m[2]);
    const res = validatePeriod(s ?? undefined, e ?? undefined);
    if (res.start || res.end) return res;
  }

  // --- 5. Fallback: single month "MESE ANNO" → first/last day of that month
  const monthYearPat = new RegExp(`(${MONTH_ALT})\\s+(\\d{4})`, "gi");
  const monthMatches = [...text.matchAll(monthYearPat)];
  if (monthMatches.length >= 1) {
    const last = monthMatches[monthMatches.length - 1];
    const mon = MONTH_NAMES[last[1].toLowerCase()];
    const yr = last[2];
    if (mon && yr) {
      const start = `${yr}-${mon}-01`;
      const lastDay = new Date(parseInt(yr), parseInt(mon), 0).getDate();
      const end = `${yr}-${mon}-${String(lastDay).padStart(2, "0")}`;
      return validatePeriod(start, end);
    }
  }

  return {};
}

/** Normalize Italian amount "1.308,00" → 1308.00 */
function normalizeAmount(raw: string): number | null {
  const val = raw.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(val);
  if (isNaN(num) || num <= 0 || num >= 100000) return null;
  return num;
}

/** Extract monetary amount.
 *  Priority: "Totale da pagare" > "Importo da pagare" > "Importo totale" > generic.
 *  Specifically avoids "Totale bolletta" (which may differ from the payment amount). */
function extractAmount(text: string): string | null {
  // High-priority: "Totale da pagare" (the actual amount due)
  const highPriority = [
    /totale\s+da\s+pagare[:\s]*(?:€|EUR)?\s*([\d.,]+)/i,
    /([\d.,]+)\s*€?\s*totale\s+da\s+pagare/i,
    /importo\s+da\s+pagare[:\s]*(?:€|EUR)?\s*([\d.,]+)/i,
    /importo\s+dovuto[:\s]*(?:€|EUR)?\s*([\d.,]+)/i,
  ];
  for (const pat of highPriority) {
    const m = text.match(pat);
    if (m) {
      const num = normalizeAmount(m[1]);
      if (num !== null) return num.toFixed(2);
    }
  }

  // Medium-priority: "Importo totale" (but not "Totale bolletta")
  const medPriority = [
    /importo\s+totale[:\s]*(?:€|EUR)?\s*([\d.,]+)/i,
    /totale\s+(?:dovuto|fattura)[:\s]*(?:€|EUR)?\s*([\d.,]+)/i,
  ];
  for (const pat of medPriority) {
    const m = text.match(pat);
    if (m) {
      const num = normalizeAmount(m[1]);
      if (num !== null) return num.toFixed(2);
    }
  }

  // Low-priority fallback: first € amount found
  const fallback = /(?:€|EUR)\s*([\d]+[.,]\d{2})\b/i;
  const fm = text.match(fallback);
  if (fm) {
    const num = normalizeAmount(fm[1]);
    if (num !== null) return num.toFixed(2);
  }

  return null;
}

/** Extract consumption value.
 *  Handles Italian number format: "4.092 kWh" (dot = thousands separator). */
function extractConsumption(text: string): { value: string; unit: string } | null {
  const patterns = [
    /consumi?[:\s]*([\d.]+[,]?\d*)\s*(kwh|smc|m[³3c]|mc)/i,
    /([\d.]+[,]?\d*)\s*(kwh|smc|m[³3c])\b/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      // "4.092" → 4092 (Italian thousands), "123,5" → 123.5 (Italian decimal)
      const val = m[1].replace(/\./g, "").replace(",", ".");
      const num = parseFloat(val);
      let unit = m[2];
      if (/kwh/i.test(unit)) unit = "kWh";
      else if (/smc/i.test(unit)) unit = "Smc";
      else unit = "m\u00B3";
      if (!isNaN(num) && num > 0) {
        return { value: num.toString(), unit };
      }
    }
  }
  return null;
}

/** Main extraction function */
export async function extractBillFromPdf(file: File): Promise<ExtractedBillData> {
  const result: ExtractedBillData = {};

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    // Extract text from all pages (max 5 to keep it fast)
    const pageCount = Math.min(pdf.numPages, 5);
    const textParts: string[] = [];

    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      textParts.push(pageText);
    }

    const fullText = textParts.join("\n");

    if (fullText.trim().length < 20) {
      // PDF is likely a scanned image — no text to extract
      return result;
    }

    // Supplier
    for (const s of KNOWN_SUPPLIERS) {
      if (s.pattern.test(fullText)) {
        result.supplier = s.name;
        break;
      }
    }

    // Type
    const typeInfo = detectType(fullText);
    if (typeInfo) {
      result.utility_type = typeInfo.type;
      result.unit = typeInfo.unit;
    }

    // Period
    const period = extractPeriod(fullText);
    if (period.start) result.period_start = period.start;
    if (period.end) result.period_end = period.end;

    // Amount
    const amount = extractAmount(fullText);
    if (amount) result.amount = amount;

    // Consumption
    const consumption = extractConsumption(fullText);
    if (consumption) {
      result.consumption = consumption.value;
      if (!result.unit) result.unit = consumption.unit;
    }
  } catch {
    // PDF parsing failed — return empty, user fills manually
  }

  return result;
}
