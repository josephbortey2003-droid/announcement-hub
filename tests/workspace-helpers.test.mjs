import assert from "node:assert/strict";
import test from "node:test";
import { demoBrand, initials, mergeNewPeople, parseSignInIdentifier, readableText, setupProgress } from "../lib/workspace/model.ts";

test("initials use the first two words and fall back to AH", () => {
  assert.equal(initials("Kwame Nkrumah University"), "KN");
  assert.equal(initials("   "), "AH");
});

test("readableText picks dark text on light brand colours and white on dark ones", () => {
  assert.equal(readableText("#ffffff"), "#071c2d");
  assert.equal(readableText("#d6ad43"), "#071c2d");
  assert.equal(readableText("#176b91"), "#ffffff");
  assert.equal(readableText("not-a-colour"), "#ffffff");
});

test("sign-in identifiers are recognised as email or E.164 phone", () => {
  assert.deepEqual(parseSignInIdentifier(" ama@example.com "), { email: "ama@example.com" });
  assert.deepEqual(parseSignInIdentifier("024 123 4567"), { phone: "+233241234567" });
  assert.deepEqual(parseSignInIdentifier("+233241234567"), { phone: "+233241234567" });
  assert.equal(parseSignInIdentifier("ama@"), null);
  assert.equal(parseSignInIdentifier("ama"), null);
  assert.equal(parseSignInIdentifier(""), null);
});

test("people already in the directory are not added twice", () => {
  const existing = [{ email: "ama@example.com", phone: "" }];
  const { added, skipped } = mergeNewPeople(existing, [
    { email: "AMA@example.com", phone: "" },
    { email: "kojo@example.com", phone: "+233241234567" },
    { email: "", phone: "+233241234567" },
  ]);
  assert.deepEqual(added, [{ email: "kojo@example.com", phone: "+233241234567" }]);
  assert.equal(skipped, 2);
});

test("setup progress reflects the real organization state", () => {
  assert.equal(setupProgress({ brand: demoBrand, people: 0, groups: 0, authorities: 0 }).complete, 1);
  const done = setupProgress({ brand: { ...demoBrand, logo: "data:image/png;base64,x" }, people: 3, groups: 1, authorities: 1 });
  assert.equal(done.complete, done.total);
});
