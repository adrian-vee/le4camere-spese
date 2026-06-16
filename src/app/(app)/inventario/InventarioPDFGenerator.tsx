import { eur, fmtDate } from "@/lib/format";

type Session = {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  operator_id: string | null;
  notes: string | null;
  total_products: number;
  counted_products: number;
  discrepancies_count: number;
  discrepancies_value: number;
  profiles?: { full_name: string } | null;
};

type Count = {
  id: string;
  session_id: string;
  product_id: string;
  expected_qty: number;
  counted_qty: number | null;
  difference: number | null;
  value_difference: number | null;
  counted_at: string | null;
  notes: string | null;
  products?: {
    name: string;
    category: string;
    unit: string;
    unit_cost: number;
    barcode: string | null;
  } | null;
};

export function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function generatePDF({
  reportSession,
  reportCounts,
}: {
  reportSession: Session;
  reportCounts: Count[];
}) {
  const diffs = reportCounts.filter((c) => c.counted_qty !== null);
  const discrepancies = diffs.filter((c) => (c.difference ?? 0) !== 0);
  const totalAmmanchi = discrepancies
    .filter((c) => (c.difference ?? 0) < 0)
    .reduce((s, c) => s + Math.abs(c.value_difference ?? 0), 0);
  const totalEccedenze = discrepancies
    .filter((c) => (c.difference ?? 0) > 0)
    .reduce((s, c) => s + (c.value_difference ?? 0), 0);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Inventario ${escHtml(fmtDate(reportSession.started_at))}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',system-ui,sans-serif;font-size:11px;color:#1F3326;padding:30px}
.header{text-align:center;margin-bottom:24px;border-bottom:2px solid #1F3326;padding-bottom:16px}
.header h1{font-size:20px;font-weight:700;letter-spacing:2px}.header h2{font-size:14px;font-weight:400;margin-top:4px;color:#6C6B5D}
.meta{display:flex;justify-content:space-between;margin-bottom:16px;font-size:11px;color:#6C6B5D}
table{width:100%;border-collapse:collapse;margin-bottom:16px}th{background:#F3EBDD;text-align:left;padding:6px 8px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #D8CCB8}
td{padding:6px 8px;border-bottom:1px solid #D8CCB8;font-size:11px}.num{text-align:right;font-variant-numeric:tabular-nums}
.neg{color:#9E3B2E;font-weight:700}.pos{color:#BFA762;font-weight:700}.summary{background:#F3EBDD;border-radius:8px;padding:14px;margin-bottom:20px}
.summary td{border:none;padding:4px 8px}.footer{margin-top:30px;font-size:10px;color:#6C6B5D;text-align:center;border-top:1px solid #D8CCB8;padding-top:12px}
.signatures{display:flex;justify-content:space-between;margin-top:40px;padding-top:8px}.sig{width:200px;border-top:1px solid #1F3326;text-align:center;padding-top:6px;font-size:10px}
@media print{body{padding:15px}@page{margin:15mm}}
</style></head><body>
<div class="header"><h1>LE 4 CAMERE</h1><div style="font-size:11px;letter-spacing:3px;color:#BFA762;margin:4px 0">HOTEL ★★★</div><h2>Inventario Magazzino</h2></div>
<div class="meta"><div>Data: ${escHtml(fmtDate(reportSession.started_at))}${reportSession.completed_at ? " — " + escHtml(fmtDate(reportSession.completed_at)) : ""}</div><div>Operatore: ${escHtml(reportSession.profiles?.full_name ?? "—")}</div></div>
${(() => {
  const pdfGrouped: Record<string, typeof diffs> = {};
  for (const c of diffs) { const cat = c.products?.category ?? "Altro"; (pdfGrouped[cat] ??= []).push(c); }
  return Object.entries(pdfGrouped).sort((a, b) => a[0].localeCompare(b[0])).map(([cat, rows]) =>
    `<h3 style="font-size:12px;margin:16px 0 6px;color:#1F3326;border-bottom:1px solid #D8CCB8;padding-bottom:4px">${escHtml(cat)} (${rows.length})</h3>
<table><thead><tr><th>Prodotto</th><th class="num">Teorico</th><th class="num">Contato</th><th class="num">Diff.</th><th class="num">Val. diff.</th></tr></thead><tbody>
${rows.map(c => {
  const cls = (c.difference ?? 0) < 0 ? "neg" : (c.difference ?? 0) > 0 ? "pos" : "";
  return `<tr><td>${escHtml(c.products?.name ?? "?")}</td><td class="num">${c.expected_qty}</td><td class="num">${c.counted_qty}</td><td class="num ${cls}">${(c.difference ?? 0) > 0 ? "+" : ""}${c.difference ?? 0}</td><td class="num ${cls}">${escHtml(eur(c.value_difference ?? 0))}</td></tr>`;
}).join("")}
</tbody></table>`
  ).join("");
})()}
<table class="summary"><tbody>
<tr><td><strong>Prodotti contati</strong></td><td class="num">${diffs.length} / ${reportCounts.length}</td><td><strong>Con differenze</strong></td><td class="num">${discrepancies.length}</td></tr>
<tr><td><strong>Totale ammanchi</strong></td><td class="num neg">${eur(-totalAmmanchi)}</td><td><strong>Totale eccedenze</strong></td><td class="num pos">+${eur(totalEccedenze)}</td></tr>
</tbody></table>
<div class="signatures"><div class="sig">Firma operatore</div><div class="sig">Firma responsabile</div></div>
<div class="footer">Documento generato dal Gestionale Le 4 Camere — ${new Date().toLocaleString("it-IT")}</div>
</body></html>`;
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
}
