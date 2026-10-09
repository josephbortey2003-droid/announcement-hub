-- Harden announcement and read-receipt writes.
--
-- 1. Publishing runs only through the server route (app/api/announcements/publish),
--    which authorizes the caller and then writes with the service role. Browser
--    sessions therefore no longer need direct write access to announcement
--    tables. Removing it closes a cross-tenant hole: the old update policy only
--    checked that the author was *some* membership of the caller, so an authority
--    could move their own announcement into another organization's inbox.
-- 2. An announcement's author must belong to the announcement's organization,
--    and an announcement can never be moved to another organization.
-- 3. A read receipt must refer to the reader's own delivery. Previously a member
--    could file a receipt against someone else's delivery and suppress that
--    person's SMS fallback. The read time is always set by the database.

-- 1. Server-only announcement writes
drop policy if exists announcements_author_insert on public.announcements;
drop policy if exists announcements_author_update on public.announcements;
drop policy if exists announcement_audiences_publish_insert on public.announcement_audiences;
drop policy if exists announcement_individual_owner_insert on public.announcement_individual_audiences;
drop policy if exists announcement_exclusions_owner_insert on public.announcement_exclusions;

revoke insert, update on table public.announcements from authenticated;
revoke insert on table
  public.announcement_audiences,
  public.announcement_individual_audiences,
  public.announcement_exclusions
from authenticated;

-- 2. Authors belong to the announcement's organization; organizations never change
alter table public.announcements
  add constraint announcements_author_org_fk
    foreign key (author_membership_id, organization_id)
    references public.memberships (id, organization_id);

create or replace function private.prevent_announcement_organization_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'announcement_organization_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_announcement_organization_change() from public, anon, authenticated;

create trigger announcements_organization_immutable
  before update of organization_id on public.announcements
  for each row execute function private.prevent_announcement_organization_change();

-- 3. Read receipts must match the reader's own delivery
alter table public.recipient_deliveries
  add constraint recipient_deliveries_id_member_org_unique
    unique (id, membership_id, organization_id);

alter table public.read_receipts
  add constraint read_receipts_own_delivery_fk
    foreign key (recipient_delivery_id, membership_id, organization_id)
    references public.recipient_deliveries (id, membership_id, organization_id)
    on delete cascade;

drop policy if exists read_receipts_self_all on public.read_receipts;
create policy read_receipts_self_select
  on public.read_receipts for select to authenticated
  using (membership_id in (
    select id from public.memberships
    where user_id = (select auth.uid()) and status = 'active'
  ));
create policy read_receipts_self_insert
  on public.read_receipts for insert to authenticated
  with check (membership_id in (
    select id from public.memberships
    where user_id = (select auth.uid()) and status = 'active'
  ));

-- Column-level grant: clients cannot choose read_at, so receipts cannot be backdated.
revoke insert on table public.read_receipts from authenticated;
grant insert (recipient_delivery_id, organization_id, membership_id)
  on table public.read_receipts to authenticated;
