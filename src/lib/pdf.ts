import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const GREEN = "#1F3326";
const GOLD = "#BFA762";
const SURFACE = "#F3EBDD";
const LINE = "#D8CCB8";
const INK_SOFT = "#6C6B5D";

const DOW_SHORT = ["L", "M", "M", "G", "V", "S", "D"];
function dayOfWeek(date: string): number {
  const d = new Date(`${date}T00:00:00`).getDay();
  return d === 0 ? 6 : d - 1;
}

function todayIT(): string {
  return new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function shiftHoursCalc(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

// ─── Turni PDF (landscape A4) ───
export interface TurniPdfData {
  year: number;
  month: number;
  monthName: string;
  dates: string[];
  staff: { id: string; name: string; type?: "dipendente" | "a_chiamata" }[];
  shiftTypes: { id: string; name: string; startTime: string; endTime: string; color: string }[];
  shifts: { staffId: string; date: string; shiftTypeId: string }[];
}

export function generateTurniPdf(data: TurniPdfData): jsPDF {
  const { year, monthName, dates, staff, shiftTypes, shifts } = data;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const margin = 12;
  const usableW = pageW - margin * 2;

  // Staff lookup by id
  const staffMap = new Map(staff.map(s => [s.id, s]));

  // Build date -> shiftTypeId -> list of staff names (+ type)
  const dateShiftStaff: Record<string, Record<string, { name: string; type: string }[]>> = {};
  for (const s of shifts) {
    const p = staffMap.get(s.staffId);
    if (!p) continue;
    if (!dateShiftStaff[s.date]) dateShiftStaff[s.date] = {};
    if (!dateShiftStaff[s.date][s.shiftTypeId]) dateShiftStaff[s.date][s.shiftTypeId] = [];
    dateShiftStaff[s.date][s.shiftTypeId].push({ name: p.name, type: p.type ?? "dipendente" });
  }

  // ─── Header ───
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(GREEN);
  doc.text("LE 4 CAMERE", margin, margin + 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(INK_SOFT);
  doc.text("HOTEL \u2605\u2605\u2605", margin, margin + 10);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(GREEN);
  doc.text(`Turni \u2014 ${monthName} ${year}`, pageW - margin, margin + 5, { align: "right" });

  // Legend
  const legendY = margin + 15;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  let lx = margin;
  for (const t of shiftTypes) {
    doc.setFillColor(t.color || GREEN);
    doc.roundedRect(lx, legendY - 3, 5, 5, 1, 1, "F");
    const label = ` ${t.name} (${t.startTime.slice(0, 5)}\u2013${t.endTime.slice(0, 5)})`;
    doc.setTextColor(INK_SOFT);
    doc.text(label, lx + 6, legendY + 1);
    lx += doc.getTextWidth(label) + 14;
  }

  // Gold separator
  doc.setDrawColor(GOLD);
  doc.setLineWidth(0.6);
  doc.line(margin, legendY + 5, pageW - margin, legendY + 5);

  const tableStartY = legendY + 8;

  // ─── Table: DATA | MATTINA | POMERIGGIO (dynamic shift type columns) ───
  const dateColW = 42;
  const shiftColW = (usableW - dateColW) / shiftTypes.length;

  // Header row
  const headRow = ["DATA", ...shiftTypes.map(t => t.name.toUpperCase())];

  // Body rows — one per date
  const DOW_FULL = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
  const bodyRows: string[][] = [];
  for (const date of dates) {
    const dayNum = date.slice(8, 10);
    const monthNum = date.slice(5, 7);
    const dow = dayOfWeek(date);
    const dateLabel = `${DOW_FULL[dow]} ${dayNum}/${monthNum}`;

    const row: string[] = [dateLabel];
    for (const t of shiftTypes) {
      const people = dateShiftStaff[date]?.[t.id] ?? [];
      row.push(people.length > 0 ? people.map(p => p.name).join(", ") : "\u2014");
    }
    bodyRows.push(row);
  }

  autoTable(doc, {
    startY: tableStartY,
    margin: { left: margin, right: margin },
    head: [headRow],
    body: bodyRows,
    tableWidth: usableW,
    styles: {
      fontSize: 10,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
      lineColor: LINE,
      lineWidth: 0.25,
      valign: "middle",
      font: "helvetica",
      minCellHeight: 8,
    },
    headStyles: {
      fillColor: GREEN,
      textColor: "#FAF9F5",
      fontStyle: "bold",
      fontSize: 11,
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
    },
    columnStyles: {
      0: { cellWidth: dateColW, fontStyle: "bold", fontSize: 10 },
      ...Object.fromEntries(shiftTypes.map((_, i) => [i + 1, { cellWidth: shiftColW, halign: "left" as const }])),
    },
    didParseCell(hookData) {
      const { section, column, cell, row } = hookData;
      if (section !== "body") return;
      const colIdx = column.index;
      const date = dates[row.index];
      if (!date) return;
      const dow = dayOfWeek(date);
      const isWeekend = dow >= 5;

      // Row background
      if (isWeekend) {
        cell.styles.fillColor = SURFACE; // #F3EBDD
      } else if (row.index % 2 === 1) {
        cell.styles.fillColor = "#FAFAF7";
      }

      // Shift columns: color names by staff type
      if (colIdx >= 1) {
        const t = shiftTypes[colIdx - 1];
        const people = t ? (dateShiftStaff[date]?.[t.id] ?? []) : [];
        if (people.length === 0) {
          // Dash in light gray
          cell.styles.textColor = LINE;
        } else {
          // Check if any are a_chiamata
          const hasOnCall = people.some(p => p.type === "a_chiamata");
          const allOnCall = people.every(p => p.type === "a_chiamata");
          if (allOnCall) {
            cell.styles.textColor = GOLD;
          } else if (hasOnCall) {
            // Mixed — keep default dark, the mixed case is rare
            cell.styles.textColor = GREEN;
          } else {
            cell.styles.textColor = GREEN;
          }
        }
      }

      // Weekend date column: slightly bolder
      if (colIdx === 0 && isWeekend) {
        cell.styles.textColor = "#9E3B2E";
      }
    },
  });

  // ─── Footer ───
  doc.setFontSize(8);
  doc.setTextColor(INK_SOFT);
  doc.setFont("helvetica", "normal");
  doc.text("Documento generato dal Gestionale Le 4 Camere", margin, 290);
  doc.text(`Stampato il ${todayIT()}`, pageW - margin, 290, { align: "right" });

  return doc;
}

// ─── Report PDF (portrait A4): riepilogo + copertura ───
export interface ReportPdfData {
  monthLabel: string;
  weekLabel: string;
  // Riepilogo ore e costi
  riepilogoRows: {
    name: string; type: string; weekHours: number; monthHours: number;
    contract: string; weekCost: string; monthCost: string;
  }[];
  totalWeekCost: string;
  totalMonthCost: string;
  // Copertura mensile
  shiftTypeNames: string[];
  coperturaRows: {
    name: string; byType: number[]; hours: number;
    workDays: number; restDays: number; leaves: number; status: string;
  }[];
}

export function generateReportPdf(data: ReportPdfData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 14;
  const pageW = 210;

  function drawHeader(title: string) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(GREEN);
    doc.text("LE 4 CAMERE", margin, margin + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`— ${title}`, margin + 45, margin + 6);

    doc.setDrawColor(GOLD);
    doc.setLineWidth(0.6);
    doc.line(margin, margin + 10, pageW - margin, margin + 10);
  }

  function drawFooter() {
    doc.setFontSize(7);
    doc.setTextColor(INK_SOFT);
    doc.setFont("helvetica", "normal");
    doc.text("Documento generato dal Gestionale Le 4 Camere", margin, 287);
    doc.text(`Stampato il ${todayIT()}`, pageW - margin, 287, { align: "right" });
  }

  // ─── Page 1: Riepilogo ore e costi ───
  drawHeader(`Riepilogo ore e costi — ${data.monthLabel}`);

  const rHead = [["Persona", "Tipo", "Ore sett.", "Ore mese", "Contratto", "Costo sett.", "Costo mese"]];
  const rBody = data.riepilogoRows.map(r => [
    r.name, r.type, `${r.weekHours}h`, `${r.monthHours}h`, r.contract, r.weekCost, r.monthCost,
  ]);
  rBody.push(["", "", "", "", "Totale a chiamata", data.totalWeekCost, data.totalMonthCost]);

  autoTable(doc, {
    startY: margin + 14,
    margin: { left: margin, right: margin },
    head: rHead,
    body: rBody,
    styles: { fontSize: 9, cellPadding: 3, lineColor: LINE, lineWidth: 0.3, font: "helvetica" },
    headStyles: { fillColor: GREEN, textColor: "#FAF9F5", fontStyle: "bold" },
    columnStyles: {
      0: { fontStyle: "bold" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
    },
    didParseCell(hookData) {
      const { section, row, cell } = hookData;
      // Total row
      if (section === "body" && row.index === rBody.length - 1) {
        cell.styles.fillColor = SURFACE;
        cell.styles.fontStyle = "bold";
      }
    },
  });

  drawFooter();

  // ─── Page 2: Copertura mensile ───
  doc.addPage();
  drawHeader(`Copertura mensile — ${data.monthLabel}`);

  const stNames = data.shiftTypeNames;
  const cHead = [["Persona", ...stNames, "Ore", "Lavorati", "Riposi", "Permessi", "Stato"]];
  const cBody = data.coperturaRows.map(r => [
    r.name,
    ...r.byType.map(String),
    `${r.hours}h`,
    `${r.workDays}g`,
    `${r.restDays}g`,
    String(r.leaves),
    r.status,
  ]);

  autoTable(doc, {
    startY: margin + 14,
    margin: { left: margin, right: margin },
    head: cHead,
    body: cBody,
    styles: { fontSize: 9, cellPadding: 3, lineColor: LINE, lineWidth: 0.3, font: "helvetica" },
    headStyles: { fillColor: GREEN, textColor: "#FAF9F5", fontStyle: "bold" },
    columnStyles: {
      0: { fontStyle: "bold" },
    },
    didParseCell(hookData) {
      const { section, column, cell } = hookData;
      if (section === "body") {
        const colIdx = column.index;
        // Shift type count columns
        if (colIdx >= 1 && colIdx <= stNames.length) {
          cell.styles.halign = "center";
          cell.styles.fontStyle = "bold";
        }
        // Hours
        if (colIdx === stNames.length + 1) cell.styles.halign = "right";
        // Work/rest/leaves
        if (colIdx >= stNames.length + 2 && colIdx <= stNames.length + 4) cell.styles.halign = "center";
        // Status
        if (colIdx === stNames.length + 5) {
          const status = cell.text.join("");
          if (status === "OK") {
            cell.styles.textColor = "#2D5A3D";
            cell.styles.fontStyle = "bold";
          } else {
            cell.styles.textColor = "#9E3B2E";
            cell.styles.fontStyle = "bold";
          }
        }
      }
    },
  });

  drawFooter();

  return doc;
}
