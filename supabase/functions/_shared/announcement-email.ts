// Email copies of announcements: message building and sending through Resend.
//
// Shared by the `notify-announcement` Edge Function (Deno) and the unit tests
// (Node), so it uses only web-standard APIs (fetch, crypto-free string work).
// Resend batch API: https://resend.com/docs/api-reference/emails/send-batch-emails

export type EmailRecipientRow = {
  delivery_id: string;
  email: string;
  recipient_name: string;
  organization_name: string;
  title: string;
  body: string;
  priority: "normal" | "important" | "urgent" | string;
  published_at: string;
};

export type EmailResult = { deliveryId: string; status: "sent" | "failed"; providerId: string | null; error: string | null };

export type OutgoingEmail = { from: string; to: string[]; subject: string; text: string; html: string };

/** Resend accepts at most 100 emails per batch request. */
export const BATCH_LIMIT = 100;
const RESEND_BATCH_URL = "https://api.resend.com/emails/batch";

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

const priorityPrefix = (priority: string) => (priority === "urgent" ? "URGENT: " : priority === "important" ? "Important: " : "");

/** Builds the subject, plain-text and HTML versions of one recipient's email. */
export function buildAnnouncementEmail(row: EmailRecipientRow, from: string, appUrl: string): OutgoingEmail {
  const greeting = row.recipient_name ? `Hello ${row.recipient_name},` : "Hello,";
  const subject = `${priorityPrefix(row.priority)}${row.title} | ${row.organization_name}`.slice(0, 250);
  const footer = `You received this because you are a member of ${row.organization_name} on Announcement Hub.`;
  const linkLine = appUrl ? `Open it in Announcement Hub: ${appUrl}` : "";
  const text = [greeting, "", `${row.organization_name} published a new announcement:`, "", row.title, "", row.body, "", linkLine, "", footer]
    .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
    .join("\n")
    .trim();
  const paragraphs = row.body.split(/\n{2,}/).map((part) => `<p style="margin:0 0 14px">${escapeHtml(part).replace(/\n/g, "<br>")}</p>`).join("");
  const html = [
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2933;line-height:1.5">`,
    `<p style="margin:0 0 6px;color:#52606d;font-size:13px">${escapeHtml(row.organization_name)}</p>`,
    row.priority !== "normal" ? `<p style="margin:0 0 6px;color:#b42318;font-weight:bold;font-size:13px">${escapeHtml(priorityPrefix(row.priority).replace(": ", ""))}</p>` : "",
    `<h1 style="margin:0 0 16px;font-size:22px">${escapeHtml(row.title)}</h1>`,
    `<p style="margin:0 0 14px">${escapeHtml(greeting)}</p>`,
    paragraphs,
    appUrl ? `<p style="margin:20px 0"><a href="${escapeHtml(appUrl)}" style="background:#176b91;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open in Announcement Hub</a></p>` : "",
    `<p style="margin:24px 0 0;color:#7b8794;font-size:12px">${escapeHtml(footer)}</p>`,
    `</div>`,
  ].join("");
  return { from, to: [row.email], subject, text, html };
}

/**
 * Sends one batch (at most BATCH_LIMIT rows) and returns one result per delivery.
 * The idempotency key is derived from the deliveries in the batch, so if two
 * requests race and fetch the same recipients, Resend sends the batch only once.
 */
export async function sendBatch(
  rows: EmailRecipientRow[],
  options: { apiKey: string; from: string; appUrl: string; announcementId: string; fetchImpl?: typeof fetch },
): Promise<EmailResult[]> {
  if (!rows.length) return [];
  if (rows.length > BATCH_LIMIT) throw new Error(`A batch can hold at most ${BATCH_LIMIT} emails.`);
  const fetchImpl = options.fetchImpl ?? fetch;
  const payload = rows.map((row) => buildAnnouncementEmail(row, options.from, options.appUrl));
  const idempotencyKey = `announcement-${options.announcementId}-${rows[0].delivery_id}-${rows[rows.length - 1].delivery_id}-${rows.length}`;
  const failAll = (error: string): EmailResult[] => rows.map((row) => ({ deliveryId: row.delivery_id, status: "failed", providerId: null, error }));

  let response: Response;
  try {
    response = await fetchImpl(RESEND_BATCH_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    });
  } catch {
    return failAll("The email service could not be reached.");
  }
  const body = (await response.json().catch(() => null)) as { data?: { id?: string }[]; message?: string } | null;
  if (!response.ok) return failAll(`Email service error ${response.status}${body?.message ? `: ${body.message}` : ""}`.slice(0, 300));
  const ids = body?.data ?? [];
  return rows.map((row, index) => (ids[index]?.id
    ? { deliveryId: row.delivery_id, status: "sent", providerId: ids[index].id!, error: null }
    : { deliveryId: row.delivery_id, status: "failed", providerId: null, error: "The email service did not confirm this message." }));
}
