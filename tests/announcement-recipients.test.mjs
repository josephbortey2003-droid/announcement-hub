import assert from "node:assert/strict";
import test from "node:test";
import { idsOutside, resolveRecipientIds } from "../lib/announcements/recipients.ts";

const active = ["m1", "m2", "m3", "m4"];
const none = [];

test("organization-wide audiences include every active member", () => {
  const ids = resolveRecipientIds({ wholeOrganization: true, activeMembershipIds: active, individualMembershipIds: none, groupMembershipIds: none, excludedMembershipIds: none });
  assert.deepEqual([...ids].sort(), active);
});

test("group and individual audiences are combined without duplicates", () => {
  const ids = resolveRecipientIds({ wholeOrganization: false, activeMembershipIds: active, individualMembershipIds: ["m1", "m2"], groupMembershipIds: ["m2", "m3", "m3"], excludedMembershipIds: none });
  assert.deepEqual([...ids].sort(), ["m1", "m2", "m3"]);
});

test("exclusions always win, even over an individual selection", () => {
  const ids = resolveRecipientIds({ wholeOrganization: true, activeMembershipIds: active, individualMembershipIds: ["m2"], groupMembershipIds: none, excludedMembershipIds: ["m2", "m4"] });
  assert.deepEqual([...ids].sort(), ["m1", "m3"]);
});

test("suspended or removed group members never receive an announcement", () => {
  const ids = resolveRecipientIds({ wholeOrganization: false, activeMembershipIds: ["m1"], individualMembershipIds: none, groupMembershipIds: ["m1", "suspended"], excludedMembershipIds: none });
  assert.deepEqual([...ids], ["m1"]);
});

test("idsOutside reports each out-of-scope id once", () => {
  assert.deepEqual(idsOutside(["g1", "g2", "g2", "g3"], ["g1"]), ["g2", "g3"]);
  assert.deepEqual(idsOutside([], ["g1"]), []);
});
