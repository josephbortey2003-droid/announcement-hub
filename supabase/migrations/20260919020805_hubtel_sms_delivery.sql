create table public.organization_sms_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  provider text not null default 'hubtel' check (provider = 'hubtel'),
  sender_id text not null check (sender_id ~ '^[A-Za-z0-9]{1,11}$'),
  fallback_enabled boolean not null default false,
  fallback_after_minutes integer not null default 5 check (fallback_after_minutes between 1 and 10080),
  daily_spend_limit_minor integer check (daily_spend_limit_minor is null or daily_spend_limit_minor >= 0),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.delivery_attempts
  add column client_reference uuid not null default gen_random_uuid(),
  add column provider_response_code text,
  add column provider_status text,
  add column rate_minor integer check (rate_minor is null or rate_minor >= 0),
  add column unit_count integer check (unit_count is null or unit_count >= 0),
  add column last_status_checked_at timestamptz,
  add column provider_updated_at timestamptz;

create unique index delivery_attempts_sms_once_idx
  on public.delivery_attempts (recipient_delivery_id)
  where channel = 'sms';

create index delivery_attempts_status_poll_idx
  on public.delivery_attempts (last_status_checked_at, attempted_at)
  where channel = 'sms' and status in ('queued', 'sent');

create unique index sms_ledger_provider_charge_idx
  on public.sms_ledger (provider_reference)
  where entry_type = 'charge' and provider_reference is not null;

alter table public.organization_sms_settings enable row level security;

revoke all on table public.organization_sms_settings from anon, authenticated;
grant select, insert, update on table public.organization_sms_settings to authenticated;

create policy organization_sms_settings_owner_select
  on public.organization_sms_settings for select to authenticated
  using (private.is_org_owner(organization_id));

create policy organization_sms_settings_owner_insert
  on public.organization_sms_settings for insert to authenticated
  with check (
    private.is_org_owner(organization_id)
    and updated_by = (select auth.uid())
  );

create policy organization_sms_settings_owner_update
  on public.organization_sms_settings for update to authenticated
  using (private.is_org_owner(organization_id))
  with check (
    private.is_org_owner(organization_id)
    and updated_by = (select auth.uid())
  );
