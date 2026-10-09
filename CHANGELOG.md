# Changelog

Every change is listed with **where in the code** it lives, so a reviewer can go straight to the implementation.

## 9 October 2026: email copies of announcements

Branch: `feature/email-notifications` (built on `feature/announcements`)

After an announcement is published, every recipient can also receive it by email. This is switched off until an email service is configured; follow [docs/email-setup.md](docs/email-setup.md).

### How it works

- **Edge Function `notify-announcement`** (deployed to the hosted project). The app calls it right after publishing, with the publisher's session. It:
  - confirms that the caller is the owner or the announcement's author, using the `sent_announcements` check;
  - reads unread recipients with confirmed emails using the service role;
  - sends them through Resend in batches of up to 100, with an idempotency key;
  - records each result.
  - **Where in the code:** `supabase/functions/notify-announcement/index.ts`.
- **Message building and sending** live in a plain module shared by the function and the unit tests. Each email has a plain-text and an HTML version, with the organization, the title, the message, an "Open in Announcement Hub" link and a footer explaining why it was received. Urgent and important announcements are marked in the subject. Announcement text is HTML-escaped, so it cannot inject markup.
  - **Where in the code:** `supabase/functions/_shared/announcement-email.ts`.
- **Database:** each delivery gains `email_status`, `email_sent_at`, `email_provider_id` and `email_error`. Two functions are callable **only by the service role**:
  - `announcement_email_batch` returns recipients still needing an email (active, confirmed email, not yet emailed, not yet read in the app). Email addresses never reach a browser.
  - `record_email_results` stores outcomes and never overwrites one already recorded.
  - **Where in the code:** `supabase/migrations/20261009074703_announcement_email.sql`.
- **App:** after publishing, the message says how many inboxes received the announcement and how many emails were sent or failed, or that email is not set up yet. Email can never undo or block publishing.
  - **Where in the code:** `lib/supabase/announcements.ts`: `notifyAnnouncementByEmail` (calls again until a large audience is fully handled); `components/workspace/workspace.tsx`: `publish`.

### Tests and checks

- **2 new database tests** (36 in total):
  - owners cannot read email addresses or record results; only the service role can;
  - emails go only to unread, confirmed recipients, are sent once, results are stored (errors trimmed to 300 characters), and recorded results are never overwritten.
- The "no elevated public function" test now matches the rule Supabase's advisor checks: no `SECURITY DEFINER` function in `public` may be callable by `anon` or `authenticated`. Service-role-only functions are allowed.
- **8 new unit tests** (46 in total):
  - message content, priority subjects, HTML escaping;
  - one batch request with an idempotency key, and ids matched to deliveries;
  - provider errors and network failures;
  - the 100-email limit;
  - the app's repeat-until-done loop, and the "not configured" or "not deployed" cases.
- **The deployed function was probed:**
  - without sign-in: 401;
  - with an invalid body: 400;
  - with a valid body and no secrets: `{"configured": false}`.
- Supabase's security advisor reports no issues.
- `tsconfig.json` excludes `supabase/functions` (Deno code). The shared module is covered by the Node tests.

### Not verified

Real sending, which needs a Resend account, a verified domain and the secrets in [docs/email-setup.md](docs/email-setup.md).

## 9 October 2026: real announcements, member inbox and read receipts

Branch: `feature/announcements`

Signed-in owners and leaders now publish announcements that reach members' inboxes. Members mark them as read, and senders see how many recipients have read each one. Preview mode is unchanged.

### Publishing is one database transaction

**Before:** publishing was a server route. It needed the service-role secret (never configured), could not run on GitHub Pages, and wrote records step by step, deleting the draft if a later step failed.

**Now:** `publish_announcement` does everything in one transaction, so either everything is created or nothing is. It:
- checks that the caller is an active owner or authority;
- returns the existing announcement for a retried request (same `clientRequestId`) instead of making a copy;
- validates the priority, the SMS fallback delay (5, 15, 30 or 60 minutes) and the audience size;
- confirms every group belongs to the organization and every named or excluded person is an active member;
- for an authority, requires every group to be actively granted and every named person to be inside those groups, and refuses organization-wide sends;
- resolves recipients (active members; exclusions win; **the author is not sent their own announcement**);
- creates the announcement, audiences, exclusions and one delivery per recipient (with its SMS fallback due time), plus an audit event.

