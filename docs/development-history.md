# Development history

Last reviewed: 9 October 2026

This record summarizes the repository history and the major decisions made during the design and implementation process. Commit hashes identify the corresponding reviewed milestones.

## Product discovery

The original concept established:

- organization-owned spaces;
- member, staff and student recipients;
- departments, offices, courses, classes and lecturers as targeting structures;
- fixed authority hierarchy with owner-assigned scope;
- email/SMS invitations;
- in-app announcements with offline fallback;
- organization-specific logos and colors;
- cost awareness for SMS delivery.

Discussion clarified that reliable internet-presence detection is not available. The product therefore uses a missing read receipt after a delay as the fallback trigger.

## Interface foundation

### `d0c172e` and `9c390fb`: initial prototypes

Built the first navigable Announcement Hub interface and role-based concept.

### `b104bbf`: institutional design refinement

Introduced a more professional organizational visual direction, typography hierarchy and workspace layout.

### `a5b3996`: UX and navigation revision

Reworked navigation labels and operational areas so tabs corresponded to understandable destinations.

## Quality and theming

### `a8b5e33`: continuous validation

Added automated repository validation.

### `ff797c2`, `4c90d67`, `62a1cd3`, `df4f1be`: appearance work

Implemented device, light and dark modes; organization color gradients; explicit light-mode precedence; contrast protection; and a less white-dominant light surface hierarchy.

The final direction avoids purple gradients, fabricated metrics, fake testimonials, emoji icons, cursor animations and excessive scroll effects.

## Delivery and deployment

### `6bc138f`: Hubtel SMS foundation

Added disabled-by-default server configuration, authorization checks, Ghana phone normalization, GSM/Unicode segment calculation, idempotent attempts, provider status mapping and ledger recording.

### `478d14e`: GitHub Pages preview

Added the public static preview and deployment workflow. The preview deliberately excludes live server features.

## Announcement workflow

### `30a5e49`: flexible audience publishing

Added organization-wide, group, individual and exclusion targeting; final audience review; server-side scope validation; recipient snapshots; idempotency and audit events.

## Mobile work

### `01af3e2`: mobile workspace navigation

Added mobile content choreography, compact workspace controls and responsive page layouts.

### `c31fd53`: mobile drawer and organization theme polish

Removed duplicate menu actions, corrected Branding placement and improved the organization-color treatment.

### `2c12f1e`: notebook role bookmarks

Rebuilt the mobile access page around notebook-style role tabs based on the supplied visual reference.

## Authentication and tenant identity

### `0e96983`: secure Supabase authentication foundation

Added password, OTP and Google OAuth wiring; session refresh; verified owner onboarding; account recovery; membership-derived role routing; secure sign-out; and honest unavailable states when Supabase is not configured.

### Current work: organization identity persistence

Added:

- explicit pgTAP coverage for unique organization codes;
- an owner-only security-invoker organization identity update function;
- tenant-prefixed private PNG/JPEG logo uploads;
- signed logo URLs;
- duplicate-code conflict handling;
- Realtime organization and branding subscriptions;
- shared owner, authority and member brand loading;
- responsive validation at 320, 768, 1024 and 1440 pixels.

This work was initially implemented and locally build-verified before a hosted
backend existed.

### Hosted Supabase development backend

Created and linked the `announcement-hub` Supabase project in `eu-west-2`,
applied the complete migration history, configured exact production and local
authentication callback URLs, and kept the public GitHub Pages build in honest
prototype mode. The security advisor passed. A follow-up migration split broad
owner `FOR ALL` RLS policies into mutation-specific policies, after which the
performance advisor also passed. Email confirmation is enabled; Google OAuth,
production SMTP, CAPTCHA, and the server-only deployment secret remain explicit
configuration tasks. TypeScript database types were generated from the hosted
schema and wired into every Supabase client factory. Optional Cloudflare
Turnstile support now forwards CAPTCHA tokens through signup, password, OTP and
password-recovery requests without exposing the provider secret in the client.

### Security, correctness and structure review (9 October 2026)

A full review of the database policies, server routes and interface. Full detail, with file locations for every item, is in [CHANGELOG.md](../CHANGELOG.md).

- **Two security holes closed.** An authority could move their own announcement into another organization's inbox, and a member could file a read receipt against someone else's delivery to cancel that person's SMS fallback. Browser sessions can no longer write announcements; receipts must match the reader's own delivery and cannot be backdated (`supabase/migrations/20261009070117_harden_announcement_writes.sql`).
- **Schema bug fixed.** `NULLS NOT DISTINCT` on member references allowed only one member per organization without a reference (`supabase/migrations/20261009070124_allow_members_without_reference.sql`).
- **Publish route.** Authorization before the idempotency lookup, ordered pagination and tested recipient rules (`app/api/announcements/publish/route.ts`, `lib/announcements/recipients.ts`).
- **Member import.** Proper CSV parsing, header detection, email/phone validation, duplicate detection and per-row errors (`lib/people/import.ts`).
- **Interface.** `app/page.tsx` split into `components/auth` and `components/workspace`; fixed message timing, dialog focus, repeat publishing, phone sign-in, the hard-coded user name, the authority preview scope and static setup progress.
- **Testing.** Database security tests that run without Docker, using PGlite (`tests/db/rls.test.mjs`); unit tests grew from 8 to 26; CI runs the type check and database tests.

Decision: database rules are tested by *behavior* (acting as real users) in addition to the existing pgTAP catalogue checks, because a policy can exist and still be wrong. The behavioral tests found the member-reference bug, which the catalogue checks could not.

### Organization directory connected (9 October 2026)

Signed-in owners' People and Groups screens now save to Supabase through `lib/supabase/directory.ts`, using the `import_directory_entries` function from the 25 September directory migrations. These migrations had been applied to the hosted database without being committed; the earlier wiring for them was left uncommitted in a separate working copy and was written against the old single-file interface, so it was rebuilt for the component structure. Decision: announcements and authority stay limited to people with an accepted membership, so the interface never offers recipients who cannot receive anything. See [CHANGELOG.md](../CHANGELOG.md).

### Member invitations (9 October 2026)

Owners create one-time invitation links from the directory and share them by copy, WhatsApp or email. Invitees join by signing in or creating an account. Decisions:
- only a SHA-256 hash of each link is stored;
- the secret travels in the URL fragment so it never reaches server logs;
- email invitations are bound to the confirmed account email;
- phone-only invitations are bearer links until SMS sign-in exists;
- the elevated database functions sit in the `private` schema behind invoker wrappers.

Delivery deliberately uses the owner's own WhatsApp or email instead of a paid provider. See [CHANGELOG.md](../CHANGELOG.md).

## Design references and skills consulted

The project used the supplied UI/UX, frontend, mobile, animation, accessibility, color, typography and 21st.dev references as design guidance. Later direct product decisions override early generated design-system suggestions. External reference material was treated as inspiration, not copied customer evidence or factual product claims.

## Repository and preview

- Repository: <https://github.com/josephbortey2003-droid/announcement-hub>
- Static preview: <https://josephbortey2003-droid.github.io/announcement-hub/>

Future edits become visible in the preview after they are committed, pushed to `main` and the GitHub Pages workflow completes.
