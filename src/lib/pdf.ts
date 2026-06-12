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
  staff: { id: string; name: string }[];
  shiftTypes: { id: string; name: string; startTime: string; endTime: string; color: string }[];
  shifts: { staffId: string; date: string; shiftTypeId: string }[];
}

export function generateTurniPdf(data: TurniPdfData): jsPDF {
  const { year, monthName, dates, staff, shiftTypes, shifts } = data;
  const numDays = dates.length;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = 297;
  const margin = 8;
  const usableW = pageW - margin * 2;

  // Build type abbreviation map
  const typeAbbrMap: Record<string, { abbr: string; color: string }> = {};
  const usedAbbrs = new Set<string>();
  for (const t of shiftTypes) {
    let abbr = t.name.charAt(0).toUpperCase();
    if (usedAbbrs.has(abbr)) abbr = t.name.slice(0, 2).toUpperCase();
    usedAbbrs.add(abbr);
    typeAbbrMap[t.id] = { abbr, color: t.color || GREEN };
  }

  // Build cell data: staffId -> date -> abbreviations
  const cellData: Record<string, Record<string, string[]>> = {};
  for (const s of shifts) {
    if (!cellData[s.staffId]) cellData[s.staffId] = {};
    if (!cellData[s.staffId][s.date]) cellData[s.staffId][s.date] = [];
    const ti = typeAbbrMap[s.shiftTypeId];
    if (ti) cellData[s.staffId][s.date].push(ti.abbr);
  }

  // Hours per person
  const hoursByPerson: Record<string, number> = {};
  for (const s of shifts) {
    const t = shiftTypes.find(ty => ty.id === s.shiftTypeId);
    if (!t) continue;
    hoursByPerson[s.staffId] = (hoursByPerson[s.staffId] ?? 0) + shiftHoursCalc(t.startTime, t.endTime);
  }

  // ─── Header ───
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(GREEN);
  doc.text("LE 4 CAMERE", margin, margin + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.text(`— Turni ${monthName} ${year}`, margin + 52, margin + 6);

  // Legend line
  const legendY = margin + 10;
  doc.setFontSize(8);
  doc.setTextColor(INK_SOFT);
  let lx = margin;
  for (const t of shiftTypes) {
    const ti = typeAbbrMap[t.id];
    doc.setFillColor(ti.color);
    doc.rect(lx, legendY - 2, 4, 4, "F");
    doc.text(` ${ti.abbr} = ${t.name} (${t.startTime.slice(0, 5)}–${t.endTime.slice(0, 5)})`, lx + 5, legendY + 1);
    lx += doc.getTextWidth(` ${ti.abbr} = ${t.name} (${t.startTime.slice(0, 5)}–${t.endTime.slice(0, 5)})`) + 10;
  }

  // Gold line
  doc.setDrawColor(GOLD);
  doc.setLineWidth(0.8);
  doc.line(margin, legendY + 4, pageW - margin, legendY + 4);

  // ─── Table ───
  const staffColW = 28;
  const hoursColW = 14;
  const dayColW = (usableW - staffColW - hoursColW) / numDays;

  // Header row
  const headRow: string[] = [""];
  for (const date of dates) {
    const dayNum = parseInt(date.slice(8, 10));
    headRow.push(String(dayNum));
  }
  headRow.push("Ore");

  // Sub-header (day of week) - we'll use custom header drawing
  const bodyRows: string[][] = [];
  for (const p of staff) {
    const row: string[] = [p.name];
    for (const date of dates) {
      const abbrs = cellData[p.id]?.[date] ?? [];
      row.push(abbrs.join("+"));
    }
    row.push(`${hoursByPerson[p.id] ?? 0}h`);
    bodyRows.push(row);
  }

  const startY = legendY + 7;

  autoTable(doc, {
    startY,
    margin: { left: margin, right: margin },
    head: [headRow],
    body: bodyRows,
    tableWidth: usableW,
    styles: {
      fontSize: 7.5,
      cellPadding: 1,
      lineColor: LINE,
      lineWidth: 0.3,
      valign: "middle",
      halign: "center",
      font: "helvetica",
    },
    headStyles: {
      fillColor: GREEN,
      textColor: "#FAF9F5",
      fontStyle: "bold",
      fontSize: 7,
      cellPadding: { top: 1, bottom: 1, left: 0.5, right: 0.5 },
    },
    columnStyles: {
      0: { cellWidth: staffColW, halign: "left", fontStyle: "bold", fontSize: 8 },
      [numDays + 1]: { cellWidth: hoursColW, fontStyle: "bold", fillColor: SURFACE },
    },
    didParseCell(hookData) {
      const { section, column, cell, row } = hookData;
      const colIdx = column.index;

      // Day columns
      if (colIdx >= 1 && colIdx <= numDays) {
        const date = dates[colIdx - 1];
        const dow = dayOfWeek(date);

        // Weekend header
        if (section === "head" && dow >= 5) {
          cell.styles.fillColor = "#2D4A35";
        }

        // Add day-of-week under the number in header
        if (section === "head") {
          // We'll draw it manually in didDrawCell
        }

        // Weekend body cells
        if (section === "body" && dow >= 5 && !cell.text.join("")) {
          cell.styles.fillColor = "#F9F8F5";
        }

        // Zebra striping
        if (section === "body" && row.index % 2 === 1 && !cell.text.join("")) {
          cell.styles.fillColor = "#FAFAF8";
        }

        // Shift cell coloring
        if (section === "body") {
          const cellText = cell.text.join("");
          if (cellText) {
            // Determine which shift type(s) this is
            const staffRow = staff[row.index];
            const dateShifts = staffRow ? (cellData[staffRow.id]?.[date] ?? []) : [];
            if (dateShifts.length > 0) {
              // Use the first shift's color for the cell
              const firstAbbr = dateShifts[0];
              const entry = Object.values(typeAbbrMap).find(e => e.abbr === firstAbbr);
              if (entry) {
                cell.styles.fillColor = entry.color;
                cell.styles.textColor = "#FFFFFF";
                cell.styles.fontStyle = "bold";
              }
            }
          }
        }

        cell.styles.cellWidth = dayColW;
      }
    },
    didDrawCell(hookData) {
      const { section, column, cell } = hookData;
      const colIdx = column.index;

      // Draw day-of-week letter under the day number in header
      if (section === "head" && colIdx >= 1 && colIdx <= numDays) {
        const date = dates[colIdx - 1];
        const dow = dayOfWeek(date);
        doc.setFontSize(5.5);
        doc.setTextColor("#FFFFFF");
        doc.setFont("helvetica", "normal");
        const x = cell.x + cell.width / 2;
        const y = cell.y + cell.height - 1;
        doc.text(DOW_SHORT[dow], x, y, { align: "center" });
        // Reset
        doc.setFont("helvetica", "bold");
      }
    },
  });

  // Footer
  const finalY = (doc as any).lastAutoTable?.finalY ?? 190;
  doc.setFontSize(7);
  doc.setTextColor(INK_SOFT);
  doc.setFont("helvetica", "normal");
  doc.text("Documento generato dal Gestionale Le 4 Camere", margin, finalY + 6);
  doc.text(`Stampato il ${todayIT()}`, pageW - margin, finalY + 6, { align: "right" });

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
