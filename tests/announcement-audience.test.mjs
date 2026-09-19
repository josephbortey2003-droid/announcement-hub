import assert from "node:assert/strict";
import test from "node:test";
import { resolvePreviewAudience } from "../lib/announcements/audience.ts";

const groups = [
  { id: "g-1", name: "Computer Science" },
  { id: "g-2", name: "Finance" },
];
const people = [
  { id: "p-1", group: "Computer Science", name: "Ama" },
  { id: "p-2", group: "Computer Science", name: "Kojo" },
  { id: "p-3", group: "Finance", name: "Esi" },
  { id: "p-4", group: "", name: "Yaw" },
];

test("resolves and deduplicates mixed group and individual recipients", () => {
  const result = resolvePreviewAudience({
    people,
    groups,
    wholeOrganization: false,
    groupIds: ["g-1"],
    membershipIds: ["p-1", "p-3"],
    excludedMembershipIds: [],
  });
  assert.deepEqual(result.map((person) => person.id), ["p-1", "p-2", "p-3"]);
});

test("applies exclusions after resolving an organization-wide audience", () => {
  const result = resolvePreviewAudience({
    people,
    groups,
    wholeOrganization: true,
    groupIds: [],
    membershipIds: [],
    excludedMembershipIds: ["p-2", "p-4"],
  });
  assert.deepEqual(result.map((person) => person.id), ["p-1", "p-3"]);
});
