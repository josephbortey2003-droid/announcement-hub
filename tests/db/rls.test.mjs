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
  create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, phone text);
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
const USERS = { ownerA: id(1), ownerB: id(2), authorityA: id(3), memberA: id(4), ama: id(5), stranger: id(6), unconfirmed: id(7) };
const ORG_A = id(101);
const ORG_B = id(102);
const MEMBERSHIP = { authorityA: id(203), memberA: id(204) };
const GROUP_A = id(301);
const ANNOUNCEMENT_A = id(401);
const DELIVERY = { authorityA: id(503), memberA: id(504) };

let db;

async function asUser(userId, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
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
    insert into auth.users (id, email, email_confirmed_at) values
      ('${USERS.ownerA}', 'owner-a@example.test', now()), ('${USERS.ownerB}', 'owner-b@example.test', now()),
      ('${USERS.authorityA}', 'leader-a@example.test', now()), ('${USERS.memberA}', 'member-a@example.test', now()),
      ('${USERS.ama}', 'Ama@Example.test', now()), ('${USERS.stranger}', 'stranger@example.test', now()),
      ('${USERS.unconfirmed}', 'kojo@example.test', null);
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

// Organization directory (supabase/migrations/20260925204035 and 20260925204318)

const importAs = (userId, organizationId, entries) =>
  asUser(userId, "select public.import_directory_entries($1, 'csv', $2::jsonb) as result", [organizationId, JSON.stringify(entries)]);

test("an owner can import people, and missing groups are created case-insensitively", async () => {
  await importAs(USERS.ownerA, ORG_A, [
    { fullName: "Ama Mensah", email: "ama@example.test", phoneE164: "+233241234567", groupName: "science" },
    { fullName: "Kojo Asante", email: "kojo@example.test", phoneE164: "", groupName: "Finance" },
  ]);
  const people = await asUser(USERS.ownerA, "select full_name, onboarding_status from public.organization_directory order by full_name");
  assert.deepEqual(people.rows, [{ full_name: "Ama Mensah", onboarding_status: "staged" }, { full_name: "Kojo Asante", onboarding_status: "staged" }]);
  // "science" matched the existing "Science" group instead of creating a duplicate.
  const groups = await asUser(USERS.ownerA, "select name from public.groups order by name");
  assert.deepEqual(groups.rows.map((row) => row.name), ["Finance", "Science"]);
  const audit = await asUser(USERS.ownerA, "select action from public.audit_events where action = 'directory.imported'");
  assert.equal(audit.rows.length, 1);
});

test("an import with a duplicate email saves nobody", async () => {
  await rejectsWithCode(
    importAs(USERS.ownerA, ORG_A, [
      { fullName: "New Person", email: "new@example.test", phoneE164: "", groupName: "" },
      { fullName: "Ama Again", email: "AMA@example.test", phoneE164: "", groupName: "" },
    ]),
    "23505",
    "duplicate emails must be refused"
  );
  const { rows } = await asUser(USERS.ownerA, "select count(*)::int as count from public.organization_directory where email = 'new@example.test'");
  assert.equal(rows[0].count, 0);
});

test("only the organization's owner can import or read its directory", async () => {
  await rejectsWithCode(importAs(USERS.memberA, ORG_A, [{ fullName: "Sneaky", email: "s@example.test" }]), "42501", "members cannot import");
  await rejectsWithCode(importAs(USERS.ownerB, ORG_A, [{ fullName: "Sneaky", email: "s@example.test" }]), "42501", "other owners cannot import");
  const member = await asUser(USERS.memberA, "select id from public.organization_directory");
  assert.equal(member.rows.length, 0);
  const otherOwner = await asUser(USERS.ownerB, "select id from public.organization_directory");
  assert.equal(otherOwner.rows.length, 0);
});

test("imports are limited to 500 people per call", async () => {
  const entries = Array.from({ length: 501 }, (_, i) => ({ fullName: `Person ${i}`, email: `p${i}@example.test` }));
  await rejectsWithCode(importAs(USERS.ownerA, ORG_A, entries), "22023", "oversized imports must be refused");
});

// Member invitations (supabase/migrations/*_member_invitations.sql)

const directoryId = async (email) =>
  (await db.query("select id from public.organization_directory where email = $1", [email])).rows[0].id;
const invite = (userId, entryIds, days = 7) =>
  asUser(userId, "select * from public.create_member_invitations($1, $2::uuid[], $3)", [ORG_A, entryIds, days]);
const accept = (userId, token) => asUser(userId, "select public.accept_member_invitation($1) as organization_id", [token]);
const preview = (token) => db.transaction(async (tx) => {
  await tx.exec("set local role anon");
  return tx.query("select * from public.preview_invitation($1)", [token]);
});

test("only the owner can create invitations, and only a hash of the token is stored", async () => {
  const ama = await directoryId("ama@example.test");
  await rejectsWithCode(invite(USERS.memberA, [ama]), "42501", "members cannot invite");
  await rejectsWithCode(invite(USERS.ownerB, [ama]), "42501", "other owners cannot invite");
  const { rows } = await invite(USERS.ownerA, [ama]);
  assert.equal(rows.length, 1);
  assert.match(rows[0].token, /^[0-9a-f]{64}$/);
  const stored = await db.query("select token_hash from public.invitations where directory_entry_id = $1", [ama]);
  assert.notEqual(stored.rows[0].token_hash, rows[0].token);
  const status = await db.query("select onboarding_status from public.organization_directory where id = $1", [ama]);
  assert.equal(status.rows[0].onboarding_status, "invited");
});

test("anyone holding a link can preview it, but a wrong token shows nothing", async () => {
  const ama = await directoryId("ama@example.test");
  const { rows } = await invite(USERS.ownerA, [ama]);
  const shown = await preview(rows[0].token);
  assert.equal(shown.rows[0].organization_code, "ORG-A");
  assert.equal(shown.rows[0].invitee_name, "Ama Mensah");
  assert.equal(shown.rows[0].status, "valid");
  assert.equal(shown.rows[0].email_required, true);
  assert.equal((await preview("0".repeat(64))).rows.length, 0);
});

test("re-inviting replaces the link, so the old one stops working", async () => {
  const ama = await directoryId("ama@example.test");
  const first = (await invite(USERS.ownerA, [ama])).rows[0].token;
  const second = (await invite(USERS.ownerA, [ama])).rows[0].token;
  assert.notEqual(first, second);
  assert.equal((await preview(first)).rows.length, 0);
  await rejectsWithCode(accept(USERS.ama, first), "P0002", "a replaced link must not work");
});

test("an invitation with an email can only be accepted by that confirmed email", async () => {
  const ama = await directoryId("ama@example.test");
  const { token } = (await invite(USERS.ownerA, [ama])).rows[0];
  await rejectsWithCode(accept(USERS.stranger, token), "42501", "a different account must be refused");
  await rejectsWithCode(accept(null, token), "42501", "signing in is required");
});

test("an unconfirmed email cannot accept", async () => {
  const kojo = await directoryId("kojo@example.test");
  const { token } = (await invite(USERS.ownerA, [kojo])).rows[0];
  await rejectsWithCode(accept(USERS.unconfirmed, token), "42501", "the email must be confirmed");
});

test("accepting creates an active membership with the person's groups, once", async () => {
  const ama = await directoryId("ama@example.test");
  const { token } = (await invite(USERS.ownerA, [ama])).rows[0];
  const { rows } = await accept(USERS.ama, token);
  assert.equal(rows[0].organization_id, ORG_A);

  const membership = await db.query("select id, role, status from public.memberships where organization_id = $1 and user_id = $2", [ORG_A, USERS.ama]);
  assert.deepEqual({ role: membership.rows[0].role, status: membership.rows[0].status }, { role: "member", status: "active" });
  const entry = await db.query("select membership_id, onboarding_status from public.organization_directory where id = $1", [ama]);
  assert.deepEqual(entry.rows[0], { membership_id: membership.rows[0].id, onboarding_status: "active" });
  const groups = await db.query(
    "select g.name from public.group_members gm join public.groups g on g.id = gm.group_id where gm.membership_id = $1",
    [membership.rows[0].id]
  );
  assert.deepEqual(groups.rows.map((row) => row.name), ["Science"]);
  const profile = await db.query("select full_name from public.profiles where id = $1", [USERS.ama]);
  assert.equal(profile.rows[0].full_name, "Ama Mensah");

  await rejectsWithCode(accept(USERS.ama, token), "P0002", "a used link must not work again");
  assert.equal((await preview(token)).rows[0].status, "used");
  // The new member now sees their organization.
  const visible = await asUser(USERS.ama, "select code from public.organizations");
  assert.deepEqual(visible.rows, [{ code: "ORG-A" }]);
});

test("active members cannot be invited again", async () => {
  const ama = await directoryId("ama@example.test");
  await rejectsWithCode(invite(USERS.ownerA, [ama]), "22023", "active members must be refused");
});

test("expired invitations are refused", async () => {
  const kojo = await directoryId("kojo@example.test");
  const { token } = (await invite(USERS.ownerA, [kojo], 1)).rows[0];
  await db.query("update public.invitations set expires_at = now() - interval '1 minute' where token_hash = encode(sha256(convert_to($1, 'UTF8')), 'hex')", [token]);
  assert.equal((await preview(token)).rows[0].status, "expired");
  await db.query("update auth.users set email_confirmed_at = now() where id = $1", [USERS.unconfirmed]);
  await rejectsWithCode(accept(USERS.unconfirmed, token), "P0002", "expired links must not work");
});

test("people from another organization cannot be invited", async () => {
  await rejectsWithCode(invite(USERS.ownerA, [id(999)]), "22023", "unknown directory entries must be refused");
});

test("signed-out visitors can run only the invitation preview, and elevated functions stay private", async () => {
  const anonymous = await db.query(`
    select n.nspname || '.' || p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'EXECUTE')
      -- Extension functions (pgcrypto) live in the "extensions" schema on Supabase, not in public.
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    order by 1`);
  assert.deepEqual(anonymous.rows.map((row) => row.name), ["private.preview_invitation", "public.preview_invitation"]);
  const exposedDefiners = await db.query(`
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')`);
  assert.deepEqual(exposedDefiners.rows, []);
});
