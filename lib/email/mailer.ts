import nodemailer from "nodemailer";

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const fromEmail = process.env.SMTP_FROM_EMAIL;
  const fromName = process.env.SMTP_FROM_NAME ?? "APEX Learning";
  if (!host || !user || !pass || !fromEmail) {
    throw new Error(
      "SMTP env belum lengkap. Wajib: SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL.",
    );
  }
  return { host, port, user, pass, fromEmail, fromName };
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  const cfg = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  await transporter.sendMail({
    from: `${cfg.fromName} <${cfg.fromEmail}>`,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}

