import assert from "node:assert/strict";
import test from "node:test";
import { buildAnnouncementEmail, escapeHtml, sendBatch } from "../supabase/functions/_shared/announcement-email.ts";

const row = (n, overrides = {}) => ({
  delivery_id: `d${n}`,
  email: `person${n}@example.test`,
  recipient_name: "Ama Mensah",
  organization_name: "Demo University",
  title: "Lab closed",
  body: "The lab is closed today.\n\nReturn tomorrow.",
  priority: "normal",
  published_at: "2026-10-09T08:00:00Z",
  ...overrides,
});
const options = { apiKey: "re_test", from: "Demo <announcements@example.test>", appUrl: "https://app.example.test/", announcementId: "a1" };

test("emails include the organization, title, message and a link, in text and HTML", () => {
  const email = buildAnnouncementEmail(row(1), options.from, options.appUrl);
  assert.equal(email.subject, "Lab closed | Demo University");
  assert.deepEqual(email.to, ["person1@example.test"]);
  assert.match(email.text, /^Hello Ama Mensah,\n\nDemo University published a new announcement:\n\nLab closed\n\nThe lab is closed today\.\n\nReturn tomorrow\.\n\nOpen it in Announcement Hub: https:\/\/app\.example\.test\//);
  assert.match(email.html, /<h1[^>]*>Lab closed<\/h1>/);
  assert.match(email.html, /href="https:\/\/app\.example\.test\/"/);
});

test("urgent and important announcements are marked in the subject", () => {
  assert.equal(buildAnnouncementEmail(row(1, { priority: "urgent" }), options.from, "").subject, "URGENT: Lab closed | Demo University");
  assert.equal(buildAnnouncementEmail(row(1, { priority: "important" }), options.from, "").subject, "Important: Lab closed | Demo University");
});

test("announcement text cannot inject HTML into the email", () => {
  const email = buildAnnouncementEmail(row(1, { title: "<script>alert(1)</script>", body: "<img src=x onerror=alert(1)>" }), options.from, "");
  assert.doesNotMatch(email.html, /<script>|<img/);
  assert.equal(escapeHtml(`"'&<>`), "&quot;&#39;&amp;&lt;&gt;");
  assert.doesNotMatch(email.text, /Open it in Announcement Hub/);
});

test("a batch is sent once, with an idempotency key, and each id is matched to its delivery", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ data: [{ id: "m1" }, { id: "m2" }] }), { status: 200 });
  };
  const results = await sendBatch([row(1), row(2)], { ...options, fetchImpl });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.resend.com/emails/batch");
  assert.equal(calls[0].init.headers["Idempotency-Key"], "announcement-a1-d1-d2-2");
  assert.equal(calls[0].init.headers.Authorization, "Bearer re_test");
  assert.equal(JSON.parse(calls[0].init.body).length, 2);
  assert.deepEqual(results, [
    { deliveryId: "d1", status: "sent", providerId: "m1", error: null },
    { deliveryId: "d2", status: "sent", providerId: "m2", error: null },
  ]);
});

test("provider errors and network failures mark the batch as failed", async () => {
  const rejected = await sendBatch([row(1)], { ...options, fetchImpl: async () => new Response(JSON.stringify({ message: "Domain not verified" }), { status: 403 }) });
  assert.deepEqual(rejected, [{ deliveryId: "d1", status: "failed", providerId: null, error: "Email service error 403: Domain not verified" }]);
  const offline = await sendBatch([row(1)], { ...options, fetchImpl: async () => { throw new TypeError("network"); } });
  assert.equal(offline[0].error, "The email service could not be reached.");
  const partial = await sendBatch([row(1), row(2)], { ...options, fetchImpl: async () => new Response(JSON.stringify({ data: [{ id: "m1" }] }), { status: 200 }) });
  assert.equal(partial[1].status, "failed");
});

test("batches above the provider limit are refused before sending", async () => {
  const rows = Array.from({ length: 101 }, (_, i) => row(i));
  await assert.rejects(sendBatch(rows, { ...options, fetchImpl: async () => assert.fail("must not send") }), /at most 100/);
  assert.deepEqual(await sendBatch([], options), []);
});
