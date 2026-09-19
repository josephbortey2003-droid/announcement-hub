# Hubtel SMS setup

The application code is ready, but real sending remains disabled until the
project owner completes the provider and hosting steps below.

## 1. Prepare Hubtel

1. Create or activate a Hubtel developer/business account.
2. Request approval for an alphanumeric sender ID of no more than 11 characters.
3. Add credit to the Hubtel account if the selected product requires prepaid credit.
4. In the Hubtel portal, copy the SMS API base URL, Client ID and Client Secret.

Do not paste credentials into source files, GitHub issues, screenshots or chat.

## 2. Configure the server

Copy `.env.example` to `.env.local` and fill the server-only values. Start in
test mode with only your own phone number in `HUBTEL_SMS_TEST_RECIPIENTS`.

```dotenv
HUBTEL_SMS_ENABLED=true
HUBTEL_SMS_MODE=test
HUBTEL_SMS_BASE_URL=https://the-host-from-your-hubtel-portal/v1/messages
HUBTEL_CLIENT_ID=...
HUBTEL_CLIENT_SECRET=...
HUBTEL_SENDER_ID=YourSender
HUBTEL_SMS_TEST_RECIPIENTS=+233...
```

The application uses HTTP Basic authentication in the `Authorization` header
and POSTs to `{HUBTEL_SMS_BASE_URL}/send`. It deliberately does not use a
quick-send URL containing credentials.

## 3. Apply and verify the database

```powershell
npm run supabase:start
npm run supabase:reset
npm run supabase:test
```

In production, apply the committed migrations to the linked Supabase project.
Store `SUPABASE_SECRET_KEY` and all Hubtel values in the hosting provider's
encrypted environment settings. They must never have a `NEXT_PUBLIC_` prefix.

## 4. Enable an organization

An organization owner must create its `organization_sms_settings` record with
the approved sender ID, `fallback_enabled = true`, a delay, and an optional
daily spending limit. The server still re-checks the user's role, authority
scope, publication state, fallback due time, read receipt, verified phone,
test allowlist and idempotency constraint before contacting Hubtel.

## 5. Production checklist

- Send to an allowlisted test phone first.
- Confirm the Hubtel message ID is saved in `delivery_attempts`.
- Query the status endpoint and compare it with the Hubtel portal.
- Confirm the actual Hubtel rate is written to `sms_ledger`; do not present a
  pre-send estimate as a final charge.
- Rotate credentials after any suspected exposure.
- Change `HUBTEL_SMS_MODE` to `live` only after sender approval and acceptance testing.

## API endpoints

- `POST /api/sms/send` with `{ "recipientDeliveryId": "uuid" }`
- `GET /api/sms/status/{hubtelMessageId}`

Both endpoints require a real Supabase session. The local prototype preview
cannot call them. Status polling can later be scheduled with Supabase Cron or
the production hosting scheduler after the project is deployed.
