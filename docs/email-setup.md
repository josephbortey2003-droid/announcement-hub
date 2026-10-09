# Email setup

Last reviewed: 9 October 2026

Announcement Hub sends two kinds of email:

| Email | Sent by | Works today? |
| --- | --- | --- |
| Account emails: sign-up confirmation, one-time sign-in links, password reset | Supabase Auth | Only through Supabase's built-in test mailer, which is heavily rate-limited and may deliver only to members of your Supabase team. |
| Announcement copies | The `notify-announcement` Edge Function, through Resend | Deployed, but switched off until the secrets below are set. |

Both use the same email service once it is set up. The steps below use [Resend](https://resend.com). Check its current free-tier limits before you rely on them.

## 1. Create a Resend account and verify a domain

1. Sign up at resend.com.
2. **Domains → Add domain**, then enter a domain you own (for example `mail.your-domain.com`).
3. Add the DNS records Resend shows (SPF, DKIM and, optionally, DMARC) at your domain registrar, then wait until Resend shows the domain as **Verified**.

Without a verified domain, Resend only sends to your own address, so members will not receive anything.

## 2. Create an API key

**API Keys → Create API key**, with "Sending access" permission. Copy it once; it is not shown again. Never commit it or paste it into the app's `.env` files.

## 3. Switch on announcement emails

In the Supabase dashboard, open **Edge Functions → Secrets** and add:

| Name | Example |
| --- | --- |
| `RESEND_API_KEY` | `re_...` |
| `EMAIL_FROM` | `Announcement Hub <announcements@mail.your-domain.com>` |
| `APP_URL` | `https://josephbortey2003-droid.github.io/announcement-hub/` |

The CLI equivalent is `npx supabase secrets set RESEND_API_KEY=... EMAIL_FROM="..." APP_URL=...`.

No redeploy is needed. The next published announcement is emailed to every recipient who has a confirmed email address and has not already read it in the app.

## 4. Send account emails through the same service

In the Supabase dashboard, open **Authentication → Emails → SMTP Settings → Enable custom SMTP**:

| Field | Value |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | your Resend API key |
| Sender email | an address on your verified domain |
| Sender name | `Announcement Hub` |

After this, sign-up confirmations, sign-in links and password resets reach anyone, which is what the invitation flow needs.

## How announcement emails work

1. After publishing, the app calls `notify-announcement` with the publisher's session (`lib/supabase/announcements.ts`: `notifyAnnouncementByEmail`).
2. The function confirms that the caller is the organization owner or the announcement's author, using the same `sent_announcements` check as the sent history.
3. It reads recipients with the service role through `announcement_email_batch`: active members with a confirmed email, not yet emailed, and not yet read in the app. Email addresses never reach a browser.
4. It sends up to 100 emails per Resend batch, with an idempotency key, so a duplicated request cannot send twice.
5. It stores each result on the recipient's delivery (`email_status`, `email_sent_at`, `email_provider_id`, `email_error`) through `record_email_results`, so nobody is emailed twice.

Publishing never depends on email: if sending fails, the announcement is still in every inbox, and the publisher sees how many emails failed.

**Where in the code:**
- `supabase/functions/notify-announcement/index.ts`
- `supabase/functions/_shared/announcement-email.ts`
- `supabase/migrations/20261009074703_announcement_email.sql`
- `tests/announcement-email.test.mjs`
- `tests/db/rls.test.mjs`

## Redeploying the function

After changing the function code, run `npx supabase functions deploy notify-announcement`. This needs the Supabase CLI to be logged in and linked to the project.
