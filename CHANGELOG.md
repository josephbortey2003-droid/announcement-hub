# Changelog

Every change is listed with **where in the code** it lives, so a reviewer can go straight to the implementation.

## 9 October 2026: security, correctness, code structure and test coverage

Branch: `improve/security-quality-docs`

### Security fixes (database)

#### 1. Cross-organization announcement spoofing (fixed)

**Problem.** The old `announcements_author_update` policy only checked that the author was *some* active membership of the caller. It did not check the announcement's organization. An authority could insert an announcement in their own organization through the Supabase REST API and then change its `organization_id` to any other organization. That organization's members would then see the forged announcement in their inbox.

**Fix.** Browser sessions can no longer insert or update announcements or their audience tables. Publishing already goes through the server route, which checks authority and writes with the service role, so the app loses nothing. In addition:
- an announcement's author must be a membership of the same organization (composite foreign key);
- an announcement's organization can never change, even for the service role (trigger).

**Where in the code**
- `supabase/migrations/20261009090000_harden_announcement_writes.sql`: sections 1 and 2
- `tests/db/rls.test.mjs`: tests "an authority cannot write announcements directly…", "…cannot move an announcement into another organization" and "an announcement author must belong to the announcement's organization"

#### 2. Read receipts for someone else's delivery (fixed)

**Problem.** The read-receipt policy checked only that `membership_id` was the caller's own. A member could file a receipt with their own membership id but **someone else's** `recipient_delivery_id`. The SMS fallback (`lib/sms/authorization.ts`) skips any delivery that has a receipt, so this could silently cancel another person's SMS. Clients could also set `read_at` to any time.

**Fix.** A composite foreign key ties each receipt to a delivery with the same membership and organization. Clients can insert only the three identifying columns, so the database always sets `read_at`.

**Where in the code**
- `supabase/migrations/20261009090000_harden_announcement_writes.sql`: section 3
- `tests/db/rls.test.mjs`: tests "a member cannot file a read receipt for someone else's delivery", "…cannot backdate a read receipt" and "a member can mark their own delivery as read…"

### Bug fixes

#### 3. Only one member per organization could have no member reference (fixed)

**Problem.** `memberships` had `unique nulls not distinct (organization_id, member_reference)`. With `NULLS NOT DISTINCT`, two empty references count as duplicates. The owner membership has no reference, so adding **any** second member without one failed with a unique-constraint error. Member onboarding would have broken as soon as it was connected. The new database tests found this.

**Fix.** References stay unique when present, and any number of members may have none (partial unique index).

**Where in the code**
- `supabase/migrations/20261009090100_allow_members_without_reference.sql`
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

### Needs action by the project owner

The two new migrations are **not yet applied** to the hosted Supabase project. Apply them with `npx supabase db push` (or the Supabase dashboard), then regenerate types with `npm run supabase:types`. The application code works with or without them, but the security fixes take effect only once they are applied.