The browser calls it directly, so no server secret is needed and it works on any host.
- **Where in the code:** `supabase/migrations/20261009073623_announcement_publishing.sql`: `private.publish_announcement` and its `public` wrapper; `lib/supabase/announcements.ts`: `publishAnnouncement`; `components/workspace/workspace.tsx`: `publish`.
- `app/api/announcements/publish/route.ts` is now a thin HTTP wrapper around the same function, using the caller's session instead of the service-role key.
- `lib/announcements/recipients.ts` and its tests were removed. The recipient rules now live in the database function and are covered by database tests.

### Member inbox and read receipts

- `my_announcements` returns the signed-in member's own deliveries (row-level security applies), newest first, with read status.
- `mark_announcement_read` records a read receipt for the member's own delivery; calling it again changes nothing. A recorded read receipt also stops that person's SMS fallback.
- The Inbox shows an unread count, a **New** badge and a **Mark as read** button, plus a **Refresh** button. History lists read announcements.
- **Where in the code:** the same migration; `lib/supabase/announcements.ts`: `loadInbox`, `markAnnouncementRead`; `components/workspace/dashboards.tsx`: `AnnouncementRecords`, `MemberDashboard`.

### Sent history with read counts

- `sent_announcements` returns every announcement for an owner and only their own for an authority, each with its recipient count and read count. Members are refused.
- Owners see it under **Announcements**; leaders see it under **Sent history** and in their overview.
- **Where in the code:** the same migration (`private.sent_announcements`); `lib/supabase/announcements.ts`: `loadSentAnnouncements`.

### Leaders

A signed-in leader's composer lists the groups they hold an active publishing grant for. Leaders cannot see members' names (profiles are private), so they publish to whole groups, and the database counts the recipients when publishing. The composer says so instead of showing zero.
- **Where in the code:** `lib/supabase/announcements.ts`: `loadPublishingGroups`; `components/announcement/audience-composer.tsx`: `recipientsCountedOnPublish`.

### Composer

- Waits for the database. If publishing fails, it unlocks and shows the reason (for example, "The announcement includes a group outside your authority") so the author can fix it and retry with the same request id.
- The review step now shows errors.
- **Where in the code:** `components/announcement/audience-composer.tsx`: `publish`.

### Tests

- **8 new database tests** (34 in total):
  - members, and owners of other organizations, cannot publish;
  - an organization-wide send reaches every active member except the author, with SMS due times;
  - a retry returns the same announcement;
  - groups, individuals and exclusions combine, with exclusions winning;
  - an authority is limited to granted groups and the people in them;
  - an empty audience, unknown people, an unsupported delay and a too-short title are refused;
  - the inbox shows only the member's own deliveries, and reads are recorded once and only for the owner of the delivery;
  - sent history gives owners everything and authorities their own, with correct read counts.
- **5 new unit tests** in `tests/announcements-client.test.mjs`: the exact publish payload, error messages, sent-history and inbox mapping, mark-as-read, and the leader's scope (revoked, expired and non-publishing grants are skipped). 38 unit tests in total.

### Hosted database

Applied to the hosted development project as `20261009073623`. The security advisor reports no issues.

### Not verified

Publishing and reading with real accounts. To test it:
1. As the owner, invite yourself under a second email address and accept the invitation.
2. Publish to everyone from the owner account.
3. As the member, the announcement appears in the inbox; click *Mark as read*.
4. The owner's Announcements page shows "1 recipient · 1 read" after reopening it.

## 9 October 2026: member invitations

Branch: `feature/invitations`

Owners can now invite people from the directory, and invitees join by opening a personal link. Accepting turns a person from "Not yet invited" into an **active member**, which is what announcements and authority need.

### How it works

1. **Owner creates links.** On **People**, *Invite people* opens a dialog listing everyone not yet joined (new people are pre-selected). *Create links* calls `create_member_invitations`, which:
   - makes a random 64-character secret for each person (two `gen_random_uuid()` values, about 244 random bits);
   - stores only its **SHA-256 hash**, so the database never holds a usable link;
   - sets the link to expire after 7 days;
   - marks the person *Invited*.

   Inviting someone again replaces their link, so the old one stops working.
   - **Where in the code:** `supabase/migrations/20261009072100_member_invitations.sql`; `components/workspace/invite-dialog.tsx`; `lib/supabase/invitations.ts`: `createInvitations`.
