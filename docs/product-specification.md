# Product specification

Last reviewed: 25 September 2026

## 1. Product purpose

Announcement Hub gives an organization one controlled space for official announcements. It is intended for universities, schools, companies and similar institutions that need to contact an entire organization, departments, offices, courses, classes, projects or selected individuals without giving every staff member unrestricted publishing access.

The central product problem is delivery reliability. An announcement is first available in the application. If a recipient does not produce a read receipt within the organization’s configured delay, an approved SMS provider may be used as a fallback. This design does not claim to know whether the recipient has internet access.

## 2. User roles

### Organization owner

The owner creates and configures a space. The owner can:

- manage the organization name and unique code;
- upload a circular logo and choose two brand colors;
- add or import people;
- create organizational groups;
- assign and revoke publishing authority;
- publish to the organization, groups or selected people;
- exclude individuals from a broad audience;
- configure delivery and SMS fallback settings;
- review delivery and billing records when real providers are connected.

### Authorized leader

An authorized leader can publish only to audiences explicitly granted by the owner. A leader cannot gain authority by selecting a role on the sign-in screen. Server-side membership and authority records are the source of truth.

Examples include executives, managers, department heads, deans, heads of department and lecturers.

### Member, staff member or student

A member receives verified announcements, sees sender and audience context, reads current messages and can review history. Members do not receive creator controls.

## 3. Organization hierarchy

The intended model is a fixed hierarchy combined with explicit audience grants:

- the organization owner can publish to any valid audience;
- authorities can publish only to assigned groups and people within those groups;
- a lower authority cannot publish upward merely because the interface exposes a control;
- the server rechecks every audience when an announcement is published.

The database represents roles as `owner`, `authority` and `member`. More descriptive titles such as dean or lecturer are presentation and organizational metadata; they do not replace the authorization checks.

## 4. Access and onboarding workflows

### Owner creates a space

1. Select **Creator / Admin**.
2. Choose **Create a space**.
3. Enter full name, organization name, organization code, verified email and a password of at least 15 characters.
4. Verify the email or Google identity.
5. The application creates the profile, organization, owner membership and default branding.
6. The owner completes branding, member import, groups and authority setup.

Passwords are never generated from a person’s name, phone number or organization code.

### Existing user signs in

- Password sign-in accepts an approved email address or E.164 phone number.
- Email or phone one-time-code access is wired through Supabase Auth.
- Google OAuth is supported when the provider is configured.
- Authority and member access also requires the organization code.
- After authentication, the application loads the actual active membership and opens the correct portal. The role tile is not trusted as authorization.

### Members join

The intended production workflow is administrator-controlled onboarding:

- add one person;
- paste comma-separated rows;
- upload a CSV file;
- later, connect an approved directory such as Google Workspace or Microsoft Entra.

Individual, paste and CSV interfaces exist in the preview. Persistent imports, invitation delivery and directory synchronization are not yet complete.

## 5. Organization codes

- Codes are normalized to uppercase letters, numbers and hyphens.
- Valid length is 4 to 32 characters.
- The database has a unique constraint on `organizations.code`; two concurrent requests cannot create the same code.
- Friendly duplicate-code errors are handled during creation and branding updates.
- The organization UUID, not the code, is the tenant ownership key.
- If an owner changes the code, members use the new code on their next sign-in.

## 6. Branding and appearance

Each organization owns one branding record containing:

- primary color;
- secondary color;
- private logo path;
- last updater and update time.

The two colors are blended into a restrained organization theme instead of being split into unrelated regions. They affect navigation, controls, highlights, surfaces and background treatment. Text colors are derived for legibility.

Owners can upload PNG or JPEG logos up to 1 MiB. Logos are stored in a private, tenant-prefixed bucket and rendered through signed URLs. Organization identity is loaded for owners, authorities and members. Realtime subscriptions refresh open signed-in sessions after an owner changes the name, code, colors or logo.

The same design tokens drive desktop and mobile layouts. Responsive checks currently cover widths of 320, 768, 1024 and 1440 pixels without horizontal page overflow.

Users can choose light, dark or device-default appearance. Device mode follows the operating-system color preference.

## 7. Announcement workflow

The composer supports:

- title and message body;
- normal, important or urgent priority;
- the entire organization, for owners;
- one or more groups;
- specific members;
- individual exclusions;
- optional SMS fallback after 5, 15, 30 or 60 minutes;
- recipient preview and a final review step.

Audience resolution deduplicates recipients and applies exclusions last. The publish endpoint then:

1. authenticates the user;
2. validates the request;
3. reloads the active membership;
4. verifies every group and individual belongs to the tenant;
5. checks an authority’s active grants;
6. resolves active recipients;
7. creates the announcement and audience records;
8. snapshots recipient delivery records;
9. publishes the announcement;
10. writes an audit event.

A client request UUID makes repeated publish requests idempotent.

## 8. Delivery model

### In-app

Published announcements create one recipient-delivery record per resolved member. Read receipts are the intended evidence that a recipient opened the announcement.

### SMS fallback

SMS is eligible only when:

- the organization enabled fallback;
- the configured delay has passed;
- no read receipt exists;
- the member has a verified phone number;
- the request passes organization, role, test-recipient and spend checks;
- an SMS attempt has not already been created for that recipient delivery.

The Hubtel adapter records provider status, message ID, segment count and provider-reported rate. Actual provider rates, not speculative estimates, are written to the SMS ledger.

### WhatsApp

WhatsApp delivery remains a product option, not an implemented feature. QR-linked unofficial providers were considered but carry operational and account-policy risk. The project does not currently claim WhatsApp delivery.

## 9. UX and visual decisions

- Three role choices are presented as notebook-style index bookmarks on the access page.
- Creator, authority and member portals are distinct.
- Mobile uses a compact primary navigation plus one secondary drawer control.
- Desktop keeps full navigation visible.
- Branding remains above the appearance divider in the creator navigation.
- Icons use a consistent SVG icon set rather than emoji.
- Buttons, links and inputs have visible focus states and minimum practical touch sizes.
- Empty states avoid fake customer counts, fake activity, fake balances and fake delivery success.
- The public preview explicitly labels actions that are simulated or unavailable.
- Purple gradients, fabricated testimonials, cursor effects and excessive scroll animation are excluded by project direction.

## 10. Legal and launch requirements

The repository includes draft Privacy and Terms pages. They require professional legal review after the operating entity, providers, retention rules and final workflows are confirmed.

Before launch the project still requires:

- a custom domain;
- final favicon and organization assets;
- production privacy policy and terms;
- production email/SMTP configuration;
- abuse protection and CAPTCHA for public owner registration;
- verified provider credentials;
- acceptance, security and accessibility testing.
