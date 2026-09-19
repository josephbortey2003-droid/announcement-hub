BEGIN;
SELECT plan(7);

select is(
  (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity),
  16,
  'all 16 application tables have RLS enabled'
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

SELECT * FROM finish();
ROLLBACK;
