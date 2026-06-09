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

export function credentialsEmailHtml(name: string, email: string, password: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://le4camere-spese.vercel.app";
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