2. **Owner shares links.** Each link is shown once, with **Copy link**, **WhatsApp** (opens a chat with the person's number when it is known) and **Email** (opens the owner's mail app). No email or SMS provider is needed.
   - **Where in the code:** `lib/supabase/invitations.ts`: `invitationLink`, `invitationMessage`, `whatsappLink`, `emailLink`.
3. **Invitee opens the link.** The secret travels in the URL **fragment** (`#invite=…`). Browsers never send the fragment to a server, so it stays out of hosting logs, and the page removes it from the address bar immediately. The sign-in page shows "Join *Organization*", who the link is for and when it expires. Used, expired and unknown links get a plain explanation.
   - **Where in the code:** `components/auth/welcome.tsx` (invitation effect and banner); `lib/supabase/invitations.ts`: `tokenFromHash`, `previewInvitation`.
4. **Invitee signs in or creates an account**, using a password, a one-time email link or Google. The link is remembered in browser storage for up to 7 days, so acceptance still happens after confirming an email or returning from Google.
   - **Where in the code:** `components/auth/welcome.tsx`; `app/page.tsx` (session restore); `lib/supabase/invitations.ts`: `savePendingInvitation`, `readPendingInvitation`.
5. **Acceptance** (`accept_member_invitation`) runs as one transaction. It:
   - checks the link is unused and unexpired;
   - if the invitation has an email address, requires the account to have that same, **confirmed** email, so a forwarded link is useless;
   - creates or reactivates the membership and links the directory entry;
   - adds the person to their groups and creates their profile;
   - marks the link used and records an audit event.
   - **Where in the code:** `supabase/migrations/20261009072100_member_invitations.sql`; `lib/supabase/browser-auth.ts`: `joinWithInvitation`.

### Security decisions

- **Phone-only invitations are bearer links.** Phone sign-in needs an SMS provider for Supabase Auth, which is not configured, so a phone-only invitee signs in with any account. Such a link must be treated like a password. It still works once and expires in 7 days, and the owner sees the person become *Active member*.
- **Elevated functions are not in the public API.** `preview_invitation` and `accept_member_invitation` need elevated rights. They live in the `private` schema and are reached through thin `SECURITY INVOKER` wrappers, as Supabase recommends. Signed-out visitors can run only the preview. The security advisor reports no issues.
  - **Where in the code:** `supabase/migrations/20261009072158_private_invitation_functions.sql`.
- **Invitations are for members only** (database check). Authority is granted separately.

### Shared dialog behaviour

Focus trapping, Escape-to-close and focus return now live in one hook used by both dialogs.
- **Where in the code:** `components/workspace/use-dialog-focus.ts`.

### Tests

- **10 new database tests** (26 in total) in `tests/db/rls.test.mjs`:
  - only owners can invite, and only a hash is stored;
  - previews work for valid links and show nothing for wrong ones;
  - re-inviting cancels the old link;
  - another account or an unconfirmed email cannot accept;
  - accepting creates the membership, groups and profile, and works only once;
  - active members cannot be re-invited;
  - expired links and people from other organizations are refused;
  - signed-out visitors can run only the preview, and no elevated function is exposed in `public`.
- **6 new unit tests** in `tests/invitations-client.test.mjs`: link building (secret in the fragment), share links, pending-link storage and its 7-day expiry, RPC payloads, and error messages. 38 unit tests in total.
- **Browser check against the hosted database:** opening an unknown invitation link removed the secret from the address bar, asked the database, cleared the stored link and showed the "not valid" message.

### Hosted database

Both migrations are applied to the hosted development project (`20261009072100`, `20261009072158`), and the repository files carry the same versions. The security advisor reports no issues.

### Not verified

The full invite → sign up → join flow with real accounts was not run, because it requires creating accounts on the hosted project. To test it:
1. As the owner, add a person with an email you control and click *Invite people*.
2. Open the copied link in a private window and create an account with that email.
3. Confirm the email. You should land in the member inbox, and the owner's People page should show *Active member*.

## 9 October 2026: organization directory saved to the database

Branch: `feature/persist-organization-directory`

A signed-in owner's **People** and **Groups** screens now save to and load from Supabase instead of browser memory. Preview mode is unchanged.

### What works now

- **Loading:** when an owner signs in, the workspace loads the saved directory (people, their groups and their onboarding status) and the organization's groups.
  - **Where in the code:** `lib/supabase/directory.ts`: `loadOrganizationDirectory`; `components/workspace/workspace.tsx`: the `savedDirectory` effect.
