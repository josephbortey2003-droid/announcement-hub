import assert from "node:assert/strict";
import test from "node:test";
import { createOrganizationGroup, importOrganizationPeople, loadOrganizationDirectory, MAX_DIRECTORY_IMPORT } from "../lib/supabase/directory.ts";

// A minimal stand-in for the Supabase client: each table returns fixed rows,
// and rpc/insert calls are recorded so the test can inspect what was sent.
function fakeClient({ tables = {}, rpcError = null, insertResult = null } = {}) {
  const calls = { rpc: [], insert: [] };
  const query = (rows) => {
    const chain = {
      select: () => chain, eq: () => chain, order: () => chain,
      single: async () => insertResult,
      then: (resolve) => resolve({ data: rows, error: null }),
      insert: (value) => { calls.insert.push(value); return chain; },
    };
    return chain;
  };
  return {
    calls,
    from: (table) => query(tables[table] ?? []),
    rpc: async (name, args) => { calls.rpc.push({ name, args }); return { error: rpcError }; },
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
  };
}

const tables = {
  groups: [{ id: "g1", name: "Science", group_type: "department" }, { id: "g2", name: "Lab", group_type: "office" }],
  organization_directory: [
    { id: "d1", membership_id: null, full_name: "Ama Mensah", email: "ama@example.test", phone_e164: "+233241234567", onboarding_status: "staged" },
    { id: "d2", membership_id: "m2", full_name: "Kojo Asante", email: null, phone_e164: "+233201234567", onboarding_status: "active" },
  ],
  directory_group_assignments: [{ directory_entry_id: "d1", group_id: "g1" }, { directory_entry_id: "d1", group_id: "g2" }],
};

test("loads directory people with their groups, status and membership", async () => {
  const { people, groups } = await loadOrganizationDirectory(fakeClient({ tables }), "org-1");
  assert.deepEqual(groups, [{ id: "g1", name: "Science", type: "Department" }, { id: "g2", name: "Lab", type: "Office" }]);
  assert.deepEqual(people[0], { id: "d1", membershipId: undefined, name: "Ama Mensah", email: "ama@example.test", phone: "+233241234567", group: "Science, Lab", status: "staged" });
  assert.equal(people[1].membershipId, "m2");
  assert.equal(people[1].email, "");
});

test("imports send the shape import_directory_entries expects", async () => {
  const client = fakeClient({ tables });
  await importOrganizationPeople(client, "org-1", "csv", [{ name: "Esi Owusu", email: "esi@example.test", phone: "", group: "Science" }]);
  assert.deepEqual(client.calls.rpc, [{
    name: "import_directory_entries",
    args: { target_organization: "org-1", import_source: "csv", entries: [{ fullName: "Esi Owusu", email: "esi@example.test", phoneE164: "", groupName: "Science" }] },
  }]);
});

test("database errors become clear messages", async () => {
  const person = [{ name: "Esi", email: "esi@example.test", phone: "", group: "" }];
  await assert.rejects(importOrganizationPeople(fakeClient({ rpcError: { code: "23505" } }), "org-1", "individual", person), /already has an email address or phone number/);
  await assert.rejects(importOrganizationPeople(fakeClient({ rpcError: { code: "42501" } }), "org-1", "individual", person), /Only an organization owner/);
});

test("refuses empty and oversized imports before calling the database", async () => {
  const client = fakeClient();
  await assert.rejects(importOrganizationPeople(client, "org-1", "paste", []), /nobody to import/);
  const many = Array.from({ length: MAX_DIRECTORY_IMPORT + 1 }, (_, i) => ({ name: `P ${i}`, email: `p${i}@x.test`, phone: "", group: "" }));
  await assert.rejects(importOrganizationPeople(client, "org-1", "paste", many), /at most 500/);
  assert.equal(client.calls.rpc.length, 0);
});

test("creating a group stores the database type and reports duplicates", async () => {
  const client = fakeClient({ insertResult: { data: { id: "g9", name: "Robotics", group_type: "project" }, error: null } });
  assert.deepEqual(await createOrganizationGroup(client, "org-1", { name: " Robotics ", type: "Project" }), { id: "g9", name: "Robotics", type: "Project" });
  assert.deepEqual(client.calls.insert[0], { organization_id: "org-1", name: "Robotics", group_type: "project", created_by: "user-1" });
  const duplicate = fakeClient({ insertResult: { data: null, error: { code: "23505" } } });
  await assert.rejects(createOrganizationGroup(duplicate, "org-1", { name: "Science", type: "Department" }), /already exists/);
});
