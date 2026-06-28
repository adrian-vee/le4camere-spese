import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const GREEN = "#1F3326";
const GOLD = "#BFA762";
const LINE = "#D8CCB8";

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
  } catch { return null; }
}

function pdfHeader(doc: jsPDF, logo: string | null, title: string): number {
  let y = 16;
  if (logo) { doc.addImage(logo, "PNG", 14, y, 50, 17); y += 22; }
  else { doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(GREEN); doc.text("LE 4 CAMERE HOTEL", 14, y + 10); y += 18; }
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor("#6C6B5D");
  doc.text("Gestionale Alberghiero", 14, y); y += 10;
  doc.setDrawColor(LINE); doc.line(14, y, 196, y); y += 8;
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(GREEN);
  doc.text(title, 14, y); y += 10;
  return y;
}

function drawRatingDots(doc: jsPDF, x: number, y: number, rating: number) {
  for (let i = 0; i < 5; i++) {
    const cx = x + i * 5.5;
    if (i < rating) {
      doc.setFillColor(GOLD);
      doc.circle(cx, y, 1.8, "F");
    } else {
      doc.setDrawColor(LINE);
      doc.circle(cx, y, 1.8, "S");
    }
  }
}

type DocCheck = { key: string; label: string; checked: boolean; notes: string };
type FollowUp = { date: string; notes: string };

export interface RecruitmentCandidate {
  id: string; first_name: string; last_name: string; birth_date: string | null;
  residence: string | null; phone: string | null; email: string | null;
  has_car: boolean; distance_km: number | null;
  position_applied: string | null; experience: string | null; experience_details: string | null; languages: string | null;
  availability: string | null; employment_type_sought: string | null; can_start_date: string | null;
  interview_notes: string | null; strengths: string | null; weaknesses: string | null; rating: number | null;
  privacy_consent: boolean; outcome: string;
  converted: boolean; converted_to: string | null; converted_at: string | null;
  onboarding_process_id: string | null;
  documents_checklist: DocCheck[];
  follow_up_interviews: FollowUp[];
  evaluation_score?: number | null;
  evaluation_breakdown?: ScoreBreakdown[] | null;
  created_at: string;
}

/* ── Privacy Form PDF ── */
export async function generatePrivacyFormPdf(candidate: RecruitmentCandidate, privacyText: string) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const logo = await loadLogoPng();
  let y = pdfHeader(doc, logo, "Informativa e consenso al trattamento dei dati personali");

  y += 4;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor("#333");
  const text = privacyText || "Testo informativa da configurare nelle impostazioni.";
  const lines = doc.splitTextToSize(text, 172);
  doc.text(lines, 14, y);
  y += lines.length * 5 + 10;

  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(GREEN);
  doc.text("Dati del candidato", 14, y); y += 7;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor("#333");
  doc.text(`Nome: ${candidate.first_name} ${candidate.last_name}`, 14, y); y += 6;
  if (candidate.birth_date) { doc.text(`Data di nascita: ${new Date(candidate.birth_date).toLocaleDateString("it-IT")}`, 14, y); y += 6; }
  if (candidate.residence) { doc.text(`Residenza: ${candidate.residence}`, 14, y); y += 6; }
  if (candidate.position_applied) { doc.text(`Posizione: ${candidate.position_applied}`, 14, y); y += 6; }
  y += 10;

  doc.setDrawColor(LINE);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text("Il/La sottoscritto/a dichiara di aver letto e compreso l'informativa sulla privacy", 14, y);
  y += 6;
  doc.text("e acconsente al trattamento dei propri dati personali per le finalita' indicate.", 14, y);
  y += 16;

  doc.text(`Data: ${todayIT()}`, 14, y);
  doc.text("Firma: ____________________________________", 100, y);
  y += 20;
  doc.setDrawColor(LINE); doc.line(100, y - 4, 190, y - 4);

  doc.save(`modulo-privacy-${candidate.last_name.toLowerCase()}-${candidate.first_name.toLowerCase()}.pdf`);
}

