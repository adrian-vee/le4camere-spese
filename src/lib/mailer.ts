import nodemailer from "nodemailer";

let _transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !user || !pass) return null;

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return _transporter;
}

export function isMailerConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

export async function sendMail(opts: { to: string; subject: string; html: string }): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) return false;

  const from = process.env.SMTP_FROM || `Le 4 Camere <${process.env.SMTP_USER}>`;

  try {
    await transporter.sendMail({ from, to: opts.to, subject: opts.subject, html: opts.html });
    return true;
  } catch (err) {
    console.error("[mailer] Send failed:", err);
    return false;
  }
}

function esc(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function consentEmailHtml(opts: {
  name: string;
  acceptUrl: string;
  privacyUrl: string;
  hotelName: string;
  hotelAddress: string;
  hotelEmail: string;
}): string {
  const name = esc(opts.name);
  const acceptUrl = esc(opts.acceptUrl);
  const privacyUrl = esc(opts.privacyUrl);
  const hotelName = esc(opts.hotelName);
  const hotelAddress = esc(opts.hotelAddress);
  const hotelEmail = esc(opts.hotelEmail);
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAF9F5;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF9F5;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
        <!-- Header -->
        <tr><td style="background:#1F3326;padding:28px 32px;border-radius:12px 12px 0 0;text-align:center">
          <div style="font-size:24px;font-weight:700;color:#FAF9F5;letter-spacing:3px">LE 4 CAMERE HOTEL &#9733;&#9733;&#9733;</div>
          <div style="font-size:11px;letter-spacing:4px;color:#BFA762;margin-top:6px;text-transform:uppercase">GESTIONALE ALBERGHIERO</div>
        </td></tr>
        <!-- Body -->
        <tr><td style="background:#FFFFFF;padding:32px;border-left:1px solid #D8CCB8;border-right:1px solid #D8CCB8">
          <p style="font-size:18px;color:#1F3326;margin:0 0 20px;font-weight:600">Gentile ${name},</p>
          <p style="font-size:15px;color:#333;line-height:1.7;margin:0 0 20px">
            ti informiamo che ${hotelName} utilizza un gestionale digitale per la gestione dei turni, presenze, cassa e magazzino.
          </p>
          <p style="font-size:15px;color:#333;line-height:1.7;margin:0 0 20px">
            Come previsto dal Regolamento UE 2016/679 (GDPR), ti chiediamo di prendere visione della nostra informativa sulla privacy e di confermare la presa visione.
          </p>
          <p style="font-size:15px;color:#1F3326;font-weight:600;margin:0 0 12px">I tuoi dati vengono utilizzati per:</p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px">
            <tr><td style="padding:4px 0;font-size:14px;color:#333;line-height:1.6"><span style="color:#1F3326;font-weight:bold;margin-right:8px">&#8226;</span> Gestione turni e presenze</td></tr>
            <tr><td style="padding:4px 0;font-size:14px;color:#333;line-height:1.6"><span style="color:#1F3326;font-weight:bold;margin-right:8px">&#8226;</span> Calcolo ore lavorate e retribuzioni</td></tr>
            <tr><td style="padding:4px 0;font-size:14px;color:#333;line-height:1.6"><span style="color:#1F3326;font-weight:bold;margin-right:8px">&#8226;</span> Operazioni di cassa durante il tuo turno</td></tr>
            <tr><td style="padding:4px 0;font-size:14px;color:#333;line-height:1.6"><span style="color:#1F3326;font-weight:bold;margin-right:8px">&#8226;</span> Gestione magazzino e inventario</td></tr>
          </table>
          <!-- Read privacy button -->
          <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px">
            <tr><td align="center">
              <a href="${privacyUrl}" style="display:inline-block;padding:14px 28px;background:#FFFFFF;color:#1F3326;font-size:15px;font-weight:600;text-decoration:none;border:2px solid #1F3326;border-radius:8px">
                &#128196; Leggi l&rsquo;informativa completa
              </a>
            </td></tr>
          </table>
          <!-- Confirm button -->
          <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px">
            <tr><td align="center">
              <a href="${acceptUrl}" style="display:inline-block;padding:14px 32px;background:#1F3326;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;min-width:280px;text-align:center">
                &#9989; CONFERMO LA PRESA VISIONE
              </a>
            </td></tr>
          </table>
          <p style="font-size:13px;color:#6C6B5D;line-height:1.6;margin:0;text-align:center">
            Cliccando il bottone confermi di aver preso visione dell&rsquo;informativa privacy.
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#F3EBDD;padding:20px 32px;border-radius:0 0 12px 12px;text-align:center;border:1px solid #D8CCB8;border-top:none">
          <p style="margin:0 0 4px;font-size:13px;color:#6C6B5D;font-weight:600">${hotelName}</p>
          <p style="margin:0 0 8px;font-size:12px;color:#6C6B5D">${hotelAddress}${hotelEmail ? ` &mdash; ${hotelEmail}` : ""}</p>
          <p style="margin:0;font-size:11px;color:#999">
            Questa email &egrave; stata inviata dal Gestionale Le 4 Camere Hub.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/* ── HR Report Email ── */
export type HrDayRow = {
  date: string;        // YYYY-MM-DD
  dayLabel: string;    // "Mar 01/07"
  shiftCode: string;   // "M", "P", "R", "F", "MA", "PE"
  hours: number;
  detail: string;      // "8h (06:30-14:30)" or "Riposo" or "Ferie (8h)"
};
export type HrShiftSummary = { name: string; count: number };
export type HrReportData = {
  staffName: string;
  staffType: string;  // "Dipendente" | "A chiamata"
  contract: string;   // "38h/settimana" or "A chiamata"
  monthLabel: string; // "Luglio 2026"
  days: HrDayRow[];
  shiftSummaries: HrShiftSummary[];
  restDays: number;
  ferieDays: number;
  malattiaDays: number;
  permessoDays: number;
  workedHours: number;
  leaveHours: number;
  totalHours: number;
  isAChiamata: boolean;
  hourlyRate: number;
  amount: number;       // only for a_chiamata
  isUpdate: boolean;
  generatedDate: string; // "25/07/2026"
};

const SHIFT_COLORS: Record<string, string> = {
  M: "#1F3326", P: "#BFA762", R: "#888888", F: "#2563eb", MA: "#d97706", PE: "#7c3aed",
};

export function hrReportEmailHtml(d: HrReportData): string {
  const name = esc(d.staffName);
  const monthLabel = esc(d.monthLabel);

  const dayRows = d.days.map((day, i) => {
    const bg = i % 2 === 0 ? "#FFFFFF" : "#FAF9F5";
    const sc = SHIFT_COLORS[day.shiftCode] || "#333";
    return `<tr style="background:${bg}">
      <td style="padding:8px 12px;border-bottom:1px solid #E8E4DC;font-size:13px;color:#333">${esc(day.dayLabel)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E8E4DC;text-align:center;font-weight:700;color:${sc};font-size:13px">${esc(day.shiftCode)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E8E4DC;font-size:13px;color:#333">${esc(day.detail)}</td>
    </tr>`;
  }).join("");

  const shiftRows = d.shiftSummaries.map(s =>
    `<tr><td style="padding:6px 0;font-size:14px;color:#333">Turni ${esc(s.name)}:</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#1F3326;text-align:right">${s.count} giorni</td></tr>`
  ).join("");

  const compensoBlock = d.isAChiamata ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#1F3326;border-radius:10px;margin-top:20px">
      <tr><td style="padding:20px 24px">
        <div style="font-size:12px;letter-spacing:2px;color:#BFA762;font-weight:700;text-transform:uppercase;margin-bottom:12px">COMPENSO</div>
        <div style="font-size:14px;color:#FAF9F5;margin-bottom:8px">Ore lavorate: ${d.workedHours}h &times; &euro;${d.hourlyRate.toFixed(2)}/h = &euro;${d.amount.toFixed(2)}</div>
        <div style="border-top:1px solid rgba(250,249,245,.2);padding-top:12px;margin-top:8px">
          <div style="font-size:22px;font-weight:700;color:#BFA762">TOTALE DA CORRISPONDERE: &euro;${d.amount.toFixed(2)}</div>
        </div>
      </td></tr>
    </table>` : "";

  const updateBanner = d.isUpdate ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px">
      <tr><td style="background:#FFF8F0;border:1px solid #C77B4A;border-radius:8px;padding:14px 20px;text-align:center">
        <span style="font-size:14px;font-weight:700;color:#C77B4A">&#9888;&#65039; AGGIORNAMENTO &mdash; Questo report sostituisce il precedente</span>
      </td></tr>
    </table>` : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAF9F5;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF9F5;padding:32px 16px">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%">
        <!-- Header -->
        <tr><td style="background:#1F3326;padding:28px 32px;border-radius:12px 12px 0 0;text-align:center">
          <div style="font-size:24px;font-weight:700;color:#FAF9F5;letter-spacing:3px">LE 4 CAMERE</div>
          <div style="font-size:14px;color:#FAF9F5;margin-top:4px">HOTEL &#9733;&#9733;&#9733;</div>
          <div style="font-size:11px;letter-spacing:4px;color:#BFA762;margin-top:6px;text-transform:uppercase">GESTIONALE ALBERGHIERO</div>
        </td></tr>
        <!-- Body -->
        <tr><td style="background:#FFFFFF;padding:32px;border-left:1px solid #D8CCB8;border-right:1px solid #D8CCB8">
          ${updateBanner}
          <div style="font-size:22px;font-weight:700;color:#1F3326;margin-bottom:20px">Report Ore &mdash; ${monthLabel}</div>
          <table cellpadding="0" cellspacing="0" style="margin-bottom:24px">
            <tr><td style="padding:4px 0;font-size:14px;color:#6C6B5D">Persona:</td><td style="padding:4px 0 4px 12px;font-size:14px;font-weight:700;color:#1F3326">${name}</td></tr>
            <tr><td style="padding:4px 0;font-size:14px;color:#6C6B5D">Tipo:</td><td style="padding:4px 0 4px 12px;font-size:14px;font-weight:600;color:#1F3326">${esc(d.staffType)}</td></tr>
            <tr><td style="padding:4px 0;font-size:14px;color:#6C6B5D">Contratto:</td><td style="padding:4px 0 4px 12px;font-size:14px;color:#1F3326">${esc(d.contract)}</td></tr>
          </table>

          <!-- Day table -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #D8CCB8;border-radius:8px;overflow:hidden;margin-bottom:24px">
            <thead>
              <tr style="background:#F3EBDD">
                <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:#1F3326;text-transform:uppercase;letter-spacing:1px">Data</th>
                <th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:700;color:#1F3326;text-transform:uppercase;letter-spacing:1px">Turno</th>
                <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:#1F3326;text-transform:uppercase;letter-spacing:1px">Ore</th>
              </tr>
            </thead>
            <tbody>${dayRows}</tbody>
          </table>

          <!-- Summary -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3EBDD;border:1px solid #D8CCB8;border-radius:10px;padding:20px">
            <tr><td style="padding:20px 24px">
              <div style="font-size:12px;letter-spacing:2px;color:#6C6B5D;font-weight:700;text-transform:uppercase;margin-bottom:14px">RIEPILOGO</div>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${shiftRows}
                <tr><td style="padding:6px 0;font-size:14px;color:#333">Riposi:</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#1F3326;text-align:right">${d.restDays} giorni</td></tr>
                ${d.ferieDays > 0 ? `<tr><td style="padding:6px 0;font-size:14px;color:#2563eb">Ferie:</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#2563eb;text-align:right">${d.ferieDays} giorni (${d.ferieDays * 8}h)</td></tr>` : ""}
                ${d.malattiaDays > 0 ? `<tr><td style="padding:6px 0;font-size:14px;color:#d97706">Malattia:</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#d97706;text-align:right">${d.malattiaDays} giorni (${d.malattiaDays * 8}h)</td></tr>` : ""}
                ${d.permessoDays > 0 ? `<tr><td style="padding:6px 0;font-size:14px;color:#7c3aed">Permessi:</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#7c3aed;text-align:right">${d.permessoDays} giorni (${d.permessoDays * 8}h)</td></tr>` : ""}
                <tr><td colspan="2" style="border-top:1px solid #D8CCB8;padding-top:10px;margin-top:6px"></td></tr>
                <tr><td style="padding:6px 0;font-size:15px;font-weight:700;color:#1F3326">ORE LAVORATE:</td><td style="padding:6px 0;font-size:15px;font-weight:700;color:#1F3326;text-align:right">${d.workedHours}h</td></tr>
                ${d.leaveHours > 0 ? `<tr><td style="padding:6px 0;font-size:15px;font-weight:700;color:#2563eb">ORE FERIE/PERMESSI:</td><td style="padding:6px 0;font-size:15px;font-weight:700;color:#2563eb;text-align:right">${d.leaveHours}h</td></tr>` : ""}
                <tr><td style="padding:6px 0;font-size:17px;font-weight:700;color:#1F3326">ORE TOTALI:</td><td style="padding:6px 0;font-size:17px;font-weight:700;color:#1F3326;text-align:right">${d.totalHours}h</td></tr>
              </table>
            </td></tr>
          </table>
          ${compensoBlock}
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#F3EBDD;padding:24px 32px;border-radius:0 0 12px 12px;text-align:center;border:1px solid #D8CCB8;border-top:none">
          <p style="margin:0 0 4px;font-size:13px;color:#6C6B5D;font-weight:600">Le 4 Camere Hotel &#9733;&#9733;&#9733;</p>
          <p style="margin:0 0 8px;font-size:12px;color:#6C6B5D">Roverchiara, Verona</p>
          <p style="margin:0 0 4px;font-size:11px;color:#999">Report generato automaticamente il ${esc(d.generatedDate)}</p>
          <p style="margin:0;font-size:11px;color:#999">www.le4camere.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function credentialsEmailHtml(rawName: string, rawEmail: string, rawPassword: string): string {
  const appUrl = esc(process.env.NEXT_PUBLIC_APP_URL || "https://my.le4camere.com");
  const name = esc(rawName);
  const email = esc(rawEmail);
  const password = esc(rawPassword);
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAF9F5;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF9F5;padding:32px 0">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%">
        <tr><td style="background:#1F3326;padding:28px 32px;border-radius:12px 12px 0 0;text-align:center">
          <div style="font-size:24px;font-weight:700;color:#FAF9F5;letter-spacing:3px">LE 4 CAMERE</div>
          <div style="font-size:11px;letter-spacing:4px;color:#BFA762;margin-top:4px;text-transform:uppercase">GESTIONALE ALBERGHIERO</div>
        </td></tr>
        <tr><td style="background:#FFFFFF;padding:32px;border-left:1px solid #D8CCB8;border-right:1px solid #D8CCB8">
          <p style="font-size:16px;color:#1F3326;margin:0 0 20px">Ciao <strong>${name}</strong>,</p>
          <p style="font-size:14px;color:#6C6B5D;line-height:1.6;margin:0 0 24px">
            Ti diamo il benvenuto nel gestionale di Le 4 Camere!<br>
            Ecco le tue credenziali di accesso:
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3EBDD;border-radius:10px">
            <tr><td style="padding:20px">
              <p style="margin:0 0 12px;font-size:14px;color:#6C6B5D">
                <strong>Link:</strong> <a href="${appUrl}" style="color:#1F3326;font-weight:700">${appUrl}</a>
              </p>
              <p style="margin:0 0 12px;font-size:14px;color:#6C6B5D">
                <strong>Email:</strong> <span style="color:#1F3326;font-weight:700">${email}</span>
              </p>
              <p style="margin:0;font-size:14px;color:#6C6B5D">
                <strong>Password:</strong> <span style="color:#1F3326;font-weight:700">${password}</span>
              </p>
            </td></tr>
          </table>
          <p style="font-size:13px;color:#C77B4A;line-height:1.5;margin:16px 0 0;padding:12px 16px;background:#FFF8F0;border-radius:8px;border-left:3px solid #C77B4A">
            Ti verr&agrave; chiesto di cambiare la password al primo accesso.
          </p>
        </td></tr>
        <tr><td style="background:#F3EBDD;padding:20px 32px;border-radius:0 0 12px 12px;text-align:center;border:1px solid #D8CCB8;border-top:none">
          <p style="margin:0;font-size:12px;color:#6C6B5D">
            Le 4 Camere Hotel &mdash; Gestionale Alberghiero
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
