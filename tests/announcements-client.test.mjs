import assert from "node:assert/strict";
import test from "node:test";
import { loadInbox, loadSentAnnouncements, markAnnouncementRead, publishAnnouncement } from "../lib/supabase/announcements.ts";

const rpcClient = (result) => {
  const calls = [];
  return { calls, rpc: async (name, args) => { calls.push({ name, args }); return result; } };
};

const draft = {
  clientRequestId: "11111111-1111-4111-8111-111111111111",
  title: "Lab closed",
  body: "The lab is closed today.",
  priority: "important",
  audienceLabel: "1 group",
  audience: { wholeOrganization: false, groupIds: ["g1"], membershipIds: ["m1"], excludedMembershipIds: ["m2"] },
  recipientIds: ["m1"],
  smsFallbackMinutes: 15,
};

test("publishing sends the draft in the shape publish_announcement expects", async () => {
  const client = rpcClient({ data: { announcementId: "a1", duplicate: false, recipientCount: 4 }, error: null });
  assert.deepEqual(await publishAnnouncement(client, "org-1", draft), { announcementId: "a1", duplicate: false, recipientCount: 4 });
  assert.deepEqual(client.calls[0], {
    name: "publish_announcement",
    args: {
      target_organization: "org-1", request_reference: draft.clientRequestId, announcement_title: "Lab closed", announcement_body: "The lab is closed today.",
      announcement_priority: "important", whole_organization: false, group_ids: ["g1"], membership_ids: ["m1"], excluded_membership_ids: ["m2"], sms_fallback_minutes: 15,
    },
  });
});

test("publishing errors become plain explanations", async () => {
  await assert.rejects(publishAnnouncement(rpcClient({ data: null, error: { code: "42501", message: "group_outside_authority" } }), "org-1", draft), /outside your authority/);
  await assert.rejects(publishAnnouncement(rpcClient({ data: null, error: { code: "23514", message: "new row violates check constraint" } }), "org-1", draft), /2 to 180 characters/);
  await assert.rejects(publishAnnouncement(rpcClient({ data: null, error: { code: "XX000", message: "boom" } }), "org-1", draft), /Nothing was sent/);
});

test("sent history labels the viewer's own announcements and keeps counts", async () => {
  const rows = [
    { announcement_id: "a1", title: "T", body: "B", priority: "normal", audience_mode: "organization", published_at: "2026-10-09T08:00:00Z", author_role: "owner", mine: true, recipient_count: 10, read_count: 4 },
    { announcement_id: "a2", title: "T2", body: "B2", priority: "urgent", audience_mode: "targeted", published_at: "2026-10-09T07:00:00Z", author_role: "authority", mine: false, recipient_count: 3, read_count: 0 },
  ];
  const items = await loadSentAnnouncements(rpcClient({ data: rows, error: null }), "org-1");
  assert.deepEqual(items.map((item) => [item.sender, item.audienceLabel, item.recipientCount, item.readCount]), [
    ["You", "Everyone in the organization", 10, 4],
    ["Authorized leader", "Selected groups and people", 3, 0],
  ]);
});

test("the inbox keeps delivery ids and read times for marking as read", async () => {
  const items = await loadInbox(rpcClient({ data: [{ delivery_id: "d1", announcement_id: "a1", title: "T", body: "B", priority: "normal", published_at: "x", author_role: "owner", read_at: null }], error: null }), "org-1");
  assert.equal(items[0].deliveryId, "d1");
  assert.equal(items[0].readAt, null);
  assert.equal(items[0].sender, "Organization owner");
  const client = rpcClient({ data: "2026-10-09T08:05:00Z", error: null });
  assert.equal(await markAnnouncementRead(client, "d1"), "2026-10-09T08:05:00Z");
  assert.deepEqual(client.calls[0], { name: "mark_announcement_read", args: { target_delivery: "d1" } });
  await assert.rejects(markAnnouncementRead(rpcClient({ data: null, error: null }), "d-other"), /could not be marked/);
});

test("a leader's publishing scope skips revoked, expired and non-publishing grants", async () => {
  const rows = [
    { revoked_at: null, expires_at: null, can_publish: true, groups: { id: "g2", name: "Science", group_type: "department" } },
    { revoked_at: "2026-10-01T00:00:00Z", expires_at: null, can_publish: true, groups: { id: "g3", name: "Old", group_type: "office" } },
    { revoked_at: null, expires_at: "2026-10-01T00:00:00Z", can_publish: true, groups: { id: "g4", name: "Expired", group_type: "class" } },
    { revoked_at: null, expires_at: null, can_publish: false, groups: { id: "g5", name: "Read only", group_type: "class" } },
    { revoked_at: null, expires_at: "2027-01-01T00:00:00Z", can_publish: true, groups: [{ id: "g1", name: "Finance", group_type: "office" }] },
  ];
  const query = { select: () => query, eq: async () => ({ data: rows, error: null }) };
  const client = { from: () => query };
  const { loadPublishingGroups } = await import("../lib/supabase/announcements.ts");
  assert.deepEqual(await loadPublishingGroups(client, "org-1", new Date("2026-10-09T00:00:00Z")), [
    { id: "g1", name: "Finance", type: "Office" },
    { id: "g2", name: "Science", type: "Department" },
  ]);
});

test("email notification keeps calling until every recipient is handled", async () => {
  const { notifyAnnouncementByEmail } = await import("../lib/supabase/announcements.ts");
  const replies = [
    { data: { configured: true, sent: 500, failed: 0, remaining: true }, error: null },
    { data: { configured: true, sent: 40, failed: 2, remaining: false }, error: null },
  ];
  const calls = [];
  const client = { functions: { invoke: async (name, options) => { calls.push({ name, options }); return replies.shift(); } } };
  assert.deepEqual(await notifyAnnouncementByEmail(client, "org-1", "a1"), { configured: true, sent: 540, failed: 2 });
  assert.deepEqual(calls[0], { name: "notify-announcement", options: { body: { organizationId: "org-1", announcementId: "a1" } } });
  assert.equal(calls.length, 2);
});

test("email notification reports when email is not configured or not deployed", async () => {
  const { notifyAnnouncementByEmail } = await import("../lib/supabase/announcements.ts");
  const notConfigured = { functions: { invoke: async () => ({ data: { configured: false, sent: 0, failed: 0, remaining: false }, error: null }) } };
  assert.deepEqual(await notifyAnnouncementByEmail(notConfigured, "org-1", "a1"), { configured: false, sent: 0, failed: 0 });
  const missing = { functions: { invoke: async () => ({ data: null, error: new Error("404") }) } };
  assert.equal(await notifyAnnouncementByEmail(missing, "org-1", "a1"), null);
});
