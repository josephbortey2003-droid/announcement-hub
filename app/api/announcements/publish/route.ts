import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

const requestSchema = z.object({
  clientRequestId: z.string().uuid(),
  organizationId: z.string().uuid(),
  title: z.string().trim().min(2).max(180),
  body: z.string().trim().min(1).max(5_000),
  priority: z.enum(["normal", "important", "urgent"]),
  audience: z.object({
    wholeOrganization: z.boolean(),
    groupIds: z.array(z.string().uuid()).max(100),
    membershipIds: z.array(z.string().uuid()).max(500),
    excludedMembershipIds: z.array(z.string().uuid()).max(500),
  }).superRefine((audience, context) => {
    if (!audience.wholeOrganization && !audience.groupIds.length && !audience.membershipIds.length) {
      context.addIssue({ code: "custom", message: "At least one audience is required." });
    }
  }),
  smsFallbackAfterMinutes: z.union([z.literal(5), z.literal(15), z.literal(30), z.literal(60), z.null()]),
}).strict();

type MembershipRow = { id: string };

async function loadActiveMemberships(admin: ReturnType<typeof createAdminClient>, organizationId: string) {
  const rows: MembershipRow[] = [];
  for (let from = 0; ; from += 1_000) {
    const { data, error } = await admin
      .from("memberships")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .range(from, from + 999);
    if (error) throw new Error("Organization memberships could not be resolved.");
    rows.push(...(data ?? []));
    if (!data || data.length < 1_000) return rows;
  }
}

type BatchTable =
  | "announcement_audiences"
  | "announcement_individual_audiences"
  | "announcement_exclusions"
  | "recipient_deliveries";

type BatchRow<T extends BatchTable> = Database["public"]["Tables"][T]["Insert"];

