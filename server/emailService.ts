import nodemailer, { type Transporter } from "nodemailer";
import { ENV } from "./_core/env";

let transporter: Transporter | null | undefined;

/**
 * Returns the SMTP transporter, or null when email is not configured.
 * The transporter is created lazily so tests and SMTP-less deployments
 * never touch network configuration at import time.
 */
export function getEmailTransporter(smtpUrl = ENV.smtpUrl, from = ENV.emailFrom): { transporter: Transporter | null; from: string } {
  if (transporter === undefined) {
    transporter = smtpUrl ? nodemailer.createTransport(smtpUrl) : null;
  }
  return { transporter, from };
}

/** Test-only: reset the cached transporter between cases. */
export function resetEmailTransporter() {
  transporter = undefined;
}

export type EmailResult = "sent" | "suppressed" | "failed";

export async function sendEmail(to: string, subject: string, text: string, deps: { smtpUrl?: string; from?: string } = {}): Promise<EmailResult> {
  const { transporter: mailer, from } = getEmailTransporter(deps.smtpUrl, deps.from);
  if (!mailer || !from) return "suppressed";
  try {
    await mailer.sendMail({ from, to, subject, text });
    return "sent";
  } catch (error) {
    console.error("[Email] Delivery failed:", error);
    return "failed";
  }
}
