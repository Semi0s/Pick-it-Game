import "server-only";

type TransactionalEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

const RESEND_API_URL = "https://api.resend.com/emails";

export async function sendTransactionalEmail(input: TransactionalEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    throw new Error("Missing email delivery configuration. Set RESEND_API_KEY and EMAIL_FROM.");
  }

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      reply_to: input.replyTo
    })
  });

  const result = (await response.json().catch(() => null)) as { id?: string; message?: string; error?: { message?: string } } | null;

  if (!response.ok) {
    const message = result?.message ?? result?.error?.message ?? `Email API returned ${response.status}.`;
    throw new Error(message);
  }

  return {
    providerResponseId: result?.id ?? null
  };
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
