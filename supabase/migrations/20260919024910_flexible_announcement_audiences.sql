alter table public.announcements
  add column audience_mode text not null default 'targeted'
  check (audience_mode in ('organization', 'targeted')),
  add column client_reference uuid not null default gen_random_uuid();

create unique index announcements_org_client_reference_idx
  on public.announcements (organization_id, client_reference);

alter table public.groups
  add constraint groups_id_organization_unique unique (id, organization_id);
alter table public.memberships
  add constraint memberships_id_organization_unique unique (id, organization_id);
alter table public.announcements
  add constraint announcements_id_organization_unique unique (id, organization_id);

alter table public.announcement_audiences
  add constraint announcement_audiences_announcement_org_fk
    foreign key (announcement_id, organization_id)
    references public.announcements (id, organization_id) on delete cascade,
  add constraint announcement_audiences_group_org_fk
    foreign key (group_id, organization_id)
    references public.groups (id, organization_id) on delete restrict;

alter table public.recipient_deliveries
  add constraint recipient_deliveries_announcement_org_fk
    foreign key (announcement_id, organization_id)
    references public.announcements (id, organization_id) on delete cascade,
  add constraint recipient_deliveries_membership_org_fk
    foreign key (membership_id, organization_id)
    references public.memberships (id, organization_id) on delete restrict;

create table public.announcement_individual_audiences (
  announcement_id uuid not null,
  organization_id uuid not null,
  membership_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (announcement_id, membership_id),
  foreign key (announcement_id, organization_id)
    references public.announcements (id, organization_id) on delete cascade,
  foreign key (membership_id, organization_id)
    references public.memberships (id, organization_id) on delete restrict
);

create table public.announcement_exclusions (
  announcement_id uuid not null,
  organization_id uuid not null,
  membership_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (announcement_id, membership_id),
  foreign key (announcement_id, organization_id)
    references public.announcements (id, organization_id) on delete cascade,
  foreign key (membership_id, organization_id)
    references public.memberships (id, organization_id) on delete restrict
);

create index announcement_individual_org_idx
  on public.announcement_individual_audiences (organization_id, membership_id);
create index announcement_exclusions_org_idx
  on public.announcement_exclusions (organization_id, membership_id);

alter table public.announcement_individual_audiences enable row level security;
alter table public.announcement_exclusions enable row level security;

revoke all on table public.announcement_individual_audiences, public.announcement_exclusions
  from anon, authenticated;
grant select, insert on table public.announcement_individual_audiences, public.announcement_exclusions
  to authenticated;

create policy announcement_individual_publisher_select
  on public.announcement_individual_audiences for select to authenticated
  using (
    private.is_org_owner(organization_id)
    or announcement_id in (
      select a.id from public.announcements a
      join public.memberships m on m.id = a.author_membership_id
      where m.user_id = (select auth.uid()) and m.status = 'active'
    )
  );
create policy announcement_individual_owner_insert
  on public.announcement_individual_audiences for insert to authenticated
  with check (private.is_org_owner(organization_id));

create policy announcement_exclusions_publisher_select
  on public.announcement_exclusions for select to authenticated
  using (
    private.is_org_owner(organization_id)
    or announcement_id in (
      select a.id from public.announcements a
      join public.memberships m on m.id = a.author_membership_id
      where m.user_id = (select auth.uid()) and m.status = 'active'
    )
  );
create policy announcement_exclusions_owner_insert
  on public.announcement_exclusions for insert to authenticated
  with check (private.is_org_owner(organization_id));
