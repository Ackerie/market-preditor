// Uses the Replit Resend connector integration via @replit/connectors-sdk.
// The SDK handles identity, token refresh, and auth headers automatically —
// requests are proxied to api.resend.com with credentials injected server-side.
import { logger } from "./logger";

export async function isResendConfigured(): Promise<boolean> {
  return Boolean(process.env.RESEND_API_KEY);
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Send an email via Resend. Returns true on success and false on failure.
 */
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM_EMAIL;

  if (!apiKey || !from) return false;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.warn(
        { status: response.status, body, to: input.to },
        "Resend rejected the email",
      );
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err, to: input.to }, "Failed to send email via Resend");
    return false;
  }
}
