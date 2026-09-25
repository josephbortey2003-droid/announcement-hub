# Project status and roadmap

Last reviewed: 25 September 2026

## Status definitions

- **Verified locally:** exercised by automated checks or responsive browser inspection in the current workspace.
- **Implemented, configuration required:** production-oriented code exists but cannot operate without a hosted service or credentials.
- **Prototype:** interactive interface behavior exists using browser memory or demonstration data.
- **Planned:** not implemented.

## Current capability matrix

| Capability | Status | Evidence or limitation |
| --- | --- | --- |
| Separate owner, authority and member portals | Verified locally | Role previews render different navigation and functions. Authenticated routing uses membership role. |
| Notebook-style role access UI | Verified locally | Responsive access page and mobile reference implementation. |
| Light, dark and device themes | Verified locally | Shared theme control and system preference support. |
| Responsive workspace | Verified locally | Checked at 320, 768, 1024 and 1440 px without page-level horizontal overflow. |
| Unique organization codes | Implemented, configuration required | PostgreSQL unique constraint and format check; friendly `23505` handling. Requires migrations to be applied. |
| Password, OTP and Google sign-in | Implemented, configuration required | Requires hosted Supabase, redirect allowlist, SMTP and provider configuration. |
| Owner organization creation | Implemented, configuration required | Completes after verified authentication and migration deployment. |
| Organization branding persistence | Implemented, configuration required | Security-invoker RPC, private storage and signed URLs. |
| Branding propagation to members | Implemented, configuration required | Membership-scoped reads plus RLS-protected Realtime refresh. |
| Add one person | Prototype | Adds a preview record in browser state. |
| Paste/CSV onboarding | Prototype | Parses and validates preview rows; does not yet create invitations. |
| Directory sync | Planned | Interface explains requirements but does not simulate a connection. |
| Groups and authority assignment | Prototype plus schema | Interface state is temporary; database tables and policies exist. |
| Flexible announcement audience | Prototype plus server endpoint | UI and resolver are tested; server endpoint requires deployed backend and stored members/groups. |
| In-app delivery records | Implemented, configuration required | Server publication creates recipient snapshots in Supabase. |
| Read receipts and inbox persistence | Schema only | Tables/policies exist; member UI is still backed by preview arrays. |
| Hubtel SMS send/status | Implemented, disabled | Requires credentials, sender approval, test recipients, database and full-stack deployment. |
| WhatsApp delivery | Planned | No production integration is claimed. |
| Billing balance | Planned | Ledger schema exists; no real account balance or top-up workflow. |
| Privacy and Terms pages | Draft | Require legal review before launch. |
| GitHub Pages preview | Live | Static interface review only. |

## Verified quality checks

At the current revision:

- ESLint passes.
- Eight unit tests pass.
- The full application build passes.
- The GitHub Pages build passes.
- Organization identity remains visible across mobile and desktop responsive layouts.
- GitHub Actions validates pushes and deploys the preview.

Database migrations and pgTAP tests still require Docker or a linked non-production Supabase project.

## Known limitations

1. No hosted Supabase project is connected to the repository environment.
2. Preview-created members, groups, authorities and announcements are held in React state and disappear on refresh.
3. GitHub Pages cannot execute authentication callbacks or server API routes.
4. The generated database types have not yet been refreshed from an applied local schema.
5. Email invitations, SMTP delivery and CAPTCHA are not configured.
6. Hubtel credentials and sender approval are not configured.
7. SMS provider callbacks and background fallback scheduling are not running.
8. Member read receipts are not connected to the interface.
9. Legal text is a draft and the custom production domain is not connected.
10. Accessibility has been considered in implementation but has not received a complete manual WCAG audit with assistive technology.

## Recommended implementation sequence

### Milestone 1: verify the database

- Install Docker Desktop or create a separate development Supabase project.
- Apply all migrations from a clean database.
- Run pgTAP tests and database advisors.
- Generate and commit TypeScript database types.
- Resolve every advisor warning before production data is added.

### Milestone 2: activate authentication

- Configure hosted URL and publishable/secret keys.
- Configure SMTP, email templates and exact redirect URLs.
- Configure Google OAuth.
- Add CAPTCHA and owner-registration abuse controls.
- Test owner creation, duplicate codes, password recovery and each role on two devices.

### Milestone 3: persist organization operations

- Replace preview people, group and authority arrays with authenticated queries.
- Implement invitation creation, expiry, acceptance and resend controls.
- Implement CSV validation, preview, confirmation, processing and audit logs.
- Add suspension, removal and authority revocation workflows.

### Milestone 4: persist communication

- Connect the composer to the protected publish endpoint.
- Build member inbox queries and read receipts.
- Add owner and authority sent history.
- Move publication into a single reviewed database transaction.
- Test tenant isolation and authority boundaries with multiple organizations.

### Milestone 5: controlled delivery

- Configure Hubtel in test mode and allowlist only project-owned test numbers.
- Verify send, status, failure and idempotency behavior.
- Add a secure scheduler for due fallback deliveries.
- Add signed provider callbacks if supported.
- Display ledger-derived costs only after provider confirmation.

### Milestone 6: launch readiness

- Complete accessibility, mobile-device, browser and performance audits.
- Add monitoring, rate limits, backups and an incident-response procedure.
- Obtain legal review for Privacy and Terms.
- Connect a custom domain and production favicon/assets.
- Remove prototype entry points and labels only after all production paths are verified.

## Suggested final-year-project evaluation evidence

- Architecture and entity-relationship diagram.
- Threat model and RLS policy tests.
- Role and authority test matrix.
- Audience-resolution unit tests.
- Duplicate organization-code concurrency test.
- Responsive screenshots from owner, authority and member portals.
- Measured delivery tests with timestamps and provider records.
- Usability study results from representative organization users.
- Clear comparison of implemented, simulated and proposed features.
