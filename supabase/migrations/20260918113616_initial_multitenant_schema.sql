create extension if not exists pgcrypto;

create type public.membership_role as enum ('owner', 'authority', 'member');
create type public.membership_status as enum ('invited', 'active', 'suspended', 'removed');
create type public.announcement_status as enum ('draft', 'published', 'cancelled');
create type public.delivery_channel as enum ('in_app', 'sms');
create type public.delivery_status as enum ('pending', 'queued', 'sent', 'delivered', 'failed', 'read', 'cancelled');

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 160),
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 160),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9-]{3,31}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_branding (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  primary_color text not null default '#176B91' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text check (secondary_color is null or secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_path text,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.membership_role not null default 'member',
  hierarchy_rank integer not null default 100 check (hierarchy_rank between 0 and 1000),
  status public.membership_status not null default 'active',
  member_reference text,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id),
  unique nulls not distinct (organization_id, member_reference)
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parent_group_id uuid references public.groups(id) on delete restrict,
  name text not null check (char_length(name) between 2 and 120),
  group_type text not null check (group_type in ('department','office','course','class','project')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.group_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, membership_id)
);

create table public.authority_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  granted_by uuid not null references auth.users(id),
  can_publish boolean not null default true,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (membership_id, group_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text,
  phone_e164 text,
  intended_role public.membership_role not null default 'member',
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (email is not null or phone_e164 is not null),
  check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$')
);

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source text not null check (source in ('individual','csv','paste','directory')),
  status text not null check (status in ('validating','ready','processing','completed','failed','rolled_back')),
  row_count integer not null default 0 check (row_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  author_membership_id uuid not null references public.memberships(id),
  title text not null check (char_length(title) between 2 and 180),
  body text not null check (char_length(body) between 1 and 5000),
  priority text not null default 'normal' check (priority in ('normal','important','urgent')),
  status public.announcement_status not null default 'draft',
  sms_fallback_after_minutes integer check (sms_fallback_after_minutes between 1 and 10080),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.announcement_audiences (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete restrict,
  primary key (announcement_id, group_id)
);

create table public.recipient_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete restrict,
  in_app_status public.delivery_status not null default 'pending',
  sms_status public.delivery_status,
  sms_fallback_due_at timestamptz,
  created_at timestamptz not null default now(),
  unique (announcement_id, membership_id)
);

create table public.read_receipts (
  recipient_delivery_id uuid primary key references public.recipient_deliveries(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  read_at timestamptz not null default now()
);

create table public.delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_delivery_id uuid not null references public.recipient_deliveries(id) on delete cascade,
  channel public.delivery_channel not null,
  status public.delivery_status not null,
  provider text,
  provider_message_id text,
  failure_code text,
  attempted_at timestamptz not null default now(),
  unique nulls not distinct (provider, provider_message_id)
);

create table public.sms_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  announcement_id uuid references public.announcements(id) on delete restrict,
  amount_minor integer not null check (amount_minor >= 0),
  currency char(3) not null default 'GHS',
  entry_type text not null check (entry_type in ('credit','estimate','charge','refund','adjustment')),
  provider_reference text,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index memberships_user_org_idx on public.memberships (user_id, organization_id) where status = 'active';
create index groups_org_idx on public.groups (organization_id);
create index group_members_membership_idx on public.group_members (membership_id);
create index authority_grants_active_idx on public.authority_grants (membership_id, group_id) where revoked_at is null;
create index announcements_org_published_idx on public.announcements (organization_id, published_at desc) where status = 'published';
create index recipient_deliveries_member_idx on public.recipient_deliveries (membership_id, created_at desc);
create index recipient_deliveries_fallback_idx on public.recipient_deliveries (sms_fallback_due_at) where sms_status is null;
create index audit_events_org_time_idx on public.audit_events (organization_id, occurred_at desc);

create or replace function private.is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.memberships m where m.organization_id = target_org and m.user_id = (select auth.uid()) and m.status = 'active');
$$;

create or replace function private.is_org_owner(target_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.memberships m where m.organization_id = target_org and m.user_id = (select auth.uid()) and m.role = 'owner' and m.status = 'active');
$$;

create or replace function private.can_publish_to_group(target_org uuid, target_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.memberships m
    where m.organization_id = target_org and m.user_id = (select auth.uid()) and m.status = 'active'
      and (m.role = 'owner' or exists(
        select 1 from public.authority_grants ag where ag.membership_id = m.id and ag.group_id = target_group
          and ag.can_publish and ag.revoked_at is null and (ag.expires_at is null or ag.expires_at > now())
      ))
  );
$$;

revoke all on all functions in schema private from public, anon;
grant execute on function private.is_org_member(uuid), private.is_org_owner(uuid), private.can_publish_to_group(uuid,uuid) to authenticated;

create or replace function private.bootstrap_organization_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.memberships (organization_id,user_id,role,hierarchy_rank,status,joined_at)
  values (new.id,new.created_by,'owner',0,'active',now());
  insert into public.organization_branding (organization_id,updated_by) values (new.id,new.created_by);
  return new;
