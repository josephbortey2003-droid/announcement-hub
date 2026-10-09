-- Store people before they accept an invitation and receive an auth user.
-- Memberships remain the source of truth for authenticated access; directory
-- entries are the owner's onboarding roster and may later link to a membership.
create table public.organization_directory (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid unique references public.memberships(id) on delete set null,
  full_name text not null check (char_length(full_name) between 2 and 160),
  email text check (
    email is null or (
      email = lower(email)
      and char_length(email) between 3 and 320
      and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  ),
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  member_reference text check (member_reference is null or char_length(member_reference) between 1 and 80),
  onboarding_status text not null default 'staged'
    check (onboarding_status in ('staged','invited','active','suspended')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is not null or phone_e164 is not null),
  unique (id, organization_id)
);

create unique index organization_directory_email_unique
  on public.organization_directory (organization_id, lower(email))
  where email is not null;
create unique index organization_directory_phone_unique
  on public.organization_directory (organization_id, phone_e164)
  where phone_e164 is not null;
create unique index organization_directory_reference_unique
  on public.organization_directory (organization_id, member_reference)
  where member_reference is not null;
create index organization_directory_org_status_idx
  on public.organization_directory (organization_id, onboarding_status, created_at desc);

create table public.directory_group_assignments (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  directory_entry_id uuid not null,
  group_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (directory_entry_id, group_id),
  foreign key (directory_entry_id, organization_id)
    references public.organization_directory (id, organization_id) on delete cascade,
  foreign key (group_id, organization_id)
    references public.groups (id, organization_id) on delete cascade
);

create index directory_group_assignments_group_idx
  on public.directory_group_assignments (group_id, directory_entry_id);

alter table public.invitations
  add column directory_entry_id uuid unique references public.organization_directory(id) on delete cascade;

alter table public.organization_directory enable row level security;
alter table public.directory_group_assignments enable row level security;

create policy organization_directory_owner_select
  on public.organization_directory for select to authenticated
  using (private.is_org_owner(organization_id));
create policy organization_directory_owner_insert
  on public.organization_directory for insert to authenticated
  with check (private.is_org_owner(organization_id) and created_by = (select auth.uid()));
create policy organization_directory_owner_update
  on public.organization_directory for update to authenticated
  using (private.is_org_owner(organization_id))
  with check (private.is_org_owner(organization_id));
create policy organization_directory_owner_delete
  on public.organization_directory for delete to authenticated
  using (private.is_org_owner(organization_id));

create policy directory_group_assignments_owner_select
  on public.directory_group_assignments for select to authenticated
  using (private.is_org_owner(organization_id));
create policy directory_group_assignments_owner_insert
  on public.directory_group_assignments for insert to authenticated
  with check (private.is_org_owner(organization_id));
create policy directory_group_assignments_owner_delete
  on public.directory_group_assignments for delete to authenticated
  using (private.is_org_owner(organization_id));

grant select, insert, update, delete on public.organization_directory to authenticated;
grant select, insert, delete on public.directory_group_assignments to authenticated;
