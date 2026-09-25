-- Owners are already members, so the existing member SELECT policies cover
-- owner reads. Split the previous FOR ALL owner policies into mutation-only
-- policies to avoid evaluating two permissive policies for every SELECT.

drop policy if exists branding_owner_all on public.organization_branding;
create policy branding_owner_update
  on public.organization_branding for update to authenticated
  using (private.is_org_owner(organization_id))
  with check (private.is_org_owner(organization_id));

drop policy if exists memberships_owner_all on public.memberships;
create policy memberships_owner_insert
  on public.memberships for insert to authenticated
  with check (private.is_org_owner(organization_id));
create policy memberships_owner_update
  on public.memberships for update to authenticated
  using (private.is_org_owner(organization_id))
  with check (private.is_org_owner(organization_id));

drop policy if exists groups_owner_all on public.groups;
create policy groups_owner_insert
  on public.groups for insert to authenticated
  with check (private.is_org_owner(organization_id));
create policy groups_owner_update
  on public.groups for update to authenticated
  using (private.is_org_owner(organization_id))
  with check (private.is_org_owner(organization_id));
create policy groups_owner_delete
  on public.groups for delete to authenticated
  using (private.is_org_owner(organization_id));

drop policy if exists group_members_owner_all on public.group_members;
create policy group_members_owner_insert
  on public.group_members for insert to authenticated
  with check (private.is_org_owner(organization_id));
create policy group_members_owner_update
  on public.group_members for update to authenticated
  using (private.is_org_owner(organization_id))
  with check (private.is_org_owner(organization_id));
create policy group_members_owner_delete
  on public.group_members for delete to authenticated
  using (private.is_org_owner(organization_id));

drop policy if exists authority_grants_owner_all on public.authority_grants;
create policy authority_grants_owner_insert
  on public.authority_grants for insert to authenticated
  with check (private.is_org_owner(organization_id));
create policy authority_grants_owner_update
  on public.authority_grants for update to authenticated
  using (private.is_org_owner(organization_id))
  with check (private.is_org_owner(organization_id));
create policy authority_grants_owner_delete
  on public.authority_grants for delete to authenticated
  using (private.is_org_owner(organization_id));
