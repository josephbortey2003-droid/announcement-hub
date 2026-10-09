// Member invitations: creating links (owner), previewing and accepting them (invitee).
// Database side: supabase/migrations/*_member_invitations.sql
//
// The token travels in the URL fragment (#invite=...), which browsers never send
// to a server, so it does not end up in hosting or proxy logs.

import type { SupabaseClient } from "@supabase/supabase-js";

export type CreatedInvitation = { directoryEntryId: string; name: string; email: string; phone: string; token: string; expiresAt: string };
export type InvitationPreview = { organizationName: string; organizationCode: string; inviteeName: string; emailRequired: boolean; status: "valid" | "used" | "expired"; expiresAt: string };

const TOKEN = /^[0-9a-f]{64}$/;
const PENDING_KEY = "announcement-hub-pending-invitation";
const PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function isInvitationToken(value: string | null | undefined): value is string {
  return Boolean(value && TOKEN.test(value));
}

/** Reads "#invite=<token>" from a location hash. */
export function tokenFromHash(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("invite");
  return isInvitationToken(token) ? token : null;
}

/** The link an owner shares. `appUrl` is the address of the app's home page. */
export function invitationLink(appUrl: string, token: string) {
  const url = new URL(appUrl);
  url.search = "";
  url.hash = `invite=${token}`;
  return url.toString();
}

export function invitationMessage(organizationName: string, personName: string, link: string) {
  return `Hello ${personName}, you have been invited to receive official announcements from ${organizationName} on Announcement Hub. Open this link to join: ${link}`;
}

/** WhatsApp share link: opens a chat with the person when a phone number is known, otherwise lets the owner pick a chat. */
export function whatsappLink(phoneE164: string, message: string) {
  const digits = phoneE164.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function emailLink(email: string, organizationName: string, message: string) {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Invitation to ${organizationName}`)}&body=${encodeURIComponent(message)}`;
}

// The token is kept while the invitee signs in or confirms their email, which can involve leaving the page.
export function savePendingInvitation(token: string, storage: Storage = window.localStorage) {
  try { storage.setItem(PENDING_KEY, JSON.stringify({ token, savedAt: Date.now() })); } catch { /* storage can be blocked */ }
}

export function readPendingInvitation(storage: Storage = window.localStorage): string | null {
  try {
    const value = JSON.parse(storage.getItem(PENDING_KEY) ?? "null") as { token?: string; savedAt?: number } | null;
    if (!value || !isInvitationToken(value.token) || Date.now() - (value.savedAt ?? 0) > PENDING_MAX_AGE_MS) return null;
    return value.token;
  } catch {
    return null;
  }
}

export function clearPendingInvitation(storage: Storage = window.localStorage) {
  try { storage.removeItem(PENDING_KEY); } catch { /* storage can be blocked */ }
}

export async function createInvitations(client: SupabaseClient, organizationId: string, directoryEntryIds: string[]): Promise<CreatedInvitation[]> {
  const { data, error } = await client.rpc("create_member_invitations", { target_organization: organizationId, entry_ids: directoryEntryIds, valid_days: 7 });
  if (error?.code === "42501") throw new Error("Only an organization owner can invite people.");
  if (error) throw new Error(error.code === "22023" && error.message ? error.message : "The invitations could not be created.");
  return ((data ?? []) as { directory_entry_id: string; full_name: string; email: string | null; phone_e164: string | null; token: string; expires_at: string }[])
    .map((row) => ({ directoryEntryId: row.directory_entry_id, name: row.full_name, email: row.email ?? "", phone: row.phone_e164 ?? "", token: row.token, expiresAt: row.expires_at }));
}

export async function previewInvitation(client: SupabaseClient, token: string): Promise<InvitationPreview | null> {
  const { data, error } = await client.rpc("preview_invitation", { invite_token: token });
  if (error) throw new Error("The invitation could not be checked.");
  const row = (data as { organization_name: string; organization_code: string; invitee_name: string; email_required: boolean; status: InvitationPreview["status"]; expires_at: string }[] | null)?.[0];
  return row ? { organizationName: row.organization_name, organizationCode: row.organization_code, inviteeName: row.invitee_name, emailRequired: row.email_required, status: row.status, expiresAt: row.expires_at } : null;
}

const ACCEPT_ERRORS: Record<string, string> = {
  invitation_invalid: "This invitation link is not valid or has already been used. Ask the organization owner for a new link.",
  invitation_expired: "This invitation has expired. Ask the organization owner for a new link.",
  invitation_email_mismatch: "This invitation was sent to a different email address. Sign in with that address, and confirm it if you have just created the account.",
};

/** Accepts the invitation for the signed-in account and returns the organization id. */
export async function acceptInvitation(client: SupabaseClient, token: string): Promise<string> {
  const { data, error } = await client.rpc("accept_member_invitation", { invite_token: token });
  if (error) throw new Error(ACCEPT_ERRORS[error.message] ?? (error.code === "42501" ? "Sign in before accepting the invitation." : "The invitation could not be accepted."));
  return data as string;
}
