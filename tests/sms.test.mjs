import assert from "node:assert/strict";
import test from "node:test";
import { normalizeE164 } from "../lib/sms/phone.ts";
import { calculateSmsSegments } from "../lib/sms/segments.ts";

test("normalizes common Ghana phone formats to E.164", () => {
  assert.equal(normalizeE164("024 123 4567"), "+233241234567");
  assert.equal(normalizeE164("00233-24-123-4567"), "+233241234567");
  assert.equal(normalizeE164("+233241234567"), "+233241234567");
});

test("rejects malformed phone numbers", () => {
  assert.throws(() => normalizeE164("not-a-number"));
  assert.throws(() => normalizeE164("123"));
});

test("calculates GSM-7 single and multipart messages", () => {
  assert.deepEqual(calculateSmsSegments("A".repeat(160)), {
    encoding: "GSM-7",
    units: 160,
    segments: 1,
  });
  assert.equal(calculateSmsSegments("A".repeat(161)).segments, 2);
  assert.equal(calculateSmsSegments("^").units, 2);
});

test("calculates Unicode SMS segments, including surrogate pairs", () => {
  assert.deepEqual(calculateSmsSegments("🙂".repeat(35)), {
    encoding: "UCS-2",
    units: 70,
    segments: 1,
  });
  assert.equal(calculateSmsSegments("🙂".repeat(36)).segments, 2);
});