- **Adding people:** one person, a CSV file or pasted rows are validated in the browser (`lib/people/import.ts`), then sent to the `import_directory_entries` database function. The function checks that the caller is the owner, creates missing groups by name (case-insensitively), records an import and an audit event, and runs as one transaction: a duplicate email or phone saves **nobody**. People already in the directory are skipped before sending.
  - **Where in the code:** `lib/supabase/directory.ts`: `importOrganizationPeople`; `components/workspace/action-modal.tsx`: `build()` now returns the import source (`individual`, `csv` or `paste`); `components/workspace/workspace.tsx`: `commit`.
- **Adding groups:** saved to the `groups` table; duplicate names are refused by the database's case-insensitive unique index.
  - **Where in the code:** `lib/supabase/directory.ts`: `createOrganizationGroup`.
- **Status column:** the member table shows each saved person's state (Not yet invited, Invited, Active member, Suspended) instead of "Preview record".
  - **Where in the code:** `lib/workspace/model.ts`: `PersonStatus`, `statusLabel`; `components/workspace/dashboards.tsx`.

### Deliberately not yet possible (stated in the interface)

Announcements and authority assignments need a **membership**, and a person only gets one by accepting an invitation, which has not been built yet. In a saved organization, the composer and the authority dialog therefore list only active members, and the buttons explain why when there are none. Before, the earlier uncommitted version silently let you pick people who could never receive anything.
- **Where in the code:** `lib/workspace/model.ts`: `reachablePeople`; `components/workspace/dashboards.tsx`; `components/workspace/workspace.tsx`.

### Limits aligned

The import limit is now **500 people per import** everywhere, matching the database function (it was 5,000 in the browser).
- **Where in the code:** `lib/people/import.ts`: `MAX_IMPORT_ROWS`; `lib/supabase/directory.ts`: `MAX_DIRECTORY_IMPORT`.

### Tests

- **4 new database tests** in `tests/db/rls.test.mjs`, run as real users on PGlite:
  - an owner's import saves people and reuses existing groups regardless of capitalisation;
  - a duplicate email saves nobody;
  - members and other organizations' owners can neither import nor read the directory;
  - imports over 500 are refused.
- **5 new unit tests** in `tests/directory-client.test.mjs` check the Supabase calls with a stand-in client: the data mapping, the exact payload sent to `import_directory_entries`, the error messages, the limits checked before any network call, and group creation.
- **1 new unit test** for `reachablePeople` in `tests/workspace-helpers.test.mjs`.
- Totals: 32 unit tests and 16 database tests.

### Not verified

Signing in as a real owner on the hosted project was not exercised end to end, because that requires creating an account on the live Supabase project. Test it by signing up as an owner, adding people and groups, and refreshing the page: they should still be there.

## 9 October 2026: security, correctness, code structure and test coverage

Branch: `improve/security-quality-docs`

### Security fixes (database)

#### 1. Cross-organization announcement spoofing (fixed)

**Problem.** The old `announcements_author_update` policy only checked that the author was *some* active membership of the caller. It did not check the announcement's organization. An authority could insert an announcement in their own organization through the Supabase REST API and then change its `organization_id` to any other organization. That organization's members would then see the forged announcement in their inbox.

**Fix.** Browser sessions can no longer insert or update announcements or their audience tables. Publishing already goes through the server route, which checks authority and writes with the service role, so the app loses nothing. In addition:
- an announcement's author must be a membership of the same organization (composite foreign key);
- an announcement's organization can never change, even for the service role (trigger).

**Where in the code**
- `supabase/migrations/20261009070117_harden_announcement_writes.sql`: sections 1 and 2
- `tests/db/rls.test.mjs`: tests "an authority cannot write announcements directly…", "…cannot move an announcement into another organization" and "an announcement author must belong to the announcement's organization"

#### 2. Read receipts for someone else's delivery (fixed)

**Problem.** The read-receipt policy checked only that `membership_id` was the caller's own. A member could file a receipt with their own membership id but **someone else's** `recipient_delivery_id`. The SMS fallback (`lib/sms/authorization.ts`) skips any delivery that has a receipt, so this could silently cancel another person's SMS. Clients could also set `read_at` to any time.

**Fix.** A composite foreign key ties each receipt to a delivery with the same membership and organization. Clients can insert only the three identifying columns, so the database always sets `read_at`.

