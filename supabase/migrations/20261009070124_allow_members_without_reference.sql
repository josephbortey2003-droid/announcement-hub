-- Allow any number of members without a member reference.
--
-- The initial schema declared `unique nulls not distinct (organization_id, member_reference)`.
-- With NULLS NOT DISTINCT, two NULL references count as duplicates, so an
-- organization could hold only one membership without a reference number. The
-- owner membership created by the bootstrap trigger has none, which meant the
-- second member added without a reference failed with a unique violation.
--
-- References stay unique when they are present; missing references are allowed.

alter table public.memberships
  drop constraint if exists memberships_organization_id_member_reference_key;

create unique index memberships_org_member_reference_idx
  on public.memberships (organization_id, member_reference)
  where member_reference is not null;
