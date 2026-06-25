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

async function loadLogoPng(): Promise<string | null> {
  try {
    const res = await fetch("/le4camere-logo-bianco.svg");
    let svg = await res.text();
    svg = svg.replace(/fill="#ffffff"/g, `fill="${GREEN}"`);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 800;
        canvas.height = 280;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => resolve(null);
      img.src = `data:image/svg+xml;base64,${btoa(svg)}`;
    });
  } catch {
    return null;
  }
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
  const margin = 8;
  const usableW = pageW - margin * 2;

  // Staff lookup by id
  const staffMap = new Map(staff.map(s => [s.id, s]));

  // Build date -> shiftTypeId -> list of staff names
  const dateShiftStaff: Record<string, Record<string, string[]>> = {};
  for (const s of shifts) {
    const p = staffMap.get(s.staffId);
    if (!p) continue;
    if (!dateShiftStaff[s.date]) dateShiftStaff[s.date] = {};
    if (!dateShiftStaff[s.date][s.shiftTypeId]) dateShiftStaff[s.date][s.shiftTypeId] = [];
    dateShiftStaff[s.date][s.shiftTypeId].push(p.name);
  }

  // ─── Header (compact: max ~22mm) ───
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(GREEN);
  doc.text("LE 4 CAMERE", margin, margin + 4);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(INK_SOFT);
  doc.text("HOTEL ***", margin, margin + 9);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(GREEN);
  doc.text(`Turni - ${monthName} ${year}`, pageW - margin, margin + 4, { align: "right" });

  // Legend (inline, same line)
  const legendY = margin + 13;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  let lx = margin;
  for (const t of shiftTypes) {
    doc.setFillColor(t.color || GREEN);
    doc.roundedRect(lx, legendY - 2.5, 4, 4, 1, 1, "F");
    const label = ` ${t.name} (${t.startTime.slice(0, 5)}-${t.endTime.slice(0, 5)})`;
    doc.setTextColor(INK_SOFT);
    doc.text(label, lx + 5, legendY + 1);
    lx += doc.getTextWidth(label) + 11;
  }

  // Gold separator
  doc.setDrawColor(GOLD);
  doc.setLineWidth(0.5);
  const sepY = legendY + 4;
  doc.line(margin, sepY, pageW - margin, sepY);

  const tableStartY = sepY + 2;

  // ─── Table: DATA | shift columns ───
  const dateColW = 38;
  const shiftColW = (usableW - dateColW) / shiftTypes.length;

  const headRow = ["DATA", ...shiftTypes.map(t => t.name.toUpperCase())];

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
      row.push(people.length > 0 ? people.join(", ") : "-");
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
      fontSize: 9.5,
      cellPadding: { top: 1.2, bottom: 1.2, left: 2, right: 2 },
      lineColor: LINE,
      lineWidth: 0.2,
      valign: "middle",
      halign: "center",
      font: "helvetica",
      minCellHeight: 6.5,
      textColor: GREEN,
    },
    headStyles: {
      fillColor: GREEN,
      textColor: "#FAF9F5",
      fontStyle: "bold",
      fontSize: 10,
      halign: "center",
      cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
    },
    columnStyles: {
      0: { cellWidth: dateColW, fontStyle: "bold", fontSize: 9.5 },
      ...Object.fromEntries(shiftTypes.map((_, i) => [i + 1, { cellWidth: shiftColW, fontStyle: "bold" as const }])),
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
        cell.styles.fillColor = SURFACE;
      } else if (row.index % 2 === 1) {
        cell.styles.fillColor = "#FAFAF7";
      }

      // Empty shift cells: dash in light gray
      if (colIdx >= 1) {
        const t = shiftTypes[colIdx - 1];
        const people = t ? (dateShiftStaff[date]?.[t.id] ?? []) : [];
        if (people.length === 0) {
          cell.styles.textColor = LINE;
          cell.styles.fontStyle = "normal";
        }
      }

      // Weekend date label in red
      if (colIdx === 0 && isWeekend) {
        cell.styles.textColor = "#9E3B2E";
      }
    },
  });

  // ─── Footer ───
  doc.setFontSize(7);
  doc.setTextColor(INK_SOFT);
  doc.setFont("helvetica", "normal");
  doc.text("Documento generato dal Gestionale Le 4 Camere", margin, 292);
  doc.text(`Stampato il ${todayIT()}`, pageW - margin, 292, { align: "right" });

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

