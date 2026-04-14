import { requestJsonWithRetry, toJsonBody } from "./httpClient";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

function resolveRecipient(to: string): string {
  // In development / Resend sandbox, all emails must go to the verified owner
  // address. Respect TEST_EMAIL_OVERRIDE so the OTP still arrives when testing
  // with real recipients is blocked.
  const override = process.env.TEST_EMAIL_OVERRIDE;
  if (override && override.trim()) {
    return override.trim();
  }
  return to;
}

function consoleFallback(opts: EmailOptions, reason: string): void {
  console.log(`\n📧 [EMAIL FALLBACK — ${reason}]`);
  console.log(`   To:      ${opts.to}`);
  console.log(`   Subject: ${opts.subject}`);
  console.log(`   Body:    ${opts.text ?? "(html only)"}\n`);
}

export async function sendEmail(opts: EmailOptions): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    consoleFallback(opts, "RESEND_API_KEY not set");
    return;
  }

  const from =
    process.env.RESEND_FROM_EMAIL ??
    process.env.SMTP_FROM ??
    "Advan AI <onboarding@resend.dev>";

  const recipient = resolveRecipient(opts.to);

  if (recipient !== opts.to) {
    console.log(`[auth/email] TEST_EMAIL_OVERRIDE active — redirecting OTP email from ${opts.to} → ${recipient}`);
  }

  try {
    const response = await requestJsonWithRetry<{ id?: string }>(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: toJsonBody({
          from,
          to: [recipient],
          subject: opts.subject,
          html: opts.html,
          ...(opts.text ? { text: opts.text } : {}),
        }),
      },
    );

    const id = (response as Record<string, unknown>).id as string | undefined;
    console.log(`[auth/email] OTP email sent via Resend  id=${id ?? "unknown"}  to=${recipient}`);
  } catch (err: unknown) {
    // Resend returns 403 when sending to an unverified domain/address in
    // sandbox mode. Degrade gracefully so registration still succeeds.
    const message = err instanceof Error ? err.message : String(err);
    consoleFallback(opts, `Resend error: ${message}`);
  }
}

export function buildOtpEmailPayload(
  otp: string,
  firstName?: string | null,
): Pick<EmailOptions, "subject" | "html" | "text"> {
  const name = firstName ?? "there";
  return {
    subject: "Verify your Advan AI account",
    text: `Hi ${name},\n\nYour verification code is: ${otp}\n\nThis code expires in 15 minutes.\n\n— Advan AI`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;background:#F9F9FB;">
        <h2 style="font-size:22px;color:#1D1D1F;margin-bottom:8px;">Verify your email</h2>
        <p style="color:#6B7280;font-size:15px;line-height:1.6;">Hi ${name}, use the code below to activate your Advan AI account:</p>
        <div style="margin:32px 0;background:#fff;border:1px solid #E5E7EB;border-radius:16px;padding:32px 24px;text-align:center;">
          <p style="letter-spacing:0.25em;font-size:40px;font-weight:700;color:#1D1D1F;margin:0;font-variant-numeric:tabular-nums;">${otp}</p>
        </div>
        <p style="color:#9CA3AF;font-size:13px;line-height:1.5;">
          This code expires in <strong>15 minutes</strong>. If you didn't create an account, you can safely ignore this email.
        </p>
      </div>
    `,
  };
}
