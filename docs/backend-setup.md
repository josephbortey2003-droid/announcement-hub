# Announcement Hub backend setup

This repository contains the first production-oriented backend foundation. It is not connected to a hosted Supabase project yet.

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

Docker is not installed on the current workstation, so the migration and pgTAP tests have not yet been executed against a PostgreSQL instance. Do not apply this migration to production before the local reset, test suite and database advisors pass.

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

## Hosted project setup

1. Create a Supabase project in an appropriate region.
2. Keep automatic Data API exposure disabled. The migration grants only the operations required by the app.
3. Add the hosted URL and publishable key to the deployment environment. Never expose a secret or service-role key through a `NEXT_PUBLIC_` variable.
4. Configure a production SMTP provider before invitations.
5. Configure the application domain and exact OAuth redirect URLs.
6. Enable Google only after its consent screen, domain and redirect URIs are verified.
7. Add the exact production `/auth/callback` address to the Supabase redirect allow list. OAuth and verification redirects must never use an unrestricted external URL.
8. Enable owner sign-up only after SMTP, abuse controls and CAPTCHA are configured. Member accounts should be created through organization invitations rather than public self-registration.
9. Link the CLI, run a migration dry review, execute database tests, and run database advisors before pushing.

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
