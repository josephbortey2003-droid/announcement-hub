import assert from "node:assert/strict";
import test from "node:test";
import { isValidOrganizationCode, normalizeOrganizationCode } from "../lib/organizations/code.ts";

test("normalizes organization codes without creating ambiguous separators", () => {
  assert.equal(normalizeOrganizationCode("  Central University 2026  "), "CENTRAL-UNIVERSITY-2026");
  assert.equal(normalizeOrganizationCode("PU---Legon__24"), "PU-LEGON-24");
});

test("accepts only database-compatible organization codes", () => {
  assert.equal(isValidOrganizationCode("PU-LEGON-24"), true);
  assert.equal(isValidOrganizationCode("abc"), false);
  assert.equal(isValidOrganizationCode("---"), false);
});
