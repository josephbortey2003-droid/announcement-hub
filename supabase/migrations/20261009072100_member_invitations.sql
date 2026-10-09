-- Member invitations.
--
-- An owner invites people from the organization directory. Each invitation has a
-- random 64-character token that is returned to the owner exactly once; only its
-- SHA-256 hash is stored, so the database never holds a usable link. Links expire
-- and can be used once. Re-inviting replaces the token, which cancels the old link.
--
-- Accepting runs as one transaction: it creates (or reactivates) the membership,
-- links the directory entry, copies the person's groups and marks the invitation
-- used. If the invitation names an email address, the signed-in account must have
-- that same, confirmed email, so a forwarded link is useless to anyone else.
-- Phone-only invitations act as bearer links because phone sign-in needs an SMS
-- provider that is not configured yet.

-- A person is invited as a member; authority is granted separately.
alter table public.invitations
  add constraint invitations_member_role_only check (intended_role = 'member');

create index invitations_organization_idx on public.invitations (organization_id, created_at desc);

-- Owner: create or refresh invitations ----------------------------------------
create or replace function public.create_member_invitations(
  target_organization uuid,
  entry_ids uuid[],
  valid_days integer default 7
)
returns table (directory_entry_id uuid, full_name text, email text, phone_e164 text, token text, expires_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  actor uuid := (select auth.uid());
  entry record;
  new_token text;
  new_expiry timestamptz := now() + make_interval(days => valid_days);
  requested integer := coalesce(array_length(entry_ids, 1), 0);
  found_count integer := 0;
begin
  if actor is null or not private.is_org_owner(target_organization) then
    raise exception 'Only an active organization owner can invite people.' using errcode = '42501';
  end if;
  if requested < 1 or requested > 500 then
    raise exception 'Invite between 1 and 500 people at a time.' using errcode = '22023';
  end if;
  if valid_days < 1 or valid_days > 30 then
    raise exception 'Invitations must last between 1 and 30 days.' using errcode = '22023';
  end if;

  for entry in
    select d.id, d.full_name, d.email, d.phone_e164, d.onboarding_status
    from public.organization_directory d
    where d.organization_id = target_organization and d.id = any(entry_ids)
    order by d.full_name
    for update
  loop
    found_count := found_count + 1;
    if entry.onboarding_status not in ('staged', 'invited') then
      raise exception '% is already an active or suspended member.', entry.full_name using errcode = '22023';
    end if;

    -- 2 x 122 random bits from gen_random_uuid(); stored only as a SHA-256 hash.
    new_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

    insert into public.invitations (organization_id, directory_entry_id, email, phone_e164, intended_role, token_hash, expires_at, created_by)
    values (target_organization, entry.id, entry.email, entry.phone_e164, 'member',
            encode(sha256(convert_to(new_token, 'UTF8')), 'hex'), new_expiry, actor)
    on conflict on constraint invitations_directory_entry_id_key do update
      set token_hash = excluded.token_hash,
          email = excluded.email,
          phone_e164 = excluded.phone_e164,
          expires_at = excluded.expires_at,
          accepted_at = null,
          created_by = excluded.created_by,
          created_at = now();

    update public.organization_directory
      set onboarding_status = 'invited', updated_at = now()
      where id = entry.id;

    directory_entry_id := entry.id;
    full_name := entry.full_name;
    email := entry.email;
    phone_e164 := entry.phone_e164;
    token := new_token;
    expires_at := new_expiry;
    return next;
  end loop;

  if found_count <> (select count(distinct x) from unnest(entry_ids) as x) then
    raise exception 'One or more people are not in this organization''s directory.' using errcode = '22023';
  end if;

  insert into public.audit_events (organization_id, actor_user_id, action, target_type, target_id, metadata)
  values (target_organization, actor, 'invitations.created', 'organization', target_organization::text,
          jsonb_build_object('count', found_count, 'valid_days', valid_days));
end;
$$;

revoke all on function public.create_member_invitations(uuid, uuid[], integer) from public, anon;
grant execute on function public.create_member_invitations(uuid, uuid[], integer) to authenticated;

-- Anyone holding a link: see what it is for ----------------------------------
create or replace function public.preview_invitation(invite_token text)
returns table (organization_name text, organization_code text, invitee_name text, email_required boolean, status text, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name, o.code, d.full_name, i.email is not null,
         case when i.accepted_at is not null then 'used'
              when i.expires_at <= now() then 'expired'
              else 'valid' end,
         i.expires_at
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  join public.organization_directory d on d.id = i.directory_entry_id
  where i.token_hash = encode(sha256(convert_to(coalesce(invite_token, ''), 'UTF8')), 'hex');
$$;

revoke all on function public.preview_invitation(text) from public;
grant execute on function public.preview_invitation(text) to anon, authenticated;

-- Signed-in invitee: accept ---------------------------------------------------
create or replace function public.accept_member_invitation(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  invitation record;
  account record;
  entry record;
  member_id uuid;
begin
  if actor is null then
    raise exception 'Sign in before accepting an invitation.' using errcode = '42501';
  end if;

  select * into invitation
  from public.invitations
  where token_hash = encode(sha256(convert_to(coalesce(invite_token, ''), 'UTF8')), 'hex')
  for update;

  if not found or invitation.accepted_at is not null or invitation.directory_entry_id is null then
    raise exception 'invitation_invalid' using errcode = 'P0002', hint = 'This invitation link is not valid or has already been used.';
  end if;
  if invitation.expires_at <= now() then
    raise exception 'invitation_expired' using errcode = 'P0002', hint = 'This invitation has expired. Ask the organization owner for a new link.';
  end if;

  select u.email, u.email_confirmed_at into account from auth.users u where u.id = actor;
  if invitation.email is not null
     and (account.email is null or lower(account.email) <> invitation.email or account.email_confirmed_at is null) then
    raise exception 'invitation_email_mismatch' using errcode = '42501',
      hint = 'Sign in with the email address the invitation was sent to.';
  end if;

  select * into entry from public.organization_directory where id = invitation.directory_entry_id for update;

  select id into member_id from public.memberships
  where organization_id = invitation.organization_id and user_id = actor;
  if member_id is null then
    insert into public.memberships (organization_id, user_id, role, status, joined_at)
    values (invitation.organization_id, actor, invitation.intended_role, 'active', now())
    returning id into member_id;
  else
    update public.memberships
      set status = 'active', joined_at = coalesce(joined_at, now()), updated_at = now()
      where id = member_id and status in ('invited', 'removed');
  end if;

  update public.organization_directory
    set membership_id = member_id, onboarding_status = 'active', updated_at = now()
    where id = entry.id;

  insert into public.group_members (organization_id, group_id, membership_id)
  select invitation.organization_id, a.group_id, member_id
  from public.directory_group_assignments a
  where a.directory_entry_id = entry.id
  on conflict do nothing;

  insert into public.profiles (id, full_name, phone_e164)
  values (actor, entry.full_name, entry.phone_e164)
  on conflict (id) do nothing;

  update public.invitations set accepted_at = now() where id = invitation.id;

  insert into public.audit_events (organization_id, actor_user_id, action, target_type, target_id, metadata)
  values (invitation.organization_id, actor, 'invitation.accepted', 'membership', member_id::text,
          jsonb_build_object('directory_entry_id', entry.id));

  return invitation.organization_id;
end;
$$;

revoke all on function public.accept_member_invitation(text) from public, anon;
grant execute on function public.accept_member_invitation(text) to authenticated;
