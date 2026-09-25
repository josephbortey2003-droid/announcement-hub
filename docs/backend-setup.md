# Announcement Hub backend setup

This repository is linked to the hosted Supabase project `announcement-hub`
(`drilgelrfxoluxklcdhp`) in `eu-west-2`. The committed migrations were applied
on 25 September 2026. The public GitHub Pages build intentionally remains a
prototype; the ignored local environment file connects local full-stack runs to
the hosted development backend.

## What is included

- A versioned PostgreSQL migration under `supabase/migrations/`.
- Explicit Data API grants and Row Level Security on every application table.
- Organization bootstrap logic that creates the first owner membership.
- Tenant-aware memberships, groups, authority grants, announcements, recipients, read receipts, delivery attempts, imports, SMS ledger entries and audit events.
- Flexible announcement audiences covering the full organization, groups, specific members and member exclusions.
- A protected publish endpoint that resolves and snapshots recipients only after rechecking the caller's tenant role and group authority.
- A private organization-logo bucket with membership and owner policies.
- Browser/server Supabase client factories, session-refresh proxy and an OAuth callback route.
- Password, email/phone OTP and Google OAuth entry points that remain disabled when public Supabase configuration is absent.
- Verified owner onboarding that stores pending organization details locally, waits for email/OAuth verification, then creates the profile, organization, owner membership and default branding through RLS-protected writes.
- Canonical organization codes protected by a database unique constraint, including a friendly conflict error when another space already owns the code.
- Atomic organization name, code and color updates through a security-invoker database function; private PNG/JPEG logo storage; signed logo URLs; and tenant-scoped Realtime refreshes for signed-in owner, authority and member portals.
- pgTAP catalogue tests under `supabase/tests/`.
- Local Auth defaults that disable public signup, require confirmed email, use a 15-character minimum password and limit logo files to 1 MiB.

## Required tools

- Node.js 22 or later.
- Docker Desktop for the local Supabase stack and database tests.
- A hosted Supabase project when moving beyond local development.

Docker is not installed on the current workstation, so the pgTAP suite has not
been executed. The migrations have been executed on the linked hosted project.
Both the Supabase security and performance advisors currently report no issues.
The pgTAP gap must still be closed before calling the backend production-ready.

## Local setup

1. Install Docker Desktop and make sure its Linux container engine is running.
2. Copy `.env.example` to `.env.local`.
3. Start the backend:

   ```powershell
   npm run supabase:start
   ```

4. Copy the local API URL and publishable key printed by the CLI into `.env.local`.
5. Reset the database and apply all migrations:

   ```powershell
   npm run supabase:reset
   ```

6. Run the database tests:

   ```powershell
   npm run supabase:test
   ```

7. Generate checked TypeScript database types:

   ```powershell
   npm run supabase:types
   ```

8. For local owner registration, enable `[auth].enable_signup` and `[auth.email].enable_signup` only in the development configuration. Keep email confirmation enabled and configure CAPTCHA before enabling open registration on a public deployment.
9. Run the web application:

   ```powershell
   npm run dev
   ```

## Hosted project status

Completed:

- Hosted project created in `eu-west-2` and linked to the repository.
- All five migrations applied, including the RLS policy optimization migration.
- Automatic Data API exposure remains disabled; migrations grant explicit access.
- Email/password signup is enabled with email confirmation required.
- The site URL is `https://announcement-hub.josephbortey2003.chatgpt.site/`.
- Exact production, `localhost` and `127.0.0.1` `/auth/callback` URLs are allow-listed.
- The local ignored `.env.local` contains only the hosted URL and browser-safe publishable key. No secret key is committed.
- Security and performance advisors report no issues.
- TypeScript database types were generated from the applied hosted schema and
  are used by the browser, server and privileged Supabase clients.

Still required:

1. Configure a production SMTP provider before invitations are sent to real users.
2. Create a Google OAuth web client, register
   `https://drilgelrfxoluxklcdhp.supabase.co/auth/v1/callback`, and store its
   client ID and secret in Supabase.
3. Create an hCaptcha or Cloudflare Turnstile site, add its frontend site key,
   and store its secret in Supabase before exposing owner signup publicly.
4. Add the server-only Supabase secret to a full-stack deployment's encrypted
   environment settings. Never expose it through a `NEXT_PUBLIC_` variable.
5. Run the pgTAP suite once Docker or an equivalent test runner is available.
6. Keep member accounts invitation-only rather than enabling unrestricted member registration.

## Security decisions

- Role selection in the UI is never trusted for authorization.
- Tenant ownership is represented by immutable UUIDs, not organization codes.
- Organization codes are login/discovery aids only.
- Branding is stored once per organization. Every portal resolves it from the authenticated membership rather than from the selected login role or device-local state.
- Organization identity changes are published through Supabase Realtime only after RLS confirms the subscriber belongs to that organization.
- `service_role` credentials belong only in trusted server or worker code.
- Authorization helpers live in a non-exposed `private` schema and explicitly check `auth.uid()`.
- Every outbound announcement snapshots its recipients so later group changes cannot rewrite history.
- SMS fallback will be based on a missing read receipt after a configured interval, not an unreliable claim that the recipient is offline.
- Provider callbacks must be signature-validated, idempotent and stored as delivery attempts.

## Next implementation slice

After local PostgreSQL verification, replace the remaining workspace preview arrays with authenticated database queries, starting with memberships and groups. Then connect member invitations and CSV imports. Keep live SMS disabled until tenant, authority and audience policy tests pass.
