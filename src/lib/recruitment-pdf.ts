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

type DocCheck = { key: string; label: string; checked: boolean; notes: string };
type FollowUp = { date: string; notes: string };

export interface RecruitmentCandidate {
  id: string; first_name: string; last_name: string; birth_date: string | null;
  residence: string | null; phone: string | null; email: string | null;
  has_car: boolean; distance_km: number | null;
  position_applied: string | null; experience: string | null; languages: string | null;
  availability: string | null; employment_type_sought: string | null; can_start_date: string | null;
  interview_notes: string | null; strengths: string | null; weaknesses: string | null; rating: number | null;
  privacy_consent: boolean; outcome: string;
  converted: boolean; converted_to: string | null; converted_at: string | null;
  onboarding_process_id: string | null;
  documents_checklist: DocCheck[];
  follow_up_interviews: FollowUp[];
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
  doc.text("e acconsente al trattamento dei propri dati personali per le finalità indicate.", 14, y);
  y += 16;

  doc.text(`Data: ${todayIT()}`, 14, y);
  doc.text("Firma: ____________________________________", 100, y);
  y += 20;
  doc.setDrawColor(LINE); doc.line(100, y - 4, 190, y - 4);

  doc.save(`modulo-privacy-${candidate.last_name.toLowerCase()}-${candidate.first_name.toLowerCase()}.pdf`);
}

/* ── Summary PDF with support evaluation ── */
export async function generateSummaryPdf(candidate: RecruitmentCandidate) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const logo = await loadLogoPng();
  const c = candidate;
  let y = pdfHeader(doc, logo, `Riepilogo colloquio — ${c.first_name} ${c.last_name}`);

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
      ["Data di nascita", c.birth_date ? new Date(c.birth_date).toLocaleDateString("it-IT") : "—"],
      ["Residenza", c.residence || "—"],
      ["Telefono", c.phone || "—"],
      ["Email", c.email || "—"],
      ["Automunito/a", c.has_car ? "Sì" : "No"],
      ["Distanza dall'hotel", c.distance_km ? `${c.distance_km} km` : "—"],
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
      ["Posizione", c.position_applied || "—"],
      ["Tipo impiego", c.employment_type_sought || "—"],
      ["Esperienza", c.experience || "—"],
      ["Lingue", c.languages || "—"],
      ["Disponibilità", c.availability || "—"],
      ["Data inizio", c.can_start_date ? new Date(c.can_start_date).toLocaleDateString("it-IT") : "—"],
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [31, 51, 38], textColor: [250, 249, 245] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 50 } },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  /* Section 3: Valutazione */
  const starStr = c.rating ? "★".repeat(c.rating) + "☆".repeat(5 - c.rating) + ` (${c.rating}/5)` : "Non valutato";
  autoTable(doc, {
    startY: y,
    head: [["VALUTAZIONE COLLOQUIO", ""]],
    body: [
      ["Rating", starStr],
      ["Note colloquio", c.interview_notes || "—"],
      ["Punti di forza", c.strengths || "—"],
      ["Punti deboli", c.weaknesses || "—"],
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [31, 51, 38], textColor: [250, 249, 245] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 50 } },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  /* Follow-up interviews */
  if (c.follow_up_interviews.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["COLLOQUI SUCCESSIVI", ""]],
      body: c.follow_up_interviews.map(fi => [
        new Date(fi.date).toLocaleDateString("it-IT"),
        fi.notes || "—",
      ]),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [31, 51, 38], textColor: [250, 249, 245] },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 50 } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  /* Section 4: Documenti */
  if (c.documents_checklist.length > 0) {
    const docChecked = c.documents_checklist.filter(d => d.checked);
    const docMissing = c.documents_checklist.filter(d => !d.checked);
    autoTable(doc, {
      startY: y,
      head: [["DOCUMENTI", "Stato", "Note"]],
      body: [
        ...docChecked.map(d => [d.label, "✓ Presente", d.notes || ""]),
        ...docMissing.map(d => [d.label, "✗ Mancante", d.notes || ""]),
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
        ["Data conversione", c.converted_at ? new Date(c.converted_at).toLocaleDateString("it-IT") : "—"],
        ["ID processo", c.onboarding_process_id || "—"],
      ] : []),
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [31, 51, 38], textColor: [250, 249, 245] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 50 } },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  /* ── Support Evaluation ── */
  if (y > 240) { doc.addPage(); y = 20; }

  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(GREEN);
  doc.text("Valutazione di supporto alla decisione", 14, y); y += 5;
  doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor("#6C6B5D");
  doc.text("Indicazione automatica basata sui dati inseriti. La decisione finale spetta al responsabile.", 14, y); y += 8;

  const score = computeScore(c);

  autoTable(doc, {
    startY: y,
    head: [["Criterio", "Valore", "Punti", "Peso"]],
    body: score.breakdown.map(b => [b.label, b.value, `${b.points}/${b.max}`, b.weight]),
    foot: [["TOTALE", "", `${score.total}/100`, ""]],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [191, 167, 98], textColor: [31, 51, 38], fontStyle: "bold" },
    footStyles: { fillColor: [243, 235, 221], fontStyle: "bold", textColor: [31, 51, 38] },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  const stars = Math.round(score.total / 20);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(GOLD);
  doc.text(`Punteggio: ${score.total}/100  (${"★".repeat(stars)}${"☆".repeat(5 - stars)})`, 14, y); y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor("#333");
  doc.text(score.summary, 14, y);

  doc.save(`riepilogo-colloquio-${c.last_name.toLowerCase()}-${c.first_name.toLowerCase()}.pdf`);
}

