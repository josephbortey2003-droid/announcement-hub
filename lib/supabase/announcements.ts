// Publishing, the member inbox, read receipts and sent history for a signed-in organization.
// Database side: supabase/migrations/*_announcement_publishing.sql

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnnouncementDraft } from "@/components/announcement/audience-composer";

/** One announcement as the interface shows it, whether from the preview or the database. */
export type AnnouncementItem = {
  id: string;
  title: string;
  body: string;
  priority: AnnouncementDraft["priority"];
  publishedAt: string;
  sender: string;
  audienceLabel?: string;
  recipientCount?: number;
  readCount?: number;
  mine?: boolean;
  deliveryId?: string;
  readAt?: string | null;
};

export const senderLabel = (role: string) => (role === "owner" ? "Organization owner" : role === "authority" ? "Authorized leader" : "Member");

const PUBLISH_ERRORS: Record<string, string> = {
  publish_not_allowed: "Only the organization owner or an authorized leader can publish announcements.",
  organization_wide_owner_only: "Only the organization owner can publish to everyone.",
  group_outside_authority: "The announcement includes a group outside your authority.",
  person_outside_authority: "A selected person is outside your assigned audience.",
  group_outside_organization: "A selected group no longer exists in this organization. Refresh and try again.",
  person_not_active_member: "A selected person is no longer an active member. Refresh and try again.",
  audience_missing: "Choose at least one audience.",
  audience_empty: "The audience has no active members to receive this announcement.",
  audience_too_large: "Choose at most 100 groups and 500 individual people.",
  invalid_fallback: "Choose a supported SMS fallback delay.",
  request_reference_in_use: "This announcement was already submitted by someone else. Start a new announcement.",
};

export async function publishAnnouncement(client: SupabaseClient, organizationId: string, draft: AnnouncementDraft) {
  const { data, error } = await client.rpc("publish_announcement", {
    target_organization: organizationId,
    request_reference: draft.clientRequestId,
    announcement_title: draft.title,
    announcement_body: draft.body,
    announcement_priority: draft.priority,
    whole_organization: draft.audience.wholeOrganization,
    group_ids: draft.audience.groupIds,
    membership_ids: draft.audience.membershipIds,
    excluded_membership_ids: draft.audience.excludedMembershipIds,
    sms_fallback_minutes: draft.smsFallbackMinutes,
  });
  if (error) {
    if (PUBLISH_ERRORS[error.message]) throw new Error(PUBLISH_ERRORS[error.message]);
    if (error.code === "23514") throw new Error("Check the title (2 to 180 characters) and message (up to 5,000 characters).");
    throw new Error("The announcement could not be published. Nothing was sent.");
  }
  const result = data as { announcementId: string; duplicate: boolean; recipientCount: number };
  return { announcementId: result.announcementId, duplicate: result.duplicate, recipientCount: result.recipientCount };
}

type SentRow = { announcement_id: string; title: string; body: string; priority: AnnouncementItem["priority"]; audience_mode: string; published_at: string; author_role: string; mine: boolean; recipient_count: number; read_count: number };

export async function loadSentAnnouncements(client: SupabaseClient, organizationId: string): Promise<AnnouncementItem[]> {
  const { data, error } = await client.rpc("sent_announcements", { target_organization: organizationId });
  if (error) throw new Error("Sent announcements could not be loaded.");
  return ((data ?? []) as SentRow[]).map((row) => ({
    id: row.announcement_id,
    title: row.title,
    body: row.body,
    priority: row.priority,
    publishedAt: row.published_at,
    sender: row.mine ? "You" : senderLabel(row.author_role),
    audienceLabel: row.audience_mode === "organization" ? "Everyone in the organization" : "Selected groups and people",
    recipientCount: row.recipient_count,
    readCount: row.read_count,
    mine: row.mine,
  }));
}

type InboxRow = { delivery_id: string; announcement_id: string; title: string; body: string; priority: AnnouncementItem["priority"]; published_at: string; author_role: string; read_at: string | null };

export async function loadInbox(client: SupabaseClient, organizationId: string): Promise<AnnouncementItem[]> {
  const { data, error } = await client.rpc("my_announcements", { target_organization: organizationId });
  if (error) throw new Error("Your announcements could not be loaded.");
  return ((data ?? []) as InboxRow[]).map((row) => ({
    id: row.announcement_id,
    title: row.title,
    body: row.body,
    priority: row.priority,
    publishedAt: row.published_at,
    sender: senderLabel(row.author_role),
    deliveryId: row.delivery_id,
    readAt: row.read_at,
  }));
}

/** Records that the signed-in member read a delivery. Safe to call more than once. */
export async function markAnnouncementRead(client: SupabaseClient, deliveryId: string): Promise<string> {
  const { data, error } = await client.rpc("mark_announcement_read", { target_delivery: deliveryId });
  if (error || !data) throw new Error("The announcement could not be marked as read.");
  return data as string;
}

type GrantRow = { revoked_at: string | null; expires_at: string | null; can_publish: boolean; groups: { id: string; name: string; group_type: string } | { id: string; name: string; group_type: string }[] | null };

/** Groups the signed-in leader may currently publish to. The database re-checks this on every announcement. */
export async function loadPublishingGroups(client: SupabaseClient, organizationId: string, now = new Date()): Promise<{ id: string; name: string; type: string }[]> {
  const { data, error } = await client
    .from("authority_grants")
    .select("revoked_at, expires_at, can_publish, groups(id, name, group_type)")
    .eq("organization_id", organizationId);
  if (error) throw new Error("Your publishing scope could not be loaded.");
  const groups = new Map<string, { id: string; name: string; type: string }>();
  for (const grant of (data ?? []) as GrantRow[]) {
    if (!grant.can_publish || grant.revoked_at || (grant.expires_at && new Date(grant.expires_at) <= now)) continue;
    for (const group of [grant.groups].flat()) {
      if (group) groups.set(group.id, { id: group.id, name: group.name, type: group.group_type[0].toUpperCase() + group.group_type.slice(1) });
    }
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}
