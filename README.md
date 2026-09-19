# Announcement Hub

Announcement Hub is a multi-tenant organizational communications platform for official, role-scoped announcements. It is being developed as a final-year project.

[Open the current web preview](https://announcement-hub.josephbortey2003.chatgpt.site/)

## Current prototype

The interface currently demonstrates:

- separate organization-owner, authorized-leader and member portals;
- organization branding with two colors and a circular logo;
- light, dark and device-default appearance modes;
- individual, pasted-row and CSV member onboarding previews;
- departments, offices, courses, classes and project groups;
- scoped authority assignments and audience selection;
- honest empty, error and success states;
- responsive desktop and mobile layouts;
- a PostgreSQL/Supabase multi-tenant schema and row-level security tests.

Authentication, persistent production data, WhatsApp delivery, SMS delivery and billing are not presented as active features. They require configured external services and completed security verification.

## Run locally

Requirements:

- Node.js 22.13 or newer
- npm
- Docker only when running the local Supabase stack

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Validation

```bash
npm run lint
npm run build
```

Database commands and setup instructions are documented in [docs/backend-setup.md](docs/backend-setup.md).

## Environment configuration

Copy `.env.example` to `.env.local` and provide credentials only for services you are actively testing. Never commit `.env.local`, API keys or provider secrets.

## Collaboration and updates

The `main` branch represents the current reviewed prototype. Future local edits appear on GitHub after they are committed and pushed. A connected deployment service can then redeploy automatically from `main`.

For contributions:

1. Create a branch from `main`.
2. Make and test the change.
3. Open a pull request describing the affected workflow.
4. Do not introduce fake metrics, delivery claims or placeholder integrations.

## Project status

This repository is under active development and is not yet production-ready.