// ─── Consent PDF (portrait A4) ───
export interface ConsentPdfData {
  staffName: string;
  hotelName: string;
  hotelAddress: string;
  hotelEmail: string;
  hotelPhone: string;
  consentGiven?: boolean;
  consentDate?: string;
  acceptedVia?: string;
}

export async function generateConsentPdf(entries: ConsentPdfData[]): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const pageH = 297;
  const marginX = 20;
  const marginTop = 25;
  const marginBottom = 20;
  const usableW = pageW - marginX * 2;
  const maxY = pageH - marginBottom;
  const todayStr = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

  const SIGNATURE_BLOCK_HEIGHT = 90;
  const logoPng = await loadLogoPng();

  for (let idx = 0; idx < entries.length; idx++) {
    if (idx > 0) doc.addPage();
    const { staffName, hotelName, hotelAddress, hotelEmail, hotelPhone, consentGiven, consentDate, acceptedVia } = entries[idx];
    let y = marginTop;

    const drawFooter = () => {
      doc.setDrawColor(LINE);
      doc.setLineWidth(0.2);
      const fy = pageH - 14;
      doc.line(marginX, fy, pageW - marginX, fy);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor("#999999");
      doc.text(`Documento generato dal Gestionale Le 4 Camere Hub — Generato il ${todayStr}`, pageW / 2, fy + 5, { align: "center" });
    };

    const checkPage = (needed: number) => {
      if (y + needed > maxY) {
        drawFooter();
        doc.addPage();
        y = marginTop;
      }
    };

    // Header — logo image or text fallback
    if (logoPng) {
      const logoW = 60;
      const logoH = logoW / (1500 / 525);
      doc.addImage(logoPng, "PNG", (pageW - logoW) / 2, y - 5, logoW, logoH);
      y += logoH + 2;
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(GREEN);
      doc.text("LE 4 CAMERE HOTEL ***", pageW / 2, y, { align: "center" });
      y += 7;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(INK_SOFT);
    const addr = hotelAddress && !hotelAddress.startsWith("[") ? hotelAddress : "";
    const email = hotelEmail && !hotelEmail.startsWith("[") ? hotelEmail : "";
    const phone = hotelPhone || "";
    if (addr) { doc.text(addr, pageW / 2, y, { align: "center" }); y += 5; }
    const contactLine = [email, phone].filter(Boolean).join(" — ");
    if (contactLine) { doc.text(contactLine, pageW / 2, y, { align: "center" }); y += 5; }

    // Separator
    y += 3;
    doc.setDrawColor(GOLD);
    doc.setLineWidth(0.6);
    doc.line(marginX, y, pageW - marginX, y);
    y += 8;

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(GREEN);
    doc.text("INFORMATIVA SUL TRATTAMENTO DEI DATI PERSONALI", pageW / 2, y, { align: "center" });
    y += 6;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(INK_SOFT);
    doc.text("ai sensi del Regolamento UE 2016/679 (GDPR)", pageW / 2, y, { align: "center" });
    y += 4;

    doc.setDrawColor(GOLD);
    doc.line(marginX, y, pageW - marginX, y);
    y += 10;

    // Greeting
    const displayName = hotelName && !hotelName.startsWith("[") ? hotelName : "Le 4 Camere Hotel";

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor("#333333");
    doc.text(`Gentile ${staffName},`, marginX, y);
    y += 6;

    const paragraph = (text: string) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor("#333333");
      const lines = doc.splitTextToSize(text, usableW);
      checkPage(lines.length * 4.2 + 3);
      doc.text(lines, marginX, y);
      y += lines.length * 4.2 + 3;
    };

    const section = (num: string, title: string) => {
      checkPage(12);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(GREEN);
      doc.text(`${num}. ${title}`, marginX, y);
      y += 6;
    };

    const bullet = (letter: string, text: string) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor("#333333");
      const lines = doc.splitTextToSize(text, usableW - 10);
      checkPage(lines.length * 4.2 + 2);
      doc.text(`${letter})`, marginX + 2, y);
      doc.text(lines, marginX + 10, y);
      y += lines.length * 4.2 + 1.5;
    };

    const bulletDot = (text: string) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor("#333333");
      const lines = doc.splitTextToSize(text, usableW - 10);
      checkPage(lines.length * 4.2 + 2);
      doc.text("-", marginX + 2, y);
      doc.text(lines, marginX + 10, y);
      y += lines.length * 4.2 + 1.5;
    };

    paragraph(`La informiamo che ${displayName}, in qualita di Titolare del trattamento, tratta i Suoi dati personali nell'ambito del rapporto di lavoro in essere, nel rispetto del Regolamento UE 2016/679 (GDPR) e del D.Lgs. 196/2003 come modificato dal D.Lgs. 101/2018.`);
    y += 2;

    // 1. FINALITÀ
    section("1", "FINALITA DEL TRATTAMENTO");
    paragraph("I Suoi dati personali vengono trattati per le seguenti finalita:");
    bullet("a", "Gestione dei turni di lavoro e delle presenze;");
    bullet("b", "Calcolo delle ore lavorate e delle retribuzioni;");
    bullet("c", "Registrazione delle operazioni di cassa effettuate durante il turno di lavoro;");
    bullet("d", "Gestione del magazzino e dell'inventario;");
    bullet("e", "Gestione delle assenze (ferie, permessi, malattia);");
    bullet("f", "Sicurezza del sistema e tracciamento degli accessi.");
    y += 2;

    // 2. BASE GIURIDICA
    section("2", "BASE GIURIDICA");
    paragraph("Il trattamento e fondato su:");
    bulletDot("Esecuzione del contratto di lavoro (Art. 6.1.b GDPR) per le finalita a), b), e);");
    bulletDot("Adempimento di obblighi legali (Art. 6.1.c GDPR) per la finalita b);");
    bulletDot("Legittimo interesse del Titolare (Art. 6.1.f GDPR) per le finalita c), d), f).");
    y += 2;

    // 3. DATI TRATTATI
    section("3", "DATI TRATTATI");
    paragraph("Nome, cognome, indirizzo email, orari dei turni, presenze, assenze, ore lavorate, operazioni di cassa registrate, movimenti di magazzino, dati di accesso al sistema (data, ora, indirizzo IP).");
    y += 2;

    // 4. CONSERVAZIONE
    section("4", "CONSERVAZIONE");
    paragraph("I dati relativi al rapporto di lavoro vengono conservati per 5 anni dalla cessazione del rapporto, come previsto dalla normativa vigente. I log di accesso vengono conservati per 6 mesi.");
    y += 2;

    // 5. DIRITTI
    section("5", "DIRITTI DELL'INTERESSATO");
    paragraph("Lei ha il diritto di accedere ai Suoi dati, richiederne la rettifica o la cancellazione, limitare il trattamento, opporsi al trattamento fondato sul legittimo interesse, e presentare reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).");
    y += 2;

    // 6. TITOLARE
    section("6", "TITOLARE DEL TRATTAMENTO");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor("#333333");
    doc.text(displayName, marginX, y); y += 4.5;
    if (addr) { doc.text(addr, marginX, y); y += 4.5; }
    if (email) { doc.text(`Email: ${email}`, marginX, y); y += 4.5; }
    if (phone) { doc.text(`Tel: ${phone}`, marginX, y); y += 4.5; }
    y += 4;

    // Signature block — force new page if not enough space
    checkPage(SIGNATURE_BLOCK_HEIGHT);

    // Separator
    doc.setDrawColor(GOLD);
    doc.setLineWidth(0.6);
    doc.line(marginX, y, pageW - marginX, y);
    y += 10;

    if (consentGiven) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor("#2D5A3D");
      doc.text("CONSENSO ACQUISITO", pageW / 2, y, { align: "center" });
      y += 12;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor("#333333");
      doc.text(`Il/La sottoscritto/a ${staffName}`, marginX, y);
      y += 10;

      const declLines = doc.splitTextToSize(
        "dichiara di aver ricevuto, letto e compreso l'informativa sul trattamento dei dati personali di cui sopra.",
        usableW
      );
      doc.text(declLines, marginX, y);
      y += declLines.length * 5 + 10;

      const dateStr = consentDate
        ? new Date(consentDate).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })
        : todayStr;
      doc.text(`Data di accettazione: ${dateStr}`, marginX, y);
      y += 7;

      const viaMap: Record<string, string> = { email: "Email", carta: "Firma cartacea", diretto: "Accettazione diretta" };
      const viaLabel = acceptedVia ? (viaMap[acceptedVia] || acceptedVia) : "N/D";
      doc.text(`Modalita di accettazione: ${viaLabel}`, marginX, y);
      y += 15;

      doc.setFillColor("#E8F5E9");
      doc.setDrawColor("#2D5A3D");
      doc.setLineWidth(0.4);
      doc.roundedRect(marginX, y, usableW, 16, 3, 3, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor("#2D5A3D");
      doc.text("Consenso registrato nel sistema gestionale Le 4 Camere", pageW / 2, y + 9, { align: "center" });
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(GREEN);
      doc.text("DICHIARAZIONE DI PRESA VISIONE", pageW / 2, y, { align: "center" });
      y += 12;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor("#333333");
      doc.text("Il/La sottoscritto/a", marginX, y);
      doc.setDrawColor(LINE);
      doc.setLineWidth(0.3);
      doc.line(marginX + 48, y + 1, pageW - marginX, y + 1);
      y += 10;

      const declLines = doc.splitTextToSize(
        "dichiara di aver ricevuto, letto e compreso l'informativa sul trattamento dei dati personali di cui sopra.",
        usableW
      );
      doc.text(declLines, marginX, y);
      y += declLines.length * 5 + 15;

      doc.text("Data: ____________________", marginX, y);
      y += 15;

      doc.text("Firma: ____________________", marginX, y);
    }

    drawFooter();
  }

  return doc;
}

