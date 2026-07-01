/**
 * Extract bill data from a PDF file using pdfjs-dist (client-side, no API).
 * Returns partial form fields — only what could be parsed from the text.
 */

import * as pdfjsLib from "pdfjs-dist";

// Use the bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

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

/** Detect utility type from text content */
function detectType(text: string): { type: string; unit: string } | null {
  const lower = text.toLowerCase();

  // Internet/telecom indicators
  if (/\b(fibra|adsl|banda larga|internet|modem|router|connettivit[àa])\b/.test(lower)) {
    return { type: "Internet", unit: "" };
  }
  // Electricity indicators
  if (/\bkwh\b/.test(lower) || /\b(energia elettrica|fornitura elettrica|luce)\b/.test(lower) || /\bpod\b/.test(lower)) {
    return { type: "Luce", unit: "kWh" };
  }
  // Gas indicators
  if (/\bsmc\b/.test(lower) || /\b(gas\s*(naturale|metano)?|fornitura gas)\b/.test(lower) || /\bpdr\b/.test(lower)) {
    return { type: "Gas", unit: "Smc" };
  }
  // Water indicators
  if (/\b(acqua|idrico|servizio idrico|fognatura|depurazione)\b/.test(lower) && /\bm[³3c]\b/.test(lower)) {
    return { type: "Acqua", unit: "m\u00B3" };
  }
  if (/\b(servizio idrico|acquedotto|fornitura acqua)\b/.test(lower)) {
    return { type: "Acqua", unit: "m\u00B3" };
  }
  // Waste
  if (/\b(rifiuti|tari|immondizia|raccolta differenziata|nettezza urbana)\b/.test(lower)) {
    return { type: "Immondizia", unit: "kg" };
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

/** Extract period dates */
function extractPeriod(text: string): { start?: string; end?: string } {
  const result: { start?: string; end?: string } = {};

  // Pattern: "dal DD/MM/YYYY al DD/MM/YYYY" or "periodo DD/MM/YYYY - DD/MM/YYYY"
  const periodPatterns = [
    /dal\s+(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})\s*(?:al|a|-|–)\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})/i,
    /periodo[:\s]+(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})\s*(?:al|a|-|–)\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})/i,
    /(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})\s*(?:al|a|-|–)\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})/i,
  ];

  for (const pat of periodPatterns) {
    const m = text.match(pat);
    if (m) {
      const s = parseItalianDate(m[1]);
      const e = parseItalianDate(m[2]);
      if (s) result.start = s;
      if (e) result.end = e;
      if (result.start || result.end) return result;
    }
  }

  // Pattern: month-based "MESE ANNO" like "Gennaio 2025" or "01/2025"
  const monthNames: Record<string, string> = {
    gennaio: "01", febbraio: "02", marzo: "03", aprile: "04",
    maggio: "05", giugno: "06", luglio: "07", agosto: "08",
    settembre: "09", ottobre: "10", novembre: "11", dicembre: "12",
  };

  const monthYearPat = new RegExp(
    `(${Object.keys(monthNames).join("|")})\\s+(\\d{4})`,
    "gi"
  );
  const monthMatches = [...text.matchAll(monthYearPat)];
  if (monthMatches.length >= 1) {
    const last = monthMatches[monthMatches.length - 1];
    const mon = monthNames[last[1].toLowerCase()];
    const yr = last[2];
    if (mon && yr) {
      result.start = `${yr}-${mon}-01`;
      // Last day of month
      const lastDay = new Date(parseInt(yr), parseInt(mon), 0).getDate();
      result.end = `${yr}-${mon}-${String(lastDay).padStart(2, "0")}`;
    }
  }

  return result;
}

/** Extract monetary amount — look for "totale" or "importo" near a number */
function extractAmount(text: string): string | null {
  // Patterns ordered by specificity
  const patterns = [
    /totale\s*(?:da\s*pagare|dovuto|fattura|bolletta)[:\s]*(?:€|EUR)?\s*([\d.,]+)/i,
    /importo\s*(?:totale|dovuto|da\s*pagare)[:\s]*(?:€|EUR)?\s*([\d.,]+)/i,
    /(?:€|EUR)\s*([\d.,]+)\s*(?:totale|da\s*pagare)/i,
    /totale[:\s]*(?:€|EUR)?\s*([\d.,]+)/i,
    /importo[:\s]*(?:€|EUR)?\s*([\d.,]+)/i,
    /(?:€|EUR)\s*([\d]+[.,]\d{2})\b/i,
  ];

  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      // Normalize: "1.234,56" or "1234,56" → "1234.56"
      let val = m[1].replace(/\./g, "").replace(",", ".");
      const num = parseFloat(val);
      if (!isNaN(num) && num > 0 && num < 100000) {
        return num.toFixed(2);
      }
    }
  }
  return null;
}

/** Extract consumption value */
function extractConsumption(text: string): { value: string; unit: string } | null {
  const patterns = [
    /consumi?[:\s]*(\d+[.,]?\d*)\s*(kwh|smc|m[³3c]|mc)/i,
    /(\d+[.,]?\d*)\s*(kwh|smc|m[³3c])\b/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      const val = m[1].replace(",", ".");
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
