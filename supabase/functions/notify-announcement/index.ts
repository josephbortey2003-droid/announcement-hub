// Supabase Edge Function: email a published announcement to its recipients.
//
// Called by the app right after publishing (lib/supabase/announcements.ts:
// notifyAnnouncementByEmail) with the signed-in user's session. It:
//   1. checks the caller may see the announcement in sent history (its owner or author);
//   2. reads unread, confirmed recipients with the service role
//      (public.announcement_email_batch, service-role only);
//   3. sends them through Resend in batches of up to 100;
//   4. records each result (public.record_email_results), so nobody is emailed twice.
// Message building and sending live in ../_shared/announcement-email.ts.
//
// Configuration (Supabase dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY  Resend API key
//   EMAIL_FROM      e.g. "Announcement Hub <announcements@your-domain.com>" (a verified domain)
//   APP_URL         address of the app, used for the "Open in Announcement Hub" link
// Without RESEND_API_KEY and EMAIL_FROM the function reports that email is not configured.

import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { BATCH_LIMIT, sendBatch, type EmailRecipientRow } from "../_shared/announcement-email.ts";

const MAX_BATCHES_PER_CALL = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);

  const input = await request.json().catch(() => null) as { organizationId?: string; announcementId?: string } | null;
  if (!input || !UUID.test(input.organizationId ?? "") || !UUID.test(input.announcementId ?? "")) {
    return json({ error: "organizationId and announcementId are required." }, 400);
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM");
  if (!apiKey || !from) return json({ configured: false, sent: 0, failed: 0, remaining: false });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const authorization = request.headers.get("Authorization") ?? "";
  const asCaller = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } } });

  // Owners see every sent announcement and authorities their own, so this is the permission check.
  const { data: sent, error: sentError } = await asCaller.rpc("sent_announcements", { target_organization: input.organizationId });
  if (sentError) return json({ error: "You cannot send email for this organization." }, 403);
  if (!(sent ?? []).some((row: { announcement_id: string }) => row.announcement_id === input.announcementId)) {
    return json({ error: "Only the organization owner or the announcement's author can send its email." }, 403);
  }

  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const appUrl = Deno.env.get("APP_URL") ?? "";
  let sentCount = 0;
  let failedCount = 0;
  for (let batch = 0; batch < MAX_BATCHES_PER_CALL; batch += 1) {
    const { data: rows, error } = await admin.rpc("announcement_email_batch", { target_announcement: input.announcementId, batch_size: BATCH_LIMIT });
    if (error) return json({ error: "Recipients could not be loaded." }, 500);
    if (!rows?.length) return json({ configured: true, sent: sentCount, failed: failedCount, remaining: false });

    const results = await sendBatch(rows as EmailRecipientRow[], { apiKey, from, appUrl, announcementId: input.announcementId! });
    const { error: recordError } = await admin.rpc("record_email_results", { results });
    if (recordError) return json({ error: "Emails were sent but their results could not be recorded." }, 500);
    sentCount += results.filter((result) => result.status === "sent").length;
    failedCount += results.filter((result) => result.status === "failed").length;
  }
  // More recipients remain; the app calls again.
  return json({ configured: true, sent: sentCount, failed: failedCount, remaining: true });
});
