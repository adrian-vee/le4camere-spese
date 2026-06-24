import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { eur } from "@/lib/format";

/* ============================================================
 * 1. Report Chiusura Giornaliera Bar
 * ============================================================ */

type DailyReportData = {
  date: string;
  orders: {
    id: string;
    total: number;
    payment_method: string | null;
    service_area: string | null;
    status: string;
    is_complimentary: boolean;
    discount: number;
    operator_name: string;
    original_total: number;
    items: { product_name: string; quantity: number; unit_price: number; line_total: number }[];
  }[];
};

export function generateBarDailyReport(data: DailyReportData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  let y = 20;

  const paid = data.orders.filter((o) => o.status === "pagato");
  const cancelled = data.orders.filter((o) => o.status === "annullato");
  const totalSales = paid.reduce((s, o) => s + Number(o.total), 0);

  /* Header */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Chiusura Giornaliera Bar", W / 2, y, { align: "center" });
  y += 8;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  const dateLabel = new Date(data.date).toLocaleDateString("it-IT", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  doc.text(dateLabel, W / 2, y, { align: "center" });
  y += 4;
  doc.text(`Le 4 Camere`, W / 2, y, { align: "center" });
  y += 10;

  /* Section 1: Riepilogo */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("1. Riepilogo", 14, y);
  y += 7;

  autoTable(doc, {
    startY: y,
    head: [["", "Valore"]],
    body: [
      ["Totale vendite", eur(totalSales)],
      ["N. ordini pagati", String(paid.length)],
      ["N. ordini annullati", String(cancelled.length)],
      ["Media ordine", paid.length > 0 ? eur(totalSales / paid.length) : "0,00"],
    ],
    theme: "grid",
    headStyles: { fillColor: [31, 51, 38] },
    margin: { left: 14, right: 14 },
    styles: { fontSize: 10, font: "helvetica" },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  /* Section 2: Per metodo di pagamento */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("2. Per metodo di pagamento", 14, y);
  y += 7;

  const methods = ["contanti", "carta", "camera", "misto", "omaggio"];
  const byMethod = methods.map((m) => {
    const mOrders = paid.filter((o) => o.payment_method === m);
    return [
      m.charAt(0).toUpperCase() + m.slice(1),
      String(mOrders.length),
      eur(mOrders.reduce((s, o) => s + Number(o.total), 0)),
    ];
  }).filter((row) => row[1] !== "0");

  autoTable(doc, {
    startY: y,
    head: [["Metodo", "N. ordini", "Totale"]],
    body: byMethod,
    theme: "grid",
    headStyles: { fillColor: [31, 51, 38] },
    margin: { left: 14, right: 14 },
    styles: { fontSize: 10 },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  /* Section 3: Per area servizio */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("3. Per area di servizio", 14, y);
  y += 7;

  const areas = [...new Set(paid.map((o) => o.service_area ?? "bar"))];
  const byArea = areas.map((a) => {
    const aOrders = paid.filter((o) => (o.service_area ?? "bar") === a);
    return [
      a.charAt(0).toUpperCase() + a.slice(1),
      String(aOrders.length),
      eur(aOrders.reduce((s, o) => s + Number(o.total), 0)),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [["Area", "N. ordini", "Totale"]],
    body: byArea,
    theme: "grid",
    headStyles: { fillColor: [31, 51, 38] },
    margin: { left: 14, right: 14 },
    styles: { fontSize: 10 },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  /* Section 4: Top 10 prodotti */
  if (y > 240) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("4. Top 10 prodotti", 14, y);
  y += 7;

  const productMap = new Map<string, { qty: number; revenue: number }>();
  for (const order of paid) {
    for (const item of order.items) {
      const entry = productMap.get(item.product_name) ?? { qty: 0, revenue: 0 };
      entry.qty += item.quantity;
      entry.revenue += item.line_total;
      productMap.set(item.product_name, entry);
    }
  }
  const topProducts = [...productMap.entries()]
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 10)
    .map(([name, { qty, revenue }]) => [name, String(qty), eur(revenue)]);

  autoTable(doc, {
    startY: y,
    head: [["Prodotto", "Qtà venduta", "Fatturato"]],
    body: topProducts,
    theme: "grid",
    headStyles: { fillColor: [31, 51, 38] },
    margin: { left: 14, right: 14 },
    styles: { fontSize: 10 },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  /* Section 5: Per operatore */
  if (y > 240) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("5. Per operatore", 14, y);
  y += 7;

  const operatorMap = new Map<string, { count: number; total: number }>();
  for (const order of paid) {
    const name = order.operator_name || "Sconosciuto";
    const entry = operatorMap.get(name) ?? { count: 0, total: 0 };
    entry.count++;
    entry.total += Number(order.total);
    operatorMap.set(name, entry);
  }
  const byOperator = [...operatorMap.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([name, { count, total }]) => [name, String(count), eur(total)]);

  autoTable(doc, {
    startY: y,
    head: [["Operatore", "N. ordini", "Totale"]],
    body: byOperator,
    theme: "grid",
    headStyles: { fillColor: [31, 51, 38] },
    margin: { left: 14, right: 14 },
    styles: { fontSize: 10 },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  /* Section 6: Sconti & omaggi */
  const discounted = paid.filter((o) => o.discount > 0 || o.is_complimentary);
  if (discounted.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("6. Sconti e omaggi", 14, y);
    y += 7;

    const totalDiscount = discounted.reduce((s, o) => s + Number(o.discount), 0);
    const complimentary = discounted.filter((o) => o.is_complimentary);
    const complimentaryValue = complimentary.reduce((s, o) => s + Number(o.original_total ?? 0), 0);

    autoTable(doc, {
      startY: y,
      head: [["", "Valore"]],
      body: [
        ["Ordini con sconto/omaggio", String(discounted.length)],
        ["Totale sconti applicati", eur(totalDiscount)],
        ["N. omaggi", String(complimentary.length)],
        ["Valore omaggi", eur(complimentaryValue)],
      ],
      theme: "grid",
      headStyles: { fillColor: [31, 51, 38] },
      margin: { left: 14, right: 14 },
      styles: { fontSize: 10 },
    });
  }

  /* Footer */
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Le 4 Camere — Report generato il ${new Date().toLocaleDateString("it-IT")} — Pagina ${i}/${pageCount}`,
      W / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" },
    );
  }

  doc.save(`chiusura-bar-${data.date}.pdf`);
}

/* ============================================================
 * 2. Riepilogo Conto Camera PDF
 * ============================================================ */

type RoomSummaryData = {
  roomNumber: string;
  guestName: string | null;
  orders: {
    created_at: string;
    total: number;
    items: { product_name: string; quantity: number; unit_price: number; line_total: number }[];
  }[];
  grandTotal: number;
};

export function generateRoomSummaryPdf(data: RoomSummaryData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  let y = 20;

  /* Header */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Riepilogo Conto Camera", W / 2, y, { align: "center" });
  y += 8;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Le 4 Camere`, W / 2, y, { align: "center" });
  y += 10;

  /* Room info */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`Camera ${data.roomNumber}`, 14, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Ospite: ${data.guestName ?? "Non specificato"}`, 14, y);
  y += 6;
  doc.text(`Data: ${new Date().toLocaleDateString("it-IT")}`, 14, y);
  y += 10;

  /* All items from all orders */
  const allItems: string[][] = [];
  for (const order of data.orders) {
    const dateStr = new Date(order.created_at).toLocaleDateString("it-IT", {
      day: "2-digit", month: "2-digit",
    }) + " " + new Date(order.created_at).toLocaleTimeString("it-IT", {
      hour: "2-digit", minute: "2-digit",
    });
    for (const item of order.items) {
      allItems.push([
        dateStr,
        item.product_name,
        String(item.quantity),
        eur(item.unit_price),
        eur(item.line_total),
      ]);
    }
  }

  autoTable(doc, {
    startY: y,
    head: [["Data", "Prodotto", "Qtà", "Prezzo", "Totale"]],
    body: allItems,
    theme: "grid",
    headStyles: { fillColor: [31, 51, 38] },
    margin: { left: 14, right: 14 },
    styles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 30 },
      2: { halign: "center", cellWidth: 15 },
      3: { halign: "right", cellWidth: 25 },
      4: { halign: "right", cellWidth: 25 },
    },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  /* Grand total */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`Totale: ${eur(data.grandTotal)}`, W - 14, y, { align: "right" });
  y += 20;

  /* Signature line */
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Firma ospite: ___________________________", 14, y);
  y += 8;
  doc.text("Firma reception: ___________________________", 14, y);

  /* Footer */
  doc.setFontSize(8);
  doc.text(
    `Le 4 Camere — Generato il ${new Date().toLocaleDateString("it-IT")}`,
    W / 2,
    doc.internal.pageSize.getHeight() - 10,
    { align: "center" },
  );

  doc.save(`conto-camera-${data.roomNumber}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

/* ============================================================
 * 3. Scontrino Bar (formato termico 80mm)
 * ============================================================ */

type ReceiptData = {
  paymentMethod: string;
  items: { name: string; quantity: number; unitPrice: number; lineTotal: number }[];
  subtotal: number;
  discount: number;
  total: number;
  isComplimentary: boolean;
  complimentaryReason?: string;
  amountReceived?: number;
  changeGiven?: number;
  roomNumber?: string;
  guestName?: string;
  serviceArea: string;
  notes?: string;
  operatorName: string;
  date?: Date;
};

export function generateBarReceipt(data: ReceiptData) {
  // 80mm = ~226pt, variable height
  const W = 226;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: [W, 600] });
  const M = 12;
  const CW = W - M * 2;
  let y = 16;
  const d = data.date ?? new Date();

  doc.setFont("courier", "bold");
  doc.setFontSize(12);
  doc.text("LE 4 CAMERE - BAR", W / 2, y, { align: "center" });
  y += 14;

  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  doc.text(
    `${d.toLocaleDateString("it-IT")}  ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`,
    W / 2, y, { align: "center" }
  );
  y += 10;
  doc.text(`Op: ${data.operatorName}`, M, y);
  if (data.serviceArea !== "bar") {
    doc.text(`Area: ${data.serviceArea}`, W - M, y, { align: "right" });
  }
  y += 12;

  // Separator
  doc.setLineWidth(0.5);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(M, y, W - M, y);
  y += 10;

  // Items
  doc.setFontSize(8);
  for (const item of data.items) {
    const name = item.name.length > 22 ? item.name.substring(0, 22) : item.name;
    doc.setFont("courier", "normal");
    doc.text(`${item.quantity}x ${name}`, M, y);
    doc.text(eur(item.lineTotal), W - M, y, { align: "right" });
    y += 11;
  }

  // Separator
  y += 2;
  doc.line(M, y, W - M, y);
  y += 10;

  // Subtotal / discount
  if (data.discount > 0 && !data.isComplimentary) {
    doc.text("Subtotale:", M, y);
    doc.text(eur(data.subtotal), W - M, y, { align: "right" });
    y += 11;
    doc.text("Sconto:", M, y);
    doc.text(`-${eur(data.discount)}`, W - M, y, { align: "right" });
    y += 11;
  }

  // Total
  doc.setFont("courier", "bold");
  doc.setFontSize(11);
  doc.text("TOTALE:", M, y);
  doc.text(eur(data.total), W - M, y, { align: "right" });
  y += 14;

  doc.setFont("courier", "normal");
  doc.setFontSize(8);

  // Payment-specific info
  if (data.isComplimentary) {
    doc.setFont("courier", "bold");
    doc.text("*** OMAGGIO ***", W / 2, y, { align: "center" });
    y += 11;
    if (data.complimentaryReason) {
      doc.setFont("courier", "normal");
      doc.text(`Motivo: ${data.complimentaryReason}`, M, y);
      y += 11;
    }
  } else if (data.paymentMethod === "contanti" && data.amountReceived) {
    doc.text(`Ricevuto: ${eur(data.amountReceived)}`, M, y);
    y += 11;
    doc.text(`Resto: ${eur(data.changeGiven ?? 0)}`, M, y);
    y += 11;
  } else if (data.paymentMethod === "camera" && data.roomNumber) {
    doc.text(`Addebito camera ${data.roomNumber}`, M, y);
    y += 11;
    if (data.guestName) {
      doc.text(`Ospite: ${data.guestName}`, M, y);
      y += 11;
    }
  } else if (data.paymentMethod === "carta") {
    doc.text("Pagamento: Carta", M, y);
    y += 11;
  } else if (data.paymentMethod === "misto") {
    doc.text("Pagamento: Misto", M, y);
    y += 11;
  }

  if (data.notes) {
    y += 2;
    doc.text(`Note: ${data.notes}`, M, y);
    y += 11;
  }

  // Footer
  y += 6;
  doc.line(M, y, W - M, y);
  y += 10;
  doc.text("Grazie e arrivederci!", W / 2, y, { align: "center" });
  y += 16;

  doc.save(`scontrino-${d.toISOString().slice(0, 10)}-${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }).replace(":", "")}.pdf`);
}