**Where in the code**
- `supabase/migrations/20261009070117_harden_announcement_writes.sql`: section 3
- `tests/db/rls.test.mjs`: tests "a member cannot file a read receipt for someone else's delivery", "…cannot backdate a read receipt" and "a member can mark their own delivery as read…"

### Bug fixes

#### 3. Only one member per organization could have no member reference (fixed)

**Problem.** `memberships` had `unique nulls not distinct (organization_id, member_reference)`. With `NULLS NOT DISTINCT`, two empty references count as duplicates. The owner membership has no reference, so adding **any** second member without one failed with a unique-constraint error. Member onboarding would have broken as soon as it was connected. The new database tests found this.

**Fix.** References stay unique when present, and any number of members may have none (partial unique index).

**Where in the code**
- `supabase/migrations/20261009070124_allow_members_without_reference.sql`
- `tests/db/rls.test.mjs`: test "many members can join without a member reference, but references stay unique"

#### 4. Publish route: authorization order, stable paging, audit errors

- **Idempotency lookup now runs after authorization.** Before, any signed-in user who sent an organization id and request id could learn whether an announcement existed and get its id. Now only the owner or the original author receives the duplicate result; anyone else gets `409`.
- **Stable pagination.** Paged queries over memberships and group members had no `ORDER BY`. PostgreSQL does not guarantee row order between pages, so large organizations could skip or repeat recipients. They are now ordered by key.
- **Recipient rules moved into a tested pure function**, `resolveRecipientIds`: only active members receive an announcement, and exclusions always win.
- **Audit write failures are logged** instead of being silently ignored.

**Where in the code**
- `app/api/announcements/publish/route.ts`
- `lib/announcements/recipients.ts`
- `tests/announcement-recipients.test.mjs`

#### 5. Member import (CSV and pasted rows)

**Problems.** Rows were split on every comma, so `"Mensah, Ama"` became two columns. A normal CSV header row (`name,email,phone,group`) was imported as a person. Emails and phone numbers were not validated. The spreadsheet-formula guard rejected every international phone number starting with `+`. Only the first bad row was reported.

**Fix.** A real CSV parser (RFC 4180 quotes, escaped quotes, CRLF, byte-order mark). The header row is detected and skipped. Emails are validated and lower-cased, and phones are normalized to E.164 (`024 123 4567` → `+233241234567`). Duplicates within the file and against people already in the directory are caught, imports are capped at 5,000 rows, and every problem is reported with its row number. The "one person" form uses the same validation.

**Where in the code**
- `lib/people/import.ts`: `parseCsv`, `checkPerson`, `parsePeopleImport`, `describeProblems`
- `lib/workspace/model.ts`: `mergeNewPeople` (duplicates against the existing directory)
- `components/workspace/action-modal.tsx`: `build()`
- `tests/people-import.test.mjs`, `tests/workspace-helpers.test.mjs`

#### 6. Interface bugs

| Bug | Fix | Where in the code |
| --- | --- | --- |
| When two messages appeared in quick succession, the first one's timer hid the second early. | One timer, reset for each new message and cleared on unmount. | `components/workspace/workspace.tsx`: `notify` |
| Any message in the workspace re-ran the dialog's focus effect, moving keyboard focus back to the first field. | The focus trap runs once, and the close handler is read from a ref. | `components/workspace/action-modal.tsx` |
| Rapid clicks on **Publish** created several copies of an announcement. | A ref blocks repeat clicks immediately; each draft carries a `clientRequestId`, and the workspace ignores a repeat of the same id (the server already does). | `components/announcement/audience-composer.tsx`, `components/workspace/workspace.tsx`: `publish` |
| One-letter titles passed in the browser but the server rejects titles under 2 characters. | The browser now applies the same minimum. | `components/announcement/audience-composer.tsx`: `review` |
| Sign-in treated `024 123 4567` as an email address; only numbers typed with `+` worked. | Identifiers are parsed as email or E.164 phone, with a clear error otherwise. | `lib/workspace/model.ts`: `parseSignInIdentifier`; `components/auth/welcome.tsx` |
| The sidebar always showed "Demo person", even for a signed-in account. | Shows the account's name; the preview shows "Preview user". | `lib/supabase/browser-auth.ts`: `viewerName`; `components/workspace/chrome.tsx`: `Sidebar` |
| Signed-in users saw "Sign out of preview" and "Switch role". | Labels match the session: "Sign out" or "Leave preview". | `components/workspace/chrome.tsx`, `components/workspace/workspace.tsx` |
| The authority preview used only the **first** authority assignment's audience. | Uses every assigned audience. | `components/workspace/workspace.tsx`: `authorityGroups` |
| The owner overview always said "1 of 4 complete". | Progress is calculated from branding, people, groups and authority. | `lib/workspace/model.ts`: `setupProgress`; `components/workspace/dashboards.tsx` |
| Duplicate group names were accepted. | Rejected, case-insensitively. | `components/workspace/action-modal.tsx` |
| The member notification setting offered WhatsApp (not built) and ignored the selection. | Controlled setting, honest options and a note that preview preferences are not saved. | `components/workspace/dashboards.tsx`: `MemberDashboard` |
| The page header contained a hidden menu button that did nothing. Because it was the header's first child, the header's intended typography rules (which target `div:first-child`) never applied. | Button removed; the designed header styles now apply. | `components/workspace/chrome.tsx`: `Header` |
| Theme saving threw when browser storage was blocked. | Storage access is wrapped in `try`/`catch`. | `app/page.tsx` |
| Password-reset links built the `next` parameter without URL encoding. | Encoded with `encodeURIComponent`. | `components/auth/welcome.tsx`: `callbackUrl` |
| The role list had an `aria-label` without a role, so screen readers ignored it. | Now `role="group"`. | `components/auth/welcome.tsx` |