// ─── My Data PDF (GDPR Art. 15) ───

export interface MyDataPdfInput {
  export_date: string;
  profile: { name: string | null; email: string | null; role: string | null; account_created: string | null };
  staff_info: { name: string; type: string } | null;
  shift_types: { id: string; name: string; start_time: string; end_time: string }[];
  shifts: { shift_date: string; shift_type_id: string }[];
  leaves: { date: string; type: string; period: string; reason: string | null; status: string }[];
  cash_movements: { type: string; amount: number; category: string | null; description: string | null; created_at: string }[];
  availability: { avail_date: string; available: boolean; status?: string }[];
}

export async function generateMyDataPdf(data: MyDataPdfInput): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const marginX = 16;
  const usableW = pageW - marginX * 2;
  const exportDateIT = new Date(data.export_date).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });

  const stMap = new Map(data.shift_types.map(t => [t.id, t]));

  function sectionTitle(doc: jsPDF, title: string, y: number): number {
    doc.setFillColor(GREEN);
    doc.roundedRect(marginX, y, usableW, 8, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor("#FFFFFF");
    doc.text(title.toUpperCase(), marginX + 4, y + 5.5);
    return y + 12;
  }

  function emptyMsg(doc: jsPDF, msg: string, y: number): number {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(INK_SOFT);
    doc.text(msg, marginX + 4, y + 4);
    return y + 10;
  }

  function addFooter(doc: jsPDF) {
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setDrawColor(GOLD);
      doc.setLineWidth(0.3);
      doc.line(marginX, 282, pageW - marginX, 282);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(INK_SOFT);
      doc.text(`Documento generato automaticamente dal Gestionale Le 4 Camere \u2014 Dati aggiornati al ${exportDateIT}`, marginX, 286);
      doc.text(`Pagina ${i} di ${pages}`, pageW - marginX, 286, { align: "right" });
    }
  }

  // ─── Header (titolo a sinistra, logo a destra) ───
  let y = 16;
  const logo = await loadLogoPng();

  // Left side: title + subtitles
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(GREEN);
  doc.text("Esportazione Dati Personali", marginX, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(INK_SOFT);
  doc.text("Art. 15 GDPR \u2014 Diritto di accesso", marginX, y);
  y += 5;
  doc.text(`Data esportazione: ${exportDateIT}`, marginX, y);
  y += 4;

  // Right side: logo
  if (logo) {
    doc.addImage(logo, "PNG", pageW - marginX - 36, 12, 36, 12.5);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(GREEN);
    const logoText = "LE 4 CAMERE HOTEL";
    const starText = "\u2605\u2605\u2605";
    const logoTextW = doc.getTextWidth(logoText);
    doc.text(logoText, pageW - marginX - logoTextW, 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(INK_SOFT);
    const starW = doc.getTextWidth(starText);
    doc.text(starText, pageW - marginX - starW, 23);
  }

  doc.setDrawColor(GOLD);
  doc.setLineWidth(0.5);
  doc.line(marginX, y, pageW - marginX, y);
  y += 6;

  // ─── Profilo ───
  y = sectionTitle(doc, "Profilo", y);

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    tableWidth: usableW,
    head: [["Campo", "Valore"]],
    body: [
      ["Nome", data.profile.name ?? "\u2014"],
      ["Email", data.profile.email ?? "\u2014"],
      ["Ruolo", (data.profile.role ?? "staff").charAt(0).toUpperCase() + (data.profile.role ?? "staff").slice(1)],
      ["Account creato il", data.profile.account_created ? new Date(data.profile.account_created).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }) : "\u2014"],
      ...(data.staff_info ? [["Tipo contratto", data.staff_info.type === "a_chiamata" ? "A chiamata" : "Dipendente"]] : []),
    ],
    styles: { fontSize: 9, cellPadding: 2.5, lineColor: LINE, lineWidth: 0.15, textColor: GREEN, font: "helvetica" },
    headStyles: { fillColor: SURFACE, textColor: GREEN, fontStyle: "bold", fontSize: 8 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 45 } },
    alternateRowStyles: { fillColor: "#FAFAF7" },
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // ─── Turni ───
  y = sectionTitle(doc, "Turni registrati", y);

  if (data.shifts.length === 0) {
    y = emptyMsg(doc, "Nessun turno registrato.", y);
  } else {
    const shiftRows = data.shifts.slice(0, 100).map(s => {
      const st = stMap.get(s.shift_type_id);
      const dateIT = new Date(s.shift_date + "T00:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
      const name = st?.name ?? "\u2014";
      const hours = st ? shiftHoursCalc(st.start_time, st.end_time) : 0;
      const timeRange = st ? `${st.start_time.slice(0, 5)}\u2013${st.end_time.slice(0, 5)}` : "";
      return [dateIT, name, timeRange, hours > 0 ? `${hours}h` : "\u2014"];
    });

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      tableWidth: usableW,
      head: [["Data", "Turno", "Orario", "Ore"]],
      body: shiftRows,
      styles: { fontSize: 8.5, cellPadding: 2, lineColor: LINE, lineWidth: 0.15, textColor: GREEN, font: "helvetica" },
      headStyles: { fillColor: SURFACE, textColor: GREEN, fontStyle: "bold", fontSize: 8 },
      columnStyles: { 0: { cellWidth: 50 }, 3: { halign: "right", cellWidth: 18 } },
      alternateRowStyles: { fillColor: "#FAFAF7" },
    });

    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
    if (data.shifts.length > 100) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(INK_SOFT);
      doc.text(`Mostrati 100 di ${data.shifts.length} turni totali.`, marginX + 4, y);
      y += 4;
    }
    y += 4;
  }

  // ─── Assenze ───
  if (y > 250) { doc.addPage(); y = 16; }
  y = sectionTitle(doc, "Assenze e permessi", y);

  if (data.leaves.length === 0) {
    y = emptyMsg(doc, "Nessuna assenza registrata.", y);
  } else {
    const typeLabels: Record<string, string> = { permesso: "Permesso", ferie: "Ferie", malattia: "Malattia", altro: "Altro" };
    const periodLabels: Record<string, string> = { giornata_intera: "Giornata intera", mattina: "Mattina", pomeriggio: "Pomeriggio" };
    const leaveRows = data.leaves.map(l => [
      new Date(l.date + "T00:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
      typeLabels[l.type] ?? l.type,
      periodLabels[l.period] ?? l.period,
      l.reason ?? "\u2014",
    ]);

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      tableWidth: usableW,
      head: [["Data", "Tipo", "Durata", "Motivo"]],
      body: leaveRows,
      styles: { fontSize: 8.5, cellPadding: 2, lineColor: LINE, lineWidth: 0.15, textColor: GREEN, font: "helvetica" },
      headStyles: { fillColor: SURFACE, textColor: GREEN, fontStyle: "bold", fontSize: 8 },
      columnStyles: { 0: { cellWidth: 48 }, 3: { cellWidth: 50 } },
      alternateRowStyles: { fillColor: "#FAFAF7" },
    });

    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ─── Movimenti Cassa ───
  if (y > 250) { doc.addPage(); y = 16; }
  y = sectionTitle(doc, "Movimenti cassa", y);

  if (data.cash_movements.length === 0) {
    y = emptyMsg(doc, "Nessun movimento cassa registrato.", y);
  } else {
    const cashRows = data.cash_movements.slice(0, 100).map(m => [
      new Date(m.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }),
      m.type === "in" ? "Entrata" : m.type === "out" ? "Uscita" : m.type,
      Number(m.amount).toLocaleString("it-IT", { style: "currency", currency: "EUR" }),
      m.category ?? "\u2014",
      m.description ?? "\u2014",
    ]);

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      tableWidth: usableW,
      head: [["Data", "Tipo", "Importo", "Categoria", "Descrizione"]],
      body: cashRows,
      styles: { fontSize: 8, cellPadding: 2, lineColor: LINE, lineWidth: 0.15, textColor: GREEN, font: "helvetica" },
      headStyles: { fillColor: SURFACE, textColor: GREEN, fontStyle: "bold", fontSize: 8 },
      columnStyles: { 2: { halign: "right", cellWidth: 25 } },
      alternateRowStyles: { fillColor: "#FAFAF7" },
    });

    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
    if (data.cash_movements.length > 100) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(INK_SOFT);
      doc.text(`Mostrati 100 di ${data.cash_movements.length} movimenti totali.`, marginX + 4, y);
      y += 4;
    }
    y += 4;
  }

  // ─── Disponibilita ───
  if (data.availability.length > 0) {
    if (y > 250) { doc.addPage(); y = 16; }
    y = sectionTitle(doc, "Disponibilita inviate", y);

    const availRows = data.availability.slice(0, 100).map(a => [
      new Date(a.avail_date + "T00:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
      a.available ? "Disponibile" : "Non disponibile",
      a.status ?? "\u2014",
    ]);

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      tableWidth: usableW,
      head: [["Data", "Stato", "Dettaglio"]],
      body: availRows,
      styles: { fontSize: 8.5, cellPadding: 2, lineColor: LINE, lineWidth: 0.15, textColor: GREEN, font: "helvetica" },
      headStyles: { fillColor: SURFACE, textColor: GREEN, fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: "#FAFAF7" },
    });
  }

  addFooter(doc);
  return doc;
}
