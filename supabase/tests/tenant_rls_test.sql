BEGIN;
SELECT plan(11);

select is(
  (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity),
  19,
  'all 19 application tables have RLS enabled'
);

select is(
  (select count(*)::integer from information_schema.role_table_grants where grantee='anon' and table_schema='public'),
  0,
  'anonymous clients have no public table grants'
);

select ok(
  has_table_privilege('authenticated','public.organizations','SELECT') and
  has_table_privilege('authenticated','public.organizations','INSERT') and
  has_table_privilege('authenticated','public.organizations','UPDATE') and
  not has_table_privilege('authenticated','public.organizations','DELETE'),
  'organization grants are explicit and least privilege'
);

select ok(
  (select count(*) = 3 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('is_org_member','is_org_owner','can_publish_to_group') and p.prosecdef),
  'authorization helpers are security-definer functions in the private schema'
);

select ok(
  not has_function_privilege('anon','private.is_org_member(uuid)','EXECUTE') and
  has_function_privilege('authenticated','private.is_org_member(uuid)','EXECUTE'),
  'authorization helpers are unavailable to anonymous callers'
);

select ok(
  exists(select 1 from pg_indexes where schemaname='public' and indexname='memberships_user_org_idx') and
  exists(select 1 from pg_indexes where schemaname='public' and indexname='recipient_deliveries_fallback_idx'),
  'tenant lookup and SMS fallback indexes exist'
);

select ok(
  exists(select 1 from pg_policies where schemaname='public' and tablename='groups' and policyname='groups_owner_all') and
  exists(select 1 from pg_policies where schemaname='public' and tablename='recipient_deliveries' and policyname='recipient_delivery_self_select'),
  'owner and recipient isolation policies exist'
);

select ok(
  exists(select 1 from pg_policies where schemaname='public' and tablename='organization_sms_settings' and policyname='organization_sms_settings_owner_select') and
  not has_table_privilege('anon','public.organization_sms_settings','SELECT') and
  has_table_privilege('authenticated','public.organization_sms_settings','SELECT'),
  'SMS settings are owner-readable and unavailable anonymously'
);

select ok(
  exists(select 1 from pg_indexes where schemaname='public' and indexname='delivery_attempts_sms_once_idx') and
  exists(select 1 from pg_indexes where schemaname='public' and indexname='delivery_attempts_status_poll_idx') and
  exists(select 1 from pg_indexes where schemaname='public' and indexname='sms_ledger_provider_charge_idx'),
  'SMS attempts are idempotent and queued attempts are indexed for polling'
);

select ok(
  exists(select 1 from pg_policies where schemaname='public' and tablename='announcement_individual_audiences' and policyname='announcement_individual_publisher_select') and
  exists(select 1 from pg_policies where schemaname='public' and tablename='announcement_exclusions' and policyname='announcement_exclusions_publisher_select'),
  'individual audiences and exclusions are visible only to publishers'
);

select ok(
  exists(select 1 from information_schema.table_constraints where constraint_schema='public' and constraint_name='announcement_audiences_group_org_fk') and
  exists(select 1 from information_schema.table_constraints where constraint_schema='public' and constraint_name='recipient_deliveries_membership_org_fk'),
  'audience and delivery references cannot cross tenant boundaries'
);

SELECT * FROM finish();
ROLLBACK;
