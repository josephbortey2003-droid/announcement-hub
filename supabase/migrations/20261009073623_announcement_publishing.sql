-- Announcement publishing, member inbox, read receipts and sent history.
--
-- Publishing used to be a multi-step server route that needed the service-role
-- secret and undid its work by deleting the draft if a later step failed. It is
-- now one database function, so an announcement and all of its audience and
-- delivery records are created together or not at all, and no server secret is
-- needed. The function re-checks every permission itself: an organization's
-- owner may publish to anyone in it; an authority only to groups they hold an
-- active grant for, and to individuals inside those groups.
--
-- Recipients are active members only. Exclusions always win, and the author is
-- never sent their own announcement.

-- Publishing ------------------------------------------------------------------
create function private.publish_announcement(
  target_organization uuid,
  request_reference uuid,
  announcement_title text,
  announcement_body text,
  announcement_priority text,
  whole_organization boolean,
  group_ids uuid[],
  membership_ids uuid[],
  excluded_membership_ids uuid[],
  sms_fallback_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  author record;
  existing record;
  groups_wanted uuid[] := array(select distinct x from unnest(coalesce(group_ids, '{}')) as x);
  people_wanted uuid[] := array(select distinct x from unnest(coalesce(membership_ids, '{}')) as x);
  people_excluded uuid[] := array(select distinct x from unnest(coalesce(excluded_membership_ids, '{}')) as x);
  granted uuid[];
  recipients uuid[];
  new_id uuid;
  published timestamptz := now();
begin
  if actor is null then
    raise exception 'Sign in before publishing.' using errcode = '42501';
  end if;

  select m.id, m.role into author
  from public.memberships m
  where m.organization_id = target_organization and m.user_id = actor and m.status = 'active';
  if not found or author.role not in ('owner', 'authority') then
    raise exception 'publish_not_allowed' using errcode = '42501';
  end if;

  -- A retried request returns the announcement it already created.
  select a.id, a.author_membership_id into existing
  from public.announcements a
  where a.organization_id = target_organization and a.client_reference = request_reference;
  if found then
    if existing.author_membership_id <> author.id and author.role <> 'owner' then
      raise exception 'request_reference_in_use' using errcode = '23505';
    end if;
    return jsonb_build_object('announcementId', existing.id, 'duplicate', true,
      'recipientCount', (select count(*) from public.recipient_deliveries d where d.announcement_id = existing.id));
  end if;

  if announcement_priority not in ('normal', 'important', 'urgent') then
    raise exception 'invalid_priority' using errcode = '22023';
  end if;
  if sms_fallback_minutes is not null and sms_fallback_minutes not in (5, 15, 30, 60) then
    raise exception 'invalid_fallback' using errcode = '22023';
  end if;
  if cardinality(groups_wanted) > 100 or cardinality(people_wanted) > 500 or cardinality(people_excluded) > 500 then
    raise exception 'audience_too_large' using errcode = '22023';
  end if;
  if not whole_organization and cardinality(groups_wanted) = 0 and cardinality(people_wanted) = 0 then
    raise exception 'audience_missing' using errcode = '22023';
  end if;
  if author.role = 'authority' and whole_organization then
    raise exception 'organization_wide_owner_only' using errcode = '42501';
  end if;

  -- Every group must belong to this organization.
  if (select count(*) from public.groups g where g.organization_id = target_organization and g.id = any(groups_wanted)) <> cardinality(groups_wanted) then
    raise exception 'group_outside_organization' using errcode = '22023';
  end if;
  -- Every named or excluded person must be an active member of this organization.
  if exists (
    select 1 from unnest(people_wanted || people_excluded) as p(id)
    where not exists (select 1 from public.memberships m where m.id = p.id and m.organization_id = target_organization and m.status = 'active')
  ) then
    raise exception 'person_not_active_member' using errcode = '22023';
  end if;

  if author.role = 'authority' then
    granted := array(
      select ag.group_id from public.authority_grants ag
      where ag.membership_id = author.id and ag.can_publish and ag.revoked_at is null
        and (ag.expires_at is null or ag.expires_at > now())
    );
    if exists (select 1 from unnest(groups_wanted) as g(id) where g.id <> all(granted)) then
      raise exception 'group_outside_authority' using errcode = '42501';
    end if;
    if exists (
      select 1 from unnest(people_wanted) as p(id)
      where not exists (select 1 from public.group_members gm where gm.membership_id = p.id and gm.group_id = any(granted))
    ) then
      raise exception 'person_outside_authority' using errcode = '42501';
    end if;
  end if;

  recipients := array(
    select m.id from public.memberships m
    where m.organization_id = target_organization and m.status = 'active'
      and m.id <> author.id
      and m.id <> all(people_excluded)
      and (
        whole_organization
        or m.id = any(people_wanted)
        or exists (select 1 from public.group_members gm where gm.membership_id = m.id and gm.group_id = any(groups_wanted))
      )
    order by m.id
  );
  if cardinality(recipients) = 0 then
    raise exception 'audience_empty' using errcode = '22023';
  end if;

  insert into public.announcements (organization_id, author_membership_id, title, body, priority, status, audience_mode,
                                    sms_fallback_after_minutes, client_reference, published_at)
  values (target_organization, author.id, trim(announcement_title), trim(announcement_body), announcement_priority, 'published',
          case when whole_organization then 'organization' else 'targeted' end, sms_fallback_minutes, request_reference, published)
  returning id into new_id;

  insert into public.announcement_audiences (announcement_id, organization_id, group_id)
  select new_id, target_organization, g from unnest(groups_wanted) as g;
  insert into public.announcement_individual_audiences (announcement_id, organization_id, membership_id)
  select new_id, target_organization, p from unnest(people_wanted) as p;
  insert into public.announcement_exclusions (announcement_id, organization_id, membership_id)
  select new_id, target_organization, p from unnest(people_excluded) as p;

  insert into public.recipient_deliveries (organization_id, announcement_id, membership_id, in_app_status, sms_fallback_due_at)
  select target_organization, new_id, r, 'delivered',
         case when sms_fallback_minutes is null then null else published + make_interval(mins => sms_fallback_minutes) end
  from unnest(recipients) as r;

  insert into public.audit_events (organization_id, actor_user_id, action, target_type, target_id, metadata)
  values (target_organization, actor, 'announcement.published', 'announcement', new_id::text,
          jsonb_build_object('audience_mode', case when whole_organization then 'organization' else 'targeted' end,
                             'group_count', cardinality(groups_wanted), 'individual_count', cardinality(people_wanted),
                             'exclusion_count', cardinality(people_excluded), 'recipient_count', cardinality(recipients)));

  return jsonb_build_object('announcementId', new_id, 'duplicate', false, 'recipientCount', cardinality(recipients));
end;
$$;

-- Sent history with delivery and read counts ------------------------------------
-- Owners see every announcement in the organization; an authority sees their own.
create function private.sent_announcements(target_organization uuid)
returns table (announcement_id uuid, title text, body text, priority text, audience_mode text, published_at timestamptz,
               author_role text, mine boolean, recipient_count integer, read_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer record;
begin
  select m.id, m.role into viewer
  from public.memberships m
  where m.organization_id = target_organization and m.user_id = (select auth.uid()) and m.status = 'active';
  if not found or viewer.role not in ('owner', 'authority') then
    raise exception 'history_not_allowed' using errcode = '42501';
  end if;

  return query
  select a.id, a.title, a.body, a.priority, a.audience_mode, a.published_at, author.role::text, a.author_membership_id = viewer.id,
         (select count(*)::integer from public.recipient_deliveries d where d.announcement_id = a.id),
         (select count(*)::integer from public.recipient_deliveries d join public.read_receipts r on r.recipient_delivery_id = d.id where d.announcement_id = a.id)
  from public.announcements a
  join public.memberships author on author.id = a.author_membership_id
  where a.organization_id = target_organization and a.status = 'published'
    and (viewer.role = 'owner' or a.author_membership_id = viewer.id)
  order by a.published_at desc, a.id
  limit 200;
end;
$$;

-- Member inbox and read receipts (row-level security applies) --------------------
create function public.my_announcements(target_organization uuid)
returns table (delivery_id uuid, announcement_id uuid, title text, body text, priority text, published_at timestamptz,
               author_role text, read_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select d.id, a.id, a.title, a.body, a.priority, a.published_at, author.role::text, r.read_at
  from public.recipient_deliveries d
  join public.memberships me on me.id = d.membership_id and me.user_id = (select auth.uid())
  join public.announcements a on a.id = d.announcement_id and a.status = 'published'
  join public.memberships author on author.id = a.author_membership_id
  left join public.read_receipts r on r.recipient_delivery_id = d.id
  where d.organization_id = target_organization
  order by a.published_at desc, a.id
  limit 200;
$$;

create function public.mark_announcement_read(target_delivery uuid)
returns timestamptz
language sql
security invoker
set search_path = ''
as $$
  insert into public.read_receipts (recipient_delivery_id, organization_id, membership_id)
  select d.id, d.organization_id, d.membership_id
  from public.recipient_deliveries d
  join public.memberships me on me.id = d.membership_id and me.user_id = (select auth.uid()) and me.status = 'active'
  where d.id = target_delivery
  on conflict (recipient_delivery_id) do nothing;
  select r.read_at from public.read_receipts r where r.recipient_delivery_id = target_delivery;
$$;

-- Public wrappers for the elevated functions (see 20261009072158_private_invitation_functions.sql) --
create function public.publish_announcement(
  target_organization uuid, request_reference uuid, announcement_title text, announcement_body text, announcement_priority text,
  whole_organization boolean, group_ids uuid[], membership_ids uuid[], excluded_membership_ids uuid[], sms_fallback_minutes integer
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.publish_announcement(target_organization, request_reference, announcement_title, announcement_body, announcement_priority,
                                      whole_organization, group_ids, membership_ids, excluded_membership_ids, sms_fallback_minutes);
$$;

create function public.sent_announcements(target_organization uuid)
returns table (announcement_id uuid, title text, body text, priority text, audience_mode text, published_at timestamptz,
               author_role text, mine boolean, recipient_count integer, read_count integer)
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.sent_announcements(target_organization); $$;

revoke all on function private.publish_announcement(uuid, uuid, text, text, text, boolean, uuid[], uuid[], uuid[], integer) from public, anon;
revoke all on function private.sent_announcements(uuid) from public, anon;
revoke all on function public.publish_announcement(uuid, uuid, text, text, text, boolean, uuid[], uuid[], uuid[], integer) from public, anon;
revoke all on function public.sent_announcements(uuid) from public, anon;
revoke all on function public.my_announcements(uuid) from public, anon;
revoke all on function public.mark_announcement_read(uuid) from public, anon;
grant execute on function private.publish_announcement(uuid, uuid, text, text, text, boolean, uuid[], uuid[], uuid[], integer) to authenticated;
grant execute on function private.sent_announcements(uuid) to authenticated;
grant execute on function public.publish_announcement(uuid, uuid, text, text, text, boolean, uuid[], uuid[], uuid[], integer) to authenticated;
grant execute on function public.sent_announcements(uuid) to authenticated;
grant execute on function public.my_announcements(uuid) to authenticated;
grant execute on function public.mark_announcement_read(uuid) to authenticated;

-- The member inbox looks deliveries up by member and newest first.
create index recipient_deliveries_org_member_idx on public.recipient_deliveries (organization_id, membership_id, created_at desc);
