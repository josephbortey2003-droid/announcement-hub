import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptInvitation, clearPendingInvitation, createInvitations, emailLink, invitationLink, previewInvitation,
  readPendingInvitation, savePendingInvitation, tokenFromHash, whatsappLink,
} from "../lib/supabase/invitations.ts";

const TOKEN = "a".repeat(64);

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) };
}

test("invitation links put the token in the fragment, never the query", () => {
  assert.equal(invitationLink("https://example.github.io/announcement-hub/?auth_error=x", TOKEN), `https://example.github.io/announcement-hub/#invite=${TOKEN}`);
  assert.equal(tokenFromHash(`#invite=${TOKEN}`), TOKEN);
  assert.equal(tokenFromHash("#invite=not-a-token"), null);
  assert.equal(tokenFromHash(""), null);
});

test("share links encode the message and the phone number", () => {
  assert.equal(whatsappLink("+233 24 123 4567", "Hi & join"), "https://wa.me/233241234567?text=Hi%20%26%20join");
  assert.equal(whatsappLink("", "Hi"), "https://wa.me/?text=Hi");
  assert.match(emailLink("ama@example.com", "Demo University", "Join"), /^mailto:ama%40example\.com\?subject=Invitation%20to%20Demo%20University&body=Join$/);
});

test("a pending invitation survives sign-in but expires after seven days", (context) => {
  const storage = memoryStorage();
  savePendingInvitation(TOKEN, storage);
  assert.equal(readPendingInvitation(storage), TOKEN);
  context.mock.method(Date, "now", () => Date.now.mock.original() + 8 * 24 * 60 * 60 * 1000);
  assert.equal(readPendingInvitation(storage), null);
  context.mock.restoreAll();
  clearPendingInvitation(storage);
  assert.equal(readPendingInvitation(storage), null);
});

const rpcClient = (result) => {
  const calls = [];
  return { calls, rpc: async (name, args) => { calls.push({ name, args }); return result; } };
};

test("creating invitations sends the directory ids and maps the rows", async () => {
  const client = rpcClient({ data: [{ directory_entry_id: "d1", full_name: "Ama", email: null, phone_e164: "+233241234567", token: TOKEN, expires_at: "2026-10-16T00:00:00Z" }], error: null });
  const rows = await createInvitations(client, "org-1", ["d1"]);
  assert.deepEqual(client.calls[0], { name: "create_member_invitations", args: { target_organization: "org-1", entry_ids: ["d1"], valid_days: 7 } });
  assert.deepEqual(rows, [{ directoryEntryId: "d1", name: "Ama", email: "", phone: "+233241234567", token: TOKEN, expiresAt: "2026-10-16T00:00:00Z" }]);
});

test("previews return null for unknown links", async () => {
  assert.equal(await previewInvitation(rpcClient({ data: [], error: null }), TOKEN), null);
  const preview = await previewInvitation(rpcClient({ data: [{ organization_name: "Demo", organization_code: "DEMO", invitee_name: "Ama", email_required: true, status: "valid", expires_at: "x" }], error: null }), TOKEN);
  assert.equal(preview.organizationName, "Demo");
});

test("acceptance errors become plain explanations", async () => {
  await assert.rejects(acceptInvitation(rpcClient({ data: null, error: { code: "P0002", message: "invitation_expired" } }), TOKEN), /has expired/);
  await assert.rejects(acceptInvitation(rpcClient({ data: null, error: { code: "42501", message: "invitation_email_mismatch" } }), TOKEN), /different email address/);
  assert.equal(await acceptInvitation(rpcClient({ data: "org-1", error: null }), TOKEN), "org-1");
});