async function insertBatches<T extends BatchTable>(
  admin: ReturnType<typeof createAdminClient>,
  table: T,
  rows: BatchRow<T>[]
) {
  for (let index = 0; index < rows.length; index += 500) {
    const batch = rows.slice(index, index + 500);
    const result = table === "announcement_audiences"
      ? await admin.from("announcement_audiences").insert(batch as BatchRow<"announcement_audiences">[])
      : table === "announcement_individual_audiences"
        ? await admin.from("announcement_individual_audiences").insert(batch as BatchRow<"announcement_individual_audiences">[])
        : table === "announcement_exclusions"
          ? await admin.from("announcement_exclusions").insert(batch as BatchRow<"announcement_exclusions">[])
          : await admin.from("recipient_deliveries").insert(batch as BatchRow<"recipient_deliveries">[]);
    const { error } = result;
    if (error) throw new Error(`The ${table} records could not be created.`);
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "The announcement or audience selection is invalid." }, { status: 400 });
  }

  const input = parsed.data;
  const admin = createAdminClient();
  let announcementId: string | null = null;

  try {
    const { data: existing } = await admin
      .from("announcements")
      .select("id, status")
      .eq("organization_id", input.organizationId)
      .eq("client_reference", input.clientRequestId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ announcementId: existing.id, status: existing.status, duplicate: true });
    }

    const { data: actor } = await admin
      .from("memberships")
      .select("id, role")
      .eq("organization_id", input.organizationId)
      .eq("user_id", authData.user.id)
      .eq("status", "active")
      .maybeSingle();
    if (!actor || !["owner", "authority"].includes(actor.role)) {
      return NextResponse.json({ error: "You do not have publishing authority in this organization." }, { status: 403 });
    }
    if (actor.role === "authority" && input.audience.wholeOrganization) {
      return NextResponse.json({ error: "Only the organization owner can publish organization-wide." }, { status: 403 });
    }

    const uniqueGroupIds = [...new Set(input.audience.groupIds)];
    const uniqueMemberIds = [...new Set(input.audience.membershipIds)];
    const uniqueExcludedIds = [...new Set(input.audience.excludedMembershipIds)];

    if (uniqueGroupIds.length) {
      const { data: validGroups, error } = await admin
        .from("groups")
        .select("id")
        .eq("organization_id", input.organizationId)
        .in("id", uniqueGroupIds);
      if (error || validGroups?.length !== uniqueGroupIds.length) {
        return NextResponse.json({ error: "One or more selected groups do not belong to this organization." }, { status: 403 });
      }
    }

    let grantedGroupIds = new Set<string>();
    if (actor.role === "authority") {
      const now = new Date().toISOString();
      const { data: grants, error } = await admin
        .from("authority_grants")
        .select("group_id")
        .eq("membership_id", actor.id)
        .eq("can_publish", true)
        .is("revoked_at", null)
        .or(`expires_at.is.null,expires_at.gt.${now}`);
      if (error) throw new Error("Publishing grants could not be checked.");
      grantedGroupIds = new Set((grants ?? []).map((grant) => grant.group_id));
      if (uniqueGroupIds.some((id) => !grantedGroupIds.has(id))) {
        return NextResponse.json({ error: "The announcement includes a group outside your authority." }, { status: 403 });
      }
      if (uniqueMemberIds.length) {
        if (!grantedGroupIds.size) {
          return NextResponse.json({ error: "No individual recipients are within your assigned audience." }, { status: 403 });
        }
        const { data: scopedRows, error: scopeError } = await admin
          .from("group_members")
          .select("membership_id, group_id")
          .in("membership_id", uniqueMemberIds)
          .in("group_id", [...grantedGroupIds]);
        if (scopeError) throw new Error("Individual recipient scope could not be checked.");
        const scopedMembers = new Set((scopedRows ?? []).map((row) => row.membership_id));
        if (uniqueMemberIds.some((id) => !scopedMembers.has(id))) {
          return NextResponse.json({ error: "A selected person is outside your assigned audience." }, { status: 403 });
        }
      }
    }

    const activeMemberships = await loadActiveMemberships(admin, input.organizationId);
    const activeIds = new Set(activeMemberships.map((membership) => membership.id));
    if ([...uniqueMemberIds, ...uniqueExcludedIds].some((id) => !activeIds.has(id))) {
      return NextResponse.json({ error: "A selected or excluded person is not an active organization member." }, { status: 422 });
    }

    const recipientIds = new Set<string>();
    if (input.audience.wholeOrganization) activeIds.forEach((id) => recipientIds.add(id));
    uniqueMemberIds.forEach((id) => recipientIds.add(id));
    if (uniqueGroupIds.length) {
      for (let from = 0; ; from += 1_000) {
        const { data: groupMembers, error } = await admin
          .from("group_members")
          .select("membership_id")
          .eq("organization_id", input.organizationId)
          .in("group_id", uniqueGroupIds)
          .range(from, from + 999);
        if (error) throw new Error("Group recipients could not be resolved.");
        (groupMembers ?? []).forEach((row) => {
          if (activeIds.has(row.membership_id)) recipientIds.add(row.membership_id);
        });
        if (!groupMembers || groupMembers.length < 1_000) break;
      }
    }
    uniqueExcludedIds.forEach((id) => recipientIds.delete(id));
    if (!recipientIds.size) {
      return NextResponse.json({ error: "The audience resolves to no active recipients." }, { status: 422 });
    }

    const { data: announcement, error: announcementError } = await admin
      .from("announcements")
      .insert({
        organization_id: input.organizationId,
        author_membership_id: actor.id,
        title: input.title,
        body: input.body,
        priority: input.priority,
        status: "draft",
        audience_mode: input.audience.wholeOrganization ? "organization" : "targeted",
        sms_fallback_after_minutes: input.smsFallbackAfterMinutes,
        client_reference: input.clientRequestId,
      })
      .select("id")
      .single();
    if (announcementError?.code === "23505") {
      const { data: duplicate } = await admin
        .from("announcements")
        .select("id, status")
        .eq("organization_id", input.organizationId)
        .eq("client_reference", input.clientRequestId)
        .maybeSingle();
      if (duplicate) return NextResponse.json({ announcementId: duplicate.id, status: duplicate.status, duplicate: true });
    }
    if (announcementError || !announcement) throw new Error("The announcement could not be created.");
    announcementId = announcement.id;

    await insertBatches(admin, "announcement_audiences", uniqueGroupIds.map((groupId) => ({
      announcement_id: announcement.id,
      organization_id: input.organizationId,
      group_id: groupId,
    })));
    await insertBatches(admin, "announcement_individual_audiences", uniqueMemberIds.map((membershipId) => ({
      announcement_id: announcement.id,
      organization_id: input.organizationId,
      membership_id: membershipId,
    })));
    await insertBatches(admin, "announcement_exclusions", uniqueExcludedIds.map((membershipId) => ({
      announcement_id: announcement.id,
      organization_id: input.organizationId,
      membership_id: membershipId,
    })));

    const publishedAt = new Date();
    const fallbackDueAt = input.smsFallbackAfterMinutes === null
      ? null
      : new Date(publishedAt.getTime() + input.smsFallbackAfterMinutes * 60_000).toISOString();
    await insertBatches(admin, "recipient_deliveries", [...recipientIds].map((membershipId) => ({
      organization_id: input.organizationId,
      announcement_id: announcement.id,
      membership_id: membershipId,
      in_app_status: "queued",
      sms_fallback_due_at: fallbackDueAt,
    })));

    const { error: publishError } = await admin
      .from("announcements")
      .update({ status: "published", published_at: publishedAt.toISOString() })
      .eq("id", announcement.id)
      .eq("status", "draft");
    if (publishError) throw new Error("The announcement could not be published.");

    await admin.from("audit_events").insert({
      organization_id: input.organizationId,
      actor_user_id: authData.user.id,
      action: "announcement.published",
      target_type: "announcement",
      target_id: announcement.id,
      metadata: {
        audience_mode: input.audience.wholeOrganization ? "organization" : "targeted",
        group_count: uniqueGroupIds.length,
        individual_count: uniqueMemberIds.length,
        exclusion_count: uniqueExcludedIds.length,
        recipient_count: recipientIds.size,
      },
    });

    return NextResponse.json({
      announcementId: announcement.id,
      status: "published",
      recipientCount: recipientIds.size,
      smsFallbackAfterMinutes: input.smsFallbackAfterMinutes,
    }, { status: 201 });
  } catch (error) {
    if (announcementId) await admin.from("announcements").delete().eq("id", announcementId).eq("status", "draft");
    console.error("Announcement publish failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "The announcement could not be published." }, { status: 500 });
  }
}