end; $$;
revoke all on function private.bootstrap_organization_owner() from public, anon, authenticated;
create trigger organizations_bootstrap_owner after insert on public.organizations for each row execute function private.bootstrap_organization_owner();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_branding enable row level security;
alter table public.memberships enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.authority_grants enable row level security;
alter table public.invitations enable row level security;
alter table public.imports enable row level security;
alter table public.announcements enable row level security;
alter table public.announcement_audiences enable row level security;
alter table public.recipient_deliveries enable row level security;
alter table public.read_receipts enable row level security;
alter table public.delivery_attempts enable row level security;
alter table public.sms_ledger enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_self_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_self_insert on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_self_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy organizations_member_select on public.organizations for select to authenticated using (private.is_org_member(id));
create policy organizations_create on public.organizations for insert to authenticated with check (created_by = (select auth.uid()));
create policy organizations_owner_update on public.organizations for update to authenticated using (private.is_org_owner(id)) with check (private.is_org_owner(id));
create policy branding_member_select on public.organization_branding for select to authenticated using (private.is_org_member(organization_id));
create policy branding_owner_all on public.organization_branding for all to authenticated using (private.is_org_owner(organization_id)) with check (private.is_org_owner(organization_id));
create policy memberships_org_select on public.memberships for select to authenticated using (private.is_org_member(organization_id));
create policy memberships_owner_all on public.memberships for all to authenticated using (private.is_org_owner(organization_id)) with check (private.is_org_owner(organization_id));
create policy groups_member_select on public.groups for select to authenticated using (private.is_org_member(organization_id));
create policy groups_owner_all on public.groups for all to authenticated using (private.is_org_owner(organization_id)) with check (private.is_org_owner(organization_id));
create policy group_members_org_select on public.group_members for select to authenticated using (private.is_org_member(organization_id));
create policy group_members_owner_all on public.group_members for all to authenticated using (private.is_org_owner(organization_id)) with check (private.is_org_owner(organization_id));
create policy authority_grants_visible on public.authority_grants for select to authenticated using (private.is_org_owner(organization_id) or membership_id in (select id from public.memberships where user_id = (select auth.uid()) and status = 'active'));
create policy authority_grants_owner_all on public.authority_grants for all to authenticated using (private.is_org_owner(organization_id)) with check (private.is_org_owner(organization_id));
create policy invitations_owner_all on public.invitations for all to authenticated using (private.is_org_owner(organization_id)) with check (private.is_org_owner(organization_id));
create policy imports_owner_all on public.imports for all to authenticated using (private.is_org_owner(organization_id)) with check (private.is_org_owner(organization_id));
create policy announcements_org_select on public.announcements for select to authenticated using (private.is_org_member(organization_id));
create policy announcements_author_insert on public.announcements for insert to authenticated with check (author_membership_id in (select id from public.memberships where user_id = (select auth.uid()) and organization_id = announcements.organization_id and role in ('owner','authority') and status = 'active'));
create policy announcements_author_update on public.announcements for update to authenticated using (author_membership_id in (select id from public.memberships where user_id = (select auth.uid()) and status = 'active')) with check (author_membership_id in (select id from public.memberships where user_id = (select auth.uid()) and status = 'active'));
create policy announcement_audiences_org_select on public.announcement_audiences for select to authenticated using (private.is_org_member(organization_id));
create policy announcement_audiences_publish_insert on public.announcement_audiences for insert to authenticated with check (private.can_publish_to_group(organization_id,group_id));
create policy recipient_delivery_self_select on public.recipient_deliveries for select to authenticated using (membership_id in (select id from public.memberships where user_id = (select auth.uid()) and status = 'active') or private.is_org_owner(organization_id));
create policy read_receipts_self_all on public.read_receipts for all to authenticated using (membership_id in (select id from public.memberships where user_id = (select auth.uid()) and status = 'active')) with check (membership_id in (select id from public.memberships where user_id = (select auth.uid()) and status = 'active'));
create policy delivery_attempts_owner_select on public.delivery_attempts for select to authenticated using (private.is_org_owner(organization_id));
create policy sms_ledger_owner_select on public.sms_ledger for select to authenticated using (private.is_org_owner(organization_id));
create policy audit_events_owner_select on public.audit_events for select to authenticated using (private.is_org_owner(organization_id));

revoke all on all tables in schema public from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.organizations to authenticated;
grant select, update on public.organization_branding to authenticated;
grant select, insert, update on public.memberships to authenticated;
grant select, insert, update, delete on public.groups, public.group_members, public.authority_grants to authenticated;
grant select, insert, update, delete on public.invitations to authenticated;
grant select, insert, update on public.imports, public.announcements to authenticated;
grant select, insert on public.announcement_audiences, public.read_receipts to authenticated;
grant select on public.recipient_deliveries, public.delivery_attempts, public.sms_ledger, public.audit_events to authenticated;
grant usage, select on all sequences in schema public to authenticated;

create policy organization_logos_member_select on storage.objects for select to authenticated
using (
  bucket_id = 'organization-logos' and exists (
    select 1 from public.organizations o
    where o.id::text = (storage.foldername(name))[1] and private.is_org_member(o.id)
  )
);
create policy organization_logos_owner_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'organization-logos' and exists (
    select 1 from public.organizations o
    where o.id::text = (storage.foldername(name))[1] and private.is_org_owner(o.id)
  )
);
create policy organization_logos_owner_update on storage.objects for update to authenticated
using (
  bucket_id = 'organization-logos' and exists (
    select 1 from public.organizations o
    where o.id::text = (storage.foldername(name))[1] and private.is_org_owner(o.id)
  )
) with check (
  bucket_id = 'organization-logos' and exists (
    select 1 from public.organizations o
    where o.id::text = (storage.foldername(name))[1] and private.is_org_owner(o.id)
  )
);
create policy organization_logos_owner_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'organization-logos' and exists (
    select 1 from public.organizations o
    where o.id::text = (storage.foldername(name))[1] and private.is_org_owner(o.id)
  )
);
