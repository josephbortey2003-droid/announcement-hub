// Behavioral row-level-security tests that run without Docker.
//
// PGlite is a real PostgreSQL 17 engine compiled to WebAssembly. The test
// creates the small part of Supabase that the migrations depend on (auth.users,
// auth.uid(), storage.objects, the anon/authenticated roles and the realtime
// publication), applies every migration in supabase/migrations in order, and
// then acts as different signed-in users to prove what each one can and cannot do.
//
// Run with: npm run test:db

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const MIGRATIONS = join(import.meta.dirname, "..", "..", "supabase", "migrations");

const SUPABASE_SHIM = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;

  create schema storage;
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  alter table storage.objects enable row level security;

  create publication supabase_realtime;
  grant usage on schema public to anon, authenticated;
`;

// Fixed ids keep the fixtures readable in failure messages.
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const USERS = { ownerA: id(1), ownerB: id(2), authorityA: id(3), memberA: id(4) };
const ORG_A = id(101);
const ORG_B = id(102);
const MEMBERSHIP = { authorityA: id(203), memberA: id(204) };
const GROUP_A = id(301);
const ANNOUNCEMENT_A = id(401);
const DELIVERY = { authorityA: id(503), memberA: id(504) };

let db;

async function asUser(userId, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await tx.exec("set local role authenticated");
    return tx.query(sql, params);
  });
}

async function asAnonymous(sql) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role anon");
    return tx.query(sql);
  });
}

async function rejectsWithCode(promise, code, message) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `${message} (got ${error.code}: ${error.message})`);
    return true;
  });
}

before(async () => {
  db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_SHIM);
  const files = (await readdir(MIGRATIONS)).filter((name) => name.endsWith(".sql")).sort();
  for (const file of files) await db.exec(await readFile(join(MIGRATIONS, file), "utf8"));

  // Fixtures are created as the database owner, exactly as the service role would.
  await db.exec(`
    insert into auth.users (id, email) values
      ('${USERS.ownerA}', 'owner-a@example.test'), ('${USERS.ownerB}', 'owner-b@example.test'),
      ('${USERS.authorityA}', 'leader-a@example.test'), ('${USERS.memberA}', 'member-a@example.test');
    insert into public.organizations (id, name, code, created_by) values
      ('${ORG_A}', 'Org A', 'ORG-A', '${USERS.ownerA}'),
      ('${ORG_B}', 'Org B', 'ORG-B', '${USERS.ownerB}');
    insert into public.memberships (id, organization_id, user_id, role, status) values
      ('${MEMBERSHIP.authorityA}', '${ORG_A}', '${USERS.authorityA}', 'authority', 'active'),
      ('${MEMBERSHIP.memberA}', '${ORG_A}', '${USERS.memberA}', 'member', 'active');
    insert into public.groups (id, organization_id, name, group_type, created_by) values
      ('${GROUP_A}', '${ORG_A}', 'Science', 'department', '${USERS.ownerA}');
    insert into public.authority_grants (organization_id, membership_id, group_id, granted_by) values
      ('${ORG_A}', '${MEMBERSHIP.authorityA}', '${GROUP_A}', '${USERS.ownerA}');
    insert into public.announcements (id, organization_id, author_membership_id, title, body, status)
      values ('${ANNOUNCEMENT_A}', '${ORG_A}', '${MEMBERSHIP.authorityA}', 'Lab closed', 'The lab is closed today.', 'published');
    insert into public.recipient_deliveries (id, organization_id, announcement_id, membership_id) values
      ('${DELIVERY.authorityA}', '${ORG_A}', '${ANNOUNCEMENT_A}', '${MEMBERSHIP.authorityA}'),
      ('${DELIVERY.memberA}', '${ORG_A}', '${ANNOUNCEMENT_A}', '${MEMBERSHIP.memberA}');
  `);
});

after(async () => {
  await db?.close();
});

test("creating an organization makes its creator the owner", async () => {
  const { rows } = await db.query(
    "select role from public.memberships where organization_id = $1 and user_id = $2",
    [ORG_A, USERS.ownerA]
  );
  assert.deepEqual(rows, [{ role: "owner" }]);
});

test("many members can join without a member reference, but references stay unique", async () => {
  // Org A already has an owner, an authority and a member, all without a reference.
  const { rows } = await db.query(
    "select count(*)::int as count from public.memberships where organization_id = $1 and member_reference is null",
    [ORG_A]
  );
  assert.equal(rows[0].count, 3);
  await db.query("update public.memberships set member_reference = 'STU-001' where id = $1", [MEMBERSHIP.memberA]);
  await rejectsWithCode(
    db.query("update public.memberships set member_reference = 'STU-001' where id = $1", [MEMBERSHIP.authorityA]),
    "23505",
    "duplicate references in one organization must be refused"
  );
});

test("members see only their own organization's announcements", async () => {
  const own = await asUser(USERS.memberA, "select id from public.announcements");
  assert.deepEqual(own.rows.map((row) => row.id), [ANNOUNCEMENT_A]);
  const other = await asUser(USERS.ownerB, "select id from public.announcements");
  assert.equal(other.rows.length, 0);
});

test("anonymous clients cannot read organizations", async () => {
  await rejectsWithCode(asAnonymous("select * from public.organizations"), "42501", "anon must be denied");
});

test("an authority cannot write announcements directly from the browser", async () => {
  await rejectsWithCode(
    asUser(USERS.authorityA, `
      insert into public.announcements (organization_id, author_membership_id, title, body)
      values ('${ORG_A}', '${MEMBERSHIP.authorityA}', 'Direct', 'Bypassing the publish route')`),
    "42501",
    "direct inserts must be refused"
  );
});

test("an authority cannot move an announcement into another organization", async () => {
  await rejectsWithCode(
    asUser(USERS.authorityA, `update public.announcements set organization_id = '${ORG_B}' where id = '${ANNOUNCEMENT_A}'`),
    "42501",
    "browser updates must be refused"
  );
  // Even the service role cannot move it: the organization is immutable.
  await rejectsWithCode(
    db.query(`update public.announcements set organization_id = '${ORG_B}' where id = '${ANNOUNCEMENT_A}'`),
    "42501",
    "organization changes must be refused by the trigger"
  );
});

test("an announcement author must belong to the announcement's organization", async () => {
  await rejectsWithCode(
    db.query(`
      insert into public.announcements (organization_id, author_membership_id, title, body)
      values ('${ORG_B}', '${MEMBERSHIP.authorityA}', 'Spoofed', 'Author from another organization')`),
    "23503",
    "cross-organization authors must violate the foreign key"
  );
});

test("a member cannot file a read receipt for someone else's delivery", async () => {
  await rejectsWithCode(
    asUser(USERS.memberA, `
      insert into public.read_receipts (recipient_delivery_id, organization_id, membership_id)
      values ('${DELIVERY.authorityA}', '${ORG_A}', '${MEMBERSHIP.memberA}')`),
    "23503",
    "receipts must reference the reader's own delivery"
  );
});

test("a member cannot backdate a read receipt", async () => {
  await rejectsWithCode(
    asUser(USERS.memberA, `
      insert into public.read_receipts (recipient_delivery_id, organization_id, membership_id, read_at)
      values ('${DELIVERY.memberA}', '${ORG_A}', '${MEMBERSHIP.memberA}', now() - interval '1 day')`),
    "42501",
    "read_at must not be client-writable"
  );
});

test("a member can mark their own delivery as read and see the receipt", async () => {
  await asUser(USERS.memberA, `
    insert into public.read_receipts (recipient_delivery_id, organization_id, membership_id)
    values ('${DELIVERY.memberA}', '${ORG_A}', '${MEMBERSHIP.memberA}')`);
  const mine = await asUser(USERS.memberA, "select recipient_delivery_id from public.read_receipts");
  assert.deepEqual(mine.rows.map((row) => row.recipient_delivery_id), [DELIVERY.memberA]);
  const others = await asUser(USERS.authorityA, "select recipient_delivery_id from public.read_receipts");
  assert.equal(others.rows.length, 0);
});

test("members see only their own deliveries, owners see all of their organization's", async () => {
  const member = await asUser(USERS.memberA, "select id from public.recipient_deliveries");
  assert.deepEqual(member.rows.map((row) => row.id), [DELIVERY.memberA]);
  const owner = await asUser(USERS.ownerA, "select id from public.recipient_deliveries order by id");
  assert.deepEqual(owner.rows.map((row) => row.id), [DELIVERY.authorityA, DELIVERY.memberA]);
  const otherOwner = await asUser(USERS.ownerB, "select id from public.recipient_deliveries");
  assert.equal(otherOwner.rows.length, 0);
});

test("only owners can change organization identity", async () => {
  await rejectsWithCode(
    asUser(USERS.memberA, `select public.update_organization_identity('${ORG_A}', 'Hijacked', 'HIJACK', '#000000', '#ffffff')`),
    "42501",
    "members must not edit identity"
  );
  await asUser(USERS.ownerA, `select public.update_organization_identity('${ORG_A}', 'Org A Renamed', 'ORG-A', '#112233', '#445566')`);
  const { rows } = await db.query("select name from public.organizations where id = $1", [ORG_A]);
  assert.equal(rows[0].name, "Org A Renamed");
});
