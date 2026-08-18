import "server-only";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
};

export type SendEmailResult =
  | { ok: true; id: string; provider: "resend" | "console" }
  | { ok: false; error: string };

/**
 * Envoi email via Resend (RESEND_API_KEY) ou log console en dev.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = input.from ?? process.env.EMAIL_FROM?.trim() ?? "Soline <noreply@solinebtp.fr>";

  if (!apiKey) {
    console.info("[email:console]", {
      to: input.to,
      subject: input.subject,
      preview: input.text ?? input.html.slice(0, 200),
    });
    return { ok: true, id: `console-${Date.now()}`, provider: "console" };
  }

  const res = await fetch("https://api.resend.com/emails", {
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

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `resend_${res.status}:${body.slice(0, 200)}` };
  }

  const data = (await res.json()) as { id?: string };
  return { ok: true, id: data.id ?? "unknown", provider: "resend" };
}
