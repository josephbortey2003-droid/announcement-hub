create or replace function public.update_organization_identity(
  target_organization uuid,
  target_name text,
  target_code text,
  target_primary_color text,
  target_secondary_color text,
  target_logo_path text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected_rows integer;
begin
  if target_logo_path is not null and split_part(target_logo_path, '/', 1) <> target_organization::text then
    raise exception 'invalid_logo_path' using errcode = '22023';
  end if;

  update public.organizations
  set name = trim(target_name),
      code = upper(trim(target_code)),
      updated_at = now()
  where id = target_organization;

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'organization_not_editable' using errcode = '42501';
  end if;

  update public.organization_branding
  set primary_color = target_primary_color,
      secondary_color = target_secondary_color,
      logo_path = coalesce(target_logo_path, logo_path),
      updated_by = (select auth.uid()),
      updated_at = now()
  where organization_id = target_organization;

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'branding_not_editable' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.update_organization_identity(uuid,text,text,text,text,text) from public, anon;
grant execute on function public.update_organization_identity(uuid,text,text,text,text,text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'organizations'
  ) then
    alter publication supabase_realtime add table public.organizations;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'organization_branding'
  ) then
    alter publication supabase_realtime add table public.organization_branding;
  end if;
end;
$$;
