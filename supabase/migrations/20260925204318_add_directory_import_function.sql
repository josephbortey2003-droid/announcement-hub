-- Treat group names case-insensitively so imports cannot create visually
-- duplicated departments such as "Finance" and "finance".
create unique index groups_org_name_casefold_unique
  on public.groups (organization_id, lower(name));

create policy audit_events_owner_insert
  on public.audit_events for insert to authenticated
  with check (
    private.is_org_owner(organization_id)
    and actor_user_id = (select auth.uid())
  );
grant insert on public.audit_events to authenticated;

create or replace function public.import_directory_entries(
  target_organization uuid,
  import_source text,
  entries jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  import_id uuid;
  entry jsonb;
  entry_id uuid;
  group_id uuid;
  row_count integer;
  full_name_value text;
  email_value text;
  phone_value text;
  group_value text;
begin
  if actor is null or not private.is_org_owner(target_organization) then
    raise exception 'Only an active organization owner can import people.' using errcode = '42501';
  end if;

  if import_source not in ('individual','csv','paste') then
    raise exception 'Unsupported import source.' using errcode = '22023';
  end if;
  if jsonb_typeof(entries) <> 'array' then
    raise exception 'Entries must be a JSON array.' using errcode = '22023';
  end if;

  row_count := jsonb_array_length(entries);
  if row_count < 1 or row_count > 500 then
    raise exception 'Import between 1 and 500 people at a time.' using errcode = '22023';
  end if;

  insert into public.imports (organization_id, source, status, row_count, created_by)
  values (target_organization, import_source, 'processing', row_count, actor)
  returning id into import_id;

  for entry in select value from jsonb_array_elements(entries)
  loop
    full_name_value := trim(coalesce(entry->>'fullName',''));
    email_value := nullif(lower(trim(coalesce(entry->>'email',''))), '');
    phone_value := nullif(trim(coalesce(entry->>'phoneE164','')), '');
    group_value := nullif(trim(coalesce(entry->>'groupName','')), '');

    if char_length(full_name_value) < 2 or (email_value is null and phone_value is null) then
      raise exception 'Every person needs a name and an email or phone number.' using errcode = '22023';
    end if;

    insert into public.organization_directory (
      organization_id, full_name, email, phone_e164, onboarding_status, created_by
    ) values (
      target_organization, full_name_value, email_value, phone_value, 'staged', actor
    ) returning id into entry_id;

    if group_value is not null then
      select g.id into group_id
      from public.groups g
      where g.organization_id = target_organization and lower(g.name) = lower(group_value)
      limit 1;

      if group_id is null then
        insert into public.groups (organization_id, name, group_type, created_by)
        values (target_organization, group_value, 'department', actor)
        returning id into group_id;
      end if;

      insert into public.directory_group_assignments (organization_id, directory_entry_id, group_id)
      values (target_organization, entry_id, group_id);
    end if;
  end loop;

  update public.imports
  set status = 'completed', completed_at = now()
  where id = import_id;

  insert into public.audit_events (organization_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    target_organization,
    actor,
    'directory.imported',
    'import',
    import_id::text,
    jsonb_build_object('source', import_source, 'row_count', row_count)
  );

  return jsonb_build_object('importId', import_id, 'rowCount', row_count);
end;
$$;

revoke all on function public.import_directory_entries(uuid,text,jsonb) from public, anon;
grant execute on function public.import_directory_entries(uuid,text,jsonb) to authenticated;
