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

export function consentEmailHtml(opts: {
  name: string;
  acceptUrl: string;
  privacyUrl: string;
  hotelName: string;
  hotelAddress: string;
  hotelEmail: string;
}): string {
  const { name, acceptUrl, privacyUrl, hotelName, hotelAddress, hotelEmail } = opts;
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
              <a href="${acceptUrl}" style="display:inline-block;padding:16px 40px;background:#1F3326;color:#FFFFFF;font-size:18px;font-weight:700;text-decoration:none;border-radius:8px">
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

export function credentialsEmailHtml(name: string, email: string, password: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://my.le4camere.com";
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