/* ── Score computation ── */
interface ScoreBreakdown { label: string; value: string; points: number; max: number; weight: string }

export function computeScore(c: RecruitmentCandidate): { total: number; breakdown: ScoreBreakdown[]; summary: string } {
  const breakdown: ScoreBreakdown[] = [];

  const ratingPts = c.rating ? Math.round((c.rating / 5) * 35) : 0;
  breakdown.push({ label: "Rating colloquio", value: c.rating ? `${c.rating}/5` : "N/D", points: ratingPts, max: 35, weight: "35%" });

  let expPts = 0;
  const exp = (c.experience || "").toLowerCase();
  if (exp.includes("5+") || exp.includes("5 anni") || exp.includes("oltre")) expPts = 20;
  else if (exp.includes("3-5") || exp.includes("3 anni") || exp.includes("4 anni")) expPts = 15;
  else if (exp.includes("1-2") || exp.includes("1 anno") || exp.includes("2 anni")) expPts = 10;
  else if (exp.length > 5) expPts = 8;
  breakdown.push({ label: "Esperienza", value: exp ? exp.substring(0, 30) : "N/D", points: expPts, max: 20, weight: "20%" });

  const carPts = c.has_car ? 10 : 0;
  breakdown.push({ label: "Automunito", value: c.has_car ? "Sì" : "No", points: carPts, max: 10, weight: "10%" });

  let availPts = 0;
  const avail = (c.availability || "").toLowerCase();
  if (avail.includes("full-time") || avail.includes("full time")) availPts = 15;
  else if (avail.includes("part-time") || avail.length > 3) availPts = 10;
  breakdown.push({ label: "Disponibilità", value: c.availability || "N/D", points: availPts, max: 15, weight: "15%" });

  let distPts = 10;
  if (c.distance_km !== null) {
    if (c.distance_km > 50) distPts = 2;
    else if (c.distance_km > 30) distPts = 5;
    else if (c.distance_km > 15) distPts = 7;
  }
  breakdown.push({ label: "Distanza hotel", value: c.distance_km !== null ? `${c.distance_km} km` : "N/D", points: distPts, max: 10, weight: "10%" });

  const checklist = c.documents_checklist || [];
  const totalDocs = checklist.length || 1;
  const checkedDocs = checklist.filter((d: DocCheck) => d.checked).length;
  const docPts = Math.round((checkedDocs / totalDocs) * 10);
  breakdown.push({ label: "Documenti", value: `${checkedDocs}/${totalDocs}`, points: docPts, max: 10, weight: "10%" });

  const total = breakdown.reduce((s, b) => s + b.points, 0);

  let summary = "";
  if (total >= 80) summary = "Profilo molto forte. Tutti i criteri principali sono soddisfatti.";
  else if (total >= 60) summary = "Buon profilo complessivo con alcuni aspetti migliorabili.";
  else if (total >= 40) summary = "Profilo nella media. Valutare attentamente i punti deboli.";
  else summary = "Profilo con criticità significative. Richiede approfondimento.";

  return { total, breakdown, summary };
}
