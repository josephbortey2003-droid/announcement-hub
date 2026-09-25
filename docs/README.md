# Announcement Hub documentation

Last reviewed: 25 September 2026

This directory is the project record for Announcement Hub. It distinguishes implemented code, working prototype behavior, integration-ready work, and future plans so that demonstrations and reports do not make unsupported claims.

## Start here

- [Product specification](product-specification.md): purpose, users, roles, workflows, UX and functional requirements.
- [Technical architecture](technical-architecture.md): application structure, data model, authorization, delivery pipeline, security and deployment.
- [Project status and roadmap](project-status-and-roadmap.md): what works now, what remains simulated, validation evidence, limitations and next milestones.
- [Development history](development-history.md): chronological record of the major changes and design decisions.
- [Backend setup](backend-setup.md): local and hosted Supabase configuration.
- [Hubtel SMS setup](hubtel-sms-setup.md): controlled activation and verification of SMS delivery.
- [Design system](../design-system/announcement-hub/MASTER.md): original design reference. The current application CSS is authoritative where later user decisions superseded this early reference.

## Canonical project description

Announcement Hub is a multi-tenant organizational announcement system designed to support role-based publishing, flexible audience targeting, in-app delivery, member onboarding, organization branding and controlled SMS fallback.

The public GitHub Pages deployment is an interface preview. It cannot run the server routes required for real authentication, database persistence or Hubtel delivery. Those functions require a full-stack deployment and configured provider credentials.

## Documentation rules

- Do not describe preview data as live organizational data.
- Do not describe an SMS estimate as a completed charge.
- Do not claim that the application can reliably detect whether a person has internet access. SMS fallback is based on a missing read receipt after a configured delay.
- Do not call authentication, persistence or provider delivery active until a hosted Supabase project and required credentials are configured and verified.
- Update the status document whenever a workflow moves between planned, prototype, integration-ready and verified states.
