import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export class SmsAuthorizationError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "SmsAuthorizationError";
  }
}

export async function requireAuthenticatedUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new SmsAuthorizationError("Sign in is required.", 401);
  return data.user;
}

export async function authorizeDeliverySend(recipientDeliveryId: string) {
  const user = await requireAuthenticatedUser();
  const admin = createAdminClient();

  const { data: delivery, error: deliveryError } = await admin
    .from("recipient_deliveries")
    .select("id, organization_id, announcement_id, membership_id, sms_fallback_due_at, sms_status")
    .eq("id", recipientDeliveryId)
    .maybeSingle();
  if (deliveryError) throw new Error("The delivery record could not be loaded.");
  if (!delivery) throw new SmsAuthorizationError("The delivery record was not found.", 404);

  const { data: actor } = await admin
    .from("memberships")
    .select("id, role, status")
    .eq("organization_id", delivery.organization_id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!actor || !["owner", "authority"].includes(actor.role)) {
    throw new SmsAuthorizationError("You do not have announcement authority in this organization.", 403);
  }

  const { data: announcement, error: announcementError } = await admin
    .from("announcements")
    .select("id, organization_id, author_membership_id, title, body, status")
    .eq("id", delivery.announcement_id)
    .eq("organization_id", delivery.organization_id)
    .maybeSingle();
  if (announcementError || !announcement) throw new Error("The announcement could not be loaded.");
  if (announcement.status !== "published") {
    throw new SmsAuthorizationError("Only published announcements can use SMS fallback.", 409);
  }

  if (actor.role === "authority") {
    if (announcement.author_membership_id !== actor.id) {
      throw new SmsAuthorizationError("An authority can send only their own announcement.", 403);
    }
    const [{ data: audiences }, { data: grants }] = await Promise.all([
      admin.from("announcement_audiences").select("group_id").eq("announcement_id", announcement.id),
      admin
        .from("authority_grants")
        .select("group_id")
        .eq("membership_id", actor.id)
        .eq("can_publish", true)
        .is("revoked_at", null)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
    ]);
    const granted = new Set((grants ?? []).map((item) => item.group_id));
    if (!audiences?.length || audiences.some((audience) => !granted.has(audience.group_id))) {
      throw new SmsAuthorizationError("This announcement includes an audience outside your authority.", 403);
    }
  }

  if (!delivery.sms_fallback_due_at || new Date(delivery.sms_fallback_due_at) > new Date()) {
    throw new SmsAuthorizationError("This SMS fallback is not due yet.", 409);
  }

  const { data: receipt } = await admin
    .from("read_receipts")
    .select("recipient_delivery_id")
    .eq("recipient_delivery_id", delivery.id)
    .maybeSingle();
  if (receipt) throw new SmsAuthorizationError("The recipient already read this announcement.", 409);

  const [{ data: recipient }, { data: settings }, { data: organization }] = await Promise.all([
    admin.from("memberships").select("user_id").eq("id", delivery.membership_id).maybeSingle(),
    admin
      .from("organization_sms_settings")
      .select("sender_id, fallback_enabled, daily_spend_limit_minor")
      .eq("organization_id", delivery.organization_id)
      .maybeSingle(),
    admin.from("organizations").select("name").eq("id", delivery.organization_id).maybeSingle(),
  ]);
  if (!recipient) throw new Error("The recipient membership could not be loaded.");
  if (!settings?.fallback_enabled) {
    throw new SmsAuthorizationError("SMS fallback is disabled for this organization.", 409);
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("phone_e164")
    .eq("id", recipient.user_id)
    .maybeSingle();
  if (!profile?.phone_e164) {
    throw new SmsAuthorizationError("The recipient has no verified phone number.", 422);
  }

  if (settings.daily_spend_limit_minor !== null) {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const { data: charges } = await admin
      .from("sms_ledger")
      .select("amount_minor")
      .eq("organization_id", delivery.organization_id)
      .eq("entry_type", "charge")
      .gte("created_at", start.toISOString());
    const spent = (charges ?? []).reduce((total, row) => total + row.amount_minor, 0);
    if (spent >= settings.daily_spend_limit_minor) {
      throw new SmsAuthorizationError("The organization has reached its daily SMS spending limit.", 409);
    }
  }

  return {
    admin,
    user,
    actor,
    delivery,
    announcement,
    settings,
    organizationName: organization?.name ?? "Organization announcement",
    phone: profile.phone_e164,
  };
}

export async function authorizeAttemptStatus(messageId: string) {
  const user = await requireAuthenticatedUser();
  const admin = createAdminClient();
  const { data: attempt } = await admin
    .from("delivery_attempts")
    .select("id, organization_id, provider_message_id, recipient_delivery_id")
    .eq("provider", "hubtel")
    .eq("provider_message_id", messageId)
    .maybeSingle();
  if (!attempt) throw new SmsAuthorizationError("The Hubtel delivery attempt was not found.", 404);

  const { data: actor } = await admin
    .from("memberships")
    .select("id, role")
    .eq("organization_id", attempt.organization_id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!actor || !["owner", "authority"].includes(actor.role)) {
    throw new SmsAuthorizationError("You cannot inspect this delivery attempt.", 403);
  }
  if (actor.role === "authority") {
    const { data: delivery } = await admin
      .from("recipient_deliveries")
      .select("announcement_id")
      .eq("id", attempt.recipient_delivery_id)
      .maybeSingle();
    const { data: announcement } = delivery
      ? await admin
          .from("announcements")
          .select("author_membership_id")
          .eq("id", delivery.announcement_id)
          .maybeSingle()
      : { data: null };
    if (!announcement || announcement.author_membership_id !== actor.id) {
      throw new SmsAuthorizationError("An authority can inspect only their own announcement.", 403);
    }
  }
  return { admin, attempt };
}