### Code structure

`app/page.tsx` was a single 54 KB file with lines up to 3,400 characters long. It is now split into readable modules with no change to the CSS class names:

| File | Contents |
| --- | --- |
| `app/page.tsx` | Top-level state; chooses between sign-in and the workspace |
| `components/auth/welcome.tsx` | Sign-in, owner sign-up, one-time code, password recovery, preview entry |
| `components/workspace/workspace.tsx` | Workspace shell, messages, publishing, people/group/authority commits |
| `components/workspace/chrome.tsx` | Sidebar, mobile bars, header, empty state, theme selector |
| `components/workspace/dashboards.tsx` | Owner, authority and member screens |
| `components/workspace/action-modal.tsx` | Add-people, group, authority and branding dialog |
| `lib/workspace/model.ts` | Shared types and pure, tested helpers |
| `lib/workspace/access.ts` | Converts a signed-in membership into brand and viewer |

### Tests and continuous integration

- **26 unit tests** (was 8): new suites `tests/announcement-recipients.test.mjs`, `tests/people-import.test.mjs` and `tests/workspace-helpers.test.mjs`.
- **12 behavioral database tests** in `tests/db/rls.test.mjs`. They run every migration on PGlite (PostgreSQL 17 compiled to WebAssembly), so **no Docker is needed**, and then act as different signed-in users. Removing the security migration makes the six attack tests fail, which confirms they detect the holes.
- The pgTAP catalogue suite (`supabase/tests/tenant_rls_test.sql`) referenced the `groups_owner_all` policy, which a later migration had removed, so it would have failed. It now checks the replacement policy and has three new assertions for the hardening above.
- New npm scripts: `test` (unit + database), `test:db` and `typecheck`. `test:unit` covers the new suites.
- CI (`.github/workflows/ci.yml`) now also runs the type check and the database tests.
- `tsconfig.json`: `allowImportingTsExtensions`, so library files can import each other with `.ts` extensions that Node's test runner can load.
- New dev dependency: `@electric-sql/pglite` 0.5.6 (exact version).

### Hosted database (applied 9 October 2026)

- The hosted project had been paused for inactivity; it was restored first.
- Both new migrations were applied to the hosted project. Supabase recorded them as `20261009070117` and `20261009070124`, and the repository files carry the same versions so `supabase db push` will not re-apply them.
- Verified on the hosted database: browser sessions cannot insert or update announcements or set `read_at`; the new foreign keys, trigger and partial unique index exist, and the old member-reference constraint is gone. The Supabase security advisor reports no issues. The performance advisor reports only informational notices: foreign keys without covering indexes, and indexes not yet used because the database is empty.
- **Repository brought in line with the hosted database.** Two migrations that had been applied on 25 September but never committed are now in the repository: `20260925204035_add_organization_directory.sql` (a staging roster of people before they accept an invitation) and `20260925204318_add_directory_import_function.sql` (`import_directory_entries`, a case-insensitive unique group name and owner audit inserts). The database tests run against the full history, and the pgTAP table count is now 21.
- `lib/supabase/database.types.ts` now matches the hosted schema, including the directory tables and the import function.
