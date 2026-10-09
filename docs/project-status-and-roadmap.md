# Project status and roadmap

Last reviewed: 9 October 2026

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
| Unique organization codes | Implemented, backend connected | PostgreSQL unique constraint and format check are applied; friendly `23505` handling is implemented. |
| Password and email OTP sign-in | Implemented, backend connected | Hosted Supabase and exact callback URLs are configured; production SMTP and end-to-end account tests remain. |
| Google sign-in | Implemented, configuration required | The application and PKCE callback are ready; Google client credentials have not been created or stored. |
| CAPTCHA protection | Implemented, configuration required | Turnstile renders only when a site key is set and forwards single-use tokens to Supabase Auth; provider keys and Supabase enforcement remain. |
| Member invitations | Implemented, backend connected | One-time, 7-day links (hash stored), shared by copy, WhatsApp or email; acceptance creates the membership and groups in one transaction; email-bound when the person has an email. Behavior-tested; the full flow with real accounts is not yet exercised. |
| Owner organization creation | Implemented, configuration required | Completes after verified authentication and migration deployment. |
| Organization branding persistence | Implemented, configuration required | Security-invoker RPC, private storage and signed URLs. |
| Branding propagation to members | Implemented, configuration required | Membership-scoped reads plus RLS-protected Realtime refresh. |
| Add one person | Implemented, backend connected | Signed-in owners save to `organization_directory` through `import_directory_entries`; preview mode keeps browser state. |
| Paste/CSV onboarding | Implemented, backend connected | RFC 4180 parsing, header detection, email/phone validation and per-row errors; signed-in owners save up to 500 people per import in one transaction. Invitations are not yet sent. |
| Directory sync | Planned | Interface explains requirements but does not simulate a connection. |
| Groups and authority assignment | Groups saved; authority prototype | Signed-in owners save groups. Authority grants need accepted members, so they wait for invitations. |
| Flexible announcement audience | Implemented, backend connected | Whole organization, groups, individuals and exclusions, resolved and permission-checked in one database transaction (behavior-tested). |
| In-app delivery records | Implemented, backend connected | Publishing creates one delivery per recipient, with the SMS fallback due time; no server secret needed. |
| Read receipts and inbox persistence | Implemented, backend connected | Members' inbox loads their own deliveries; *Mark as read* records a receipt once; owners and leaders see read counts. Not yet exercised with real accounts. |
| Hubtel SMS send/status | Implemented, disabled | Requires credentials, sender approval, test recipients, database and full-stack deployment. |
| Email copies of announcements | Implemented, configuration required | Edge Function deployed; sends through Resend once `RESEND_API_KEY`, `EMAIL_FROM` and a verified domain are set (docs/email-setup.md). Behavior- and unit-tested; real sending not yet exercised. |
| WhatsApp delivery | Planned | No production integration is claimed. |
| Billing balance | Planned | Ledger schema exists; no real account balance or top-up workflow. |
| Privacy and Terms pages | Draft | Require legal review before launch. |
| GitHub Pages preview | Live | Static interface review only. |

## Verified quality checks

At the current revision:

- ESLint and the TypeScript type check pass.
- 46 unit tests pass.
- 36 behavioral database tests pass on PGlite, and the six attack tests fail when the hardening migration is removed.
- The full application build passes.
- The GitHub Pages build passes.
- Organization identity remains visible across mobile and desktop responsive layouts.
- GitHub Actions validates pushes and deploys the preview.

Every migration in `supabase/migrations`, including the October 2026 hardening migrations and the organization-directory migrations, is applied to the hosted development project, and the repository versions match the hosted migration history. The security advisor reports no issues; the performance advisor reports informational notices only (unindexed foreign keys, unused indexes on an empty database). The
pgTAP suite still requires Docker or another supported runner. Supabase security
and performance advisors report no current issues.

## Known limitations

1. Preview-created members, groups, authorities and announcements are held in React state and disappear on refresh.
2. GitHub Pages cannot execute authentication callbacks or server API routes.
3. Production SMTP delivery and CAPTCHA are not configured.
4. Google OAuth is coded but its Google client credentials are not configured.
5. The full-stack deployment does not yet have the server-only Supabase secret.
6. Hubtel credentials and sender approval are not configured.
7. SMS provider callbacks and background fallback scheduling are not running.
8. Member read receipts are not connected to the interface.
9. Legal text is a draft and the custom production domain is not connected.
10. Accessibility has been considered in implementation but has not received a complete manual WCAG audit with assistive technology.

## Recommended implementation sequence

### Milestone 1: verify the database

- Done: the organization directory is connected to the People and Groups screens.
- Add covering indexes for the foreign keys the performance advisor lists once real query patterns are known.

- Install Docker Desktop or another supported pgTAP runner.
- Run pgTAP tests against an isolated test database.
- Keep both hosted database advisors clear as the schema evolves.

### Milestone 2: activate authentication

- Configure the server-only secret in the full-stack deployment.
- Configure SMTP and email templates; exact redirect URLs are already allow-listed.
- Configure Google OAuth.
- Add CAPTCHA and owner-registration abuse controls.
- Test owner creation, duplicate codes, password recovery and each role on two devices.

### Milestone 3: persist organization operations

- Done: invitation creation, expiry, acceptance and resend (re-inviting replaces the link).

- Replace preview people, group and authority arrays with authenticated queries.
- Implement invitation creation, expiry, acceptance and resend controls.
- Implement CSV validation, preview, confirmation, processing and audit logs.
- Add suspension, removal and authority revocation workflows.

### Milestone 4: persist communication

- Done: the composer publishes through one reviewed database transaction (`publish_announcement`).
- Done: member inbox and read receipts.
- Done: owner and authority sent history with read counts.
- Done (behavior tests): tenant isolation and authority boundaries across organizations.
- Next: persist authority assignments (grants and the authority role) so leaders can be created from the owner portal.
- Next: live updates (Supabase Realtime) so new announcements appear without refreshing.

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