/* ── Summary PDF ── */
export async function generateSummaryPdf(candidate: RecruitmentCandidate) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const logo = await loadLogoPng();
  const c = candidate;
  let y = pdfHeader(doc, logo, `Riepilogo colloquio - ${c.first_name} ${c.last_name}`);

  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor("#6C6B5D");
  doc.text(`Data colloquio: ${new Date(c.created_at).toLocaleDateString("it-IT")}  |  Generato il: ${todayIT()}`, 14, y);
  y += 8;

  const OUTCOME_MAP: Record<string, string> = { da_richiamare: "Da richiamare", in_valutazione: "In valutazione", idoneo: "Idoneo", non_idoneo: "Non idoneo" };

  /* Section 1: Anagrafici */
  autoTable(doc, {
    startY: y,
    head: [["DATI ANAGRAFICI", ""]],
    body: [
      ["Nome", `${c.first_name} ${c.last_name}`],
      ["Data di nascita", c.birth_date ? new Date(c.birth_date).toLocaleDateString("it-IT") : "-"],
      ["Residenza", c.residence || "-"],
      ["Telefono", c.phone || "-"],
      ["Email", c.email || "-"],
      ["Automunito/a", c.has_car ? "Si" : "No"],
      ["Distanza dall'hotel", c.distance_km != null ? `${c.distance_km} km` : "-"],
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [31, 51, 38], textColor: [250, 249, 245], fontStyle: "bold" },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 50 } },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  /* Section 2: Esperienza */
  autoTable(doc, {
    startY: y,
    head: [["ESPERIENZA E PROFILO", ""]],
    body: [
      ["Posizione", c.position_applied || "-"],
      ["Tipo contratto/impiego", c.employment_type_sought || "-"],
      ["Esperienza", c.experience || "-"],
      ["Dettaglio esperienza", c.experience_details || "-"],
      ["Lingue", c.languages || "-"],
      ["Disponibilita' oraria/turni", c.availability || "-"],
      ["Disponibile dal", c.can_start_date ? new Date(c.can_start_date).toLocaleDateString("it-IT") : "-"],
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [31, 51, 38], textColor: [250, 249, 245] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 50 } },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  /* Section 3: Valutazione */
  const ratingStr = c.rating ? `${c.rating}/5` : "Non valutato";
  autoTable(doc, {
    startY: y,
    head: [["VALUTAZIONE COLLOQUIO", ""]],
    body: [
      ["Rating", ratingStr],
      ["Note colloquio", c.interview_notes || "-"],
      ["Punti di forza", c.strengths || "-"],
      ["Punti deboli", c.weaknesses || "-"],
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [31, 51, 38], textColor: [250, 249, 245] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 50 } },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2;

  if (c.rating && c.rating > 0) {
    drawRatingDots(doc, 66, y, c.rating);
    y += 6;
  }
  y += 4;

  /* Follow-up interviews */
  if (c.follow_up_interviews.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["COLLOQUI SUCCESSIVI", ""]],
      body: c.follow_up_interviews.map(fi => [
        new Date(fi.date).toLocaleDateString("it-IT"),
        fi.notes || "-",
      ]),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [31, 51, 38], textColor: [250, 249, 245] },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 50 } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  /* Section 4: Documenti (info only, not scored) */
  if (c.documents_checklist.length > 0) {
    const docChecked = c.documents_checklist.filter(d => d.checked);
    const docMissing = c.documents_checklist.filter(d => !d.checked);
    autoTable(doc, {
      startY: y,
      head: [["DOCUMENTI (informativo)", "Stato", "Note"]],
      body: [
        ...docChecked.map(d => [d.label, "Presente", d.notes || ""]),
        ...docMissing.map(d => [d.label, "Mancante", d.notes || ""]),
      ],
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [31, 51, 38], textColor: [250, 249, 245] },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 55 }, 1: { cellWidth: 30 } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  /* Section 5: Esito */
  autoTable(doc, {
    startY: y,
    head: [["ESITO", ""]],
    body: [
      ["Stato", OUTCOME_MAP[c.outcome] || c.outcome],
      ...(c.converted ? [
        ["Convertito in", c.converted_to === "dipendente" ? "Dipendente" : "A chiamata"],
        ["Data conversione", c.converted_at ? new Date(c.converted_at).toLocaleDateString("it-IT") : "-"],
        ["ID processo", c.onboarding_process_id || "-"],
      ] : []),
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [31, 51, 38], textColor: [250, 249, 245] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 50 } },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  /* ── Support Evaluation ── */
  if (y > 230) { doc.addPage(); y = 20; }

  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(GREEN);
  doc.text("Valutazione di supporto alla decisione", 14, y); y += 5;
  doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor("#6C6B5D");
  doc.text("Indicazione automatica basata sui dati inseriti. La decisione finale spetta al responsabile.", 14, y); y += 8;

  const score = computeScore(c);

  autoTable(doc, {
    startY: y,
    head: [["Criterio", "Valore rilevato", "Punteggio", "Peso", "Come si calcola"]],
    body: score.breakdown.map(b => [b.label, b.value, `${b.points}/${b.max}`, b.weight, b.hint]),
    foot: [["TOTALE", "", `${score.total}/100`, "100%", ""]],
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [191, 167, 98], textColor: [31, 51, 38], fontStyle: "bold" },
    footStyles: { fillColor: [243, 235, 221], fontStyle: "bold", textColor: [31, 51, 38] },
    columnStyles: { 4: { cellWidth: 52, fontSize: 7, textColor: [108, 107, 93] } },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(GOLD);
  doc.text(`Punteggio: ${score.total}/100`, 14, y);

  if (c.rating && c.rating > 0) {
    drawRatingDots(doc, 70, y - 1, c.rating);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor("#6C6B5D");
    doc.text(`(${c.rating}/5)`, 100, y);
  }
  y += 7;

  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor("#333");
  doc.text(score.summary, 14, y);

  doc.save(`riepilogo-colloquio-${c.last_name.toLowerCase()}-${c.first_name.toLowerCase()}.pdf`);
}

/* ── Score computation ── */
export interface ScoreBreakdown { label: string; value: string; points: number; max: number; weight: string; hint: string; note?: string }

export function computeScore(c: RecruitmentCandidate): { total: number; breakdown: ScoreBreakdown[]; summary: string } {
  const breakdown: ScoreBreakdown[] = [];

  // 1. Rating colloquio — 40%
  const ratingMax = 40;
  const ratingPts = c.rating ? Math.round((c.rating / 5) * ratingMax) : 0;
  breakdown.push({
    label: "Rating colloquio",
    value: c.rating ? `${c.rating}/5` : "N/D",
    points: ratingPts,
    max: ratingMax,
    weight: "40%",
    hint: "Stelle assegnate / 5, proporzionale. Es: 4/5 = 32/40, 3/5 = 24/40.",
  });

  // 2. Esperienza — 25% (based on structured chip field only)
  const expMax = 25;
  const EXP_SCORES: Record<string, number> = {
    "5+ anni": 1,
    "3-5 anni": 0.8,
    "1-2 anni": 0.5,
    "Nessuna": 0,
  };
  const expLevel = (c.experience || "").trim();
  const expFraction = EXP_SCORES[expLevel];
  const expPts = expFraction != null ? Math.round(expMax * expFraction) : 0;
  breakdown.push({
    label: "Esperienza",
    value: expLevel || "N/D",
    points: expPts,
    max: expMax,
    weight: "25%",
    hint: "5+ anni = 25, 3-5 anni = 20, 1-2 anni = 13, Nessuna = 0.",
  });

  // 3. Disponibilita' — 20%
  const availMax = 20;
  let availPts = 0;
  const avail = (c.availability || "").toLowerCase();
  if (avail) {
    const items = avail.split(",").map(s => s.trim()).filter(Boolean);
    if (items.some(i => i === "flessibile")) {
      availPts = availMax;
    } else if (items.length >= 4) {
      availPts = availMax;
    } else if (items.length === 3) {
      availPts = Math.round(availMax * 0.8);
    } else if (items.length === 2) {
      availPts = Math.round(availMax * 0.6);
    } else if (items.length === 1) {
      availPts = Math.round(availMax * 0.4);
    }
  }
  breakdown.push({
    label: "Disponibilita' turni",
    value: c.availability || "N/D",
    points: availPts,
    max: availMax,
    weight: "20%",
    hint: "Flessibile o 4+ turni = 20, 3 = 16, 2 = 12, 1 = 8, nessuno = 0.",
  });

  // 4. Automunito — 10%
  const carMax = 10;
  const carPts = c.has_car ? carMax : 0;
  breakdown.push({
    label: "Automunito",
    value: c.has_car ? "Si" : "No",
    points: carPts,
    max: carMax,
    weight: "10%",
    hint: "Si = 10, No = 0.",
  });

  // 5. Distanza — 5%
  const distMax = 5;
  let distPts: number;
  if (c.distance_km == null) {
    distPts = Math.round(distMax * 0.5);
  } else if (c.distance_km <= 20) {
    distPts = distMax;
  } else if (c.distance_km <= 40) {
    distPts = Math.round(distMax * 0.5);
  } else {
    distPts = Math.round(distMax * 0.2);
  }
  breakdown.push({
    label: "Distanza hotel",
    value: c.distance_km != null ? `${c.distance_km} km` : "N/D",
    points: distPts,
    max: distMax,
    weight: "5%",
    hint: "0-20 km = 5, 21-40 km = 3, 40+ km = 1, non inserito = 3 (neutro).",
  });

  const total = breakdown.reduce((s, b) => s + b.points, 0);

  let summary: string;
  if (total >= 85) summary = `Profilo molto forte (${total}/100). Tutti i criteri principali sono ampiamente soddisfatti.`;
  else if (total >= 70) summary = `Buon profilo (${total}/100). La maggior parte dei criteri e' soddisfatta; verificare i punti con punteggio basso.`;
  else if (total >= 55) summary = `Profilo discreto (${total}/100). Alcuni aspetti richiedono attenzione; valutare se compensati da altri fattori.`;
  else summary = `Profilo debole (${total}/100). Diversi criteri non soddisfatti; la decisione richiede una valutazione attenta del responsabile.`;

  return { total, breakdown, summary };
}
