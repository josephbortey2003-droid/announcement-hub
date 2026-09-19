import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeDeliverySend, SmsAuthorizationError } from "@/lib/sms/authorization";
import { requireHubtelConfig } from "@/lib/sms/config";
import {
  HubtelRequestError,
  hubtelStatusToDeliveryStatus,
  rateToMinorUnits,
  sendHubtelSms,
} from "@/lib/sms/hubtel";
import { calculateSmsSegments } from "@/lib/sms/segments";

export const runtime = "nodejs";

const requestSchema = z.object({ recipientDeliveryId: z.string().uuid() }).strict();

function responseError(error: unknown) {
  if (error instanceof SmsAuthorizationError || error instanceof HubtelRequestError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: "The SMS request is invalid." }, { status: 400 });
  }
  console.error("SMS send failed", error instanceof Error ? error.message : "unknown error");
  return NextResponse.json({ error: "The SMS could not be sent." }, { status: 500 });
}

export async function POST(request: Request) {
  let attemptId: string | null = null;
  let acceptedMessageId: string | null = null;
  let context: Awaited<ReturnType<typeof authorizeDeliverySend>> | null = null;
  try {
    const input = requestSchema.parse(await request.json().catch(() => null));
    context = await authorizeDeliverySend(input.recipientDeliveryId);
    const config = { ...requireHubtelConfig(), senderId: context.settings.sender_id };
    const content = `${context.organizationName}\n${context.announcement.title}\n${context.announcement.body}`;
    const estimate = calculateSmsSegments(content);

    const { data: attempt, error: attemptError } = await context.admin
      .from("delivery_attempts")
      .insert({
        organization_id: context.delivery.organization_id,
        recipient_delivery_id: context.delivery.id,
        channel: "sms",
        status: "queued",
        provider: "hubtel",
      })
      .select("id")
      .single();
    if (attemptError?.code === "23505") {
      throw new SmsAuthorizationError("SMS fallback has already been attempted for this recipient.", 409);
    }
    if (attemptError || !attempt) throw new Error("The SMS attempt could not be recorded.");
    attemptId = attempt.id;

    await context.admin
      .from("recipient_deliveries")
      .update({ sms_status: "queued" })
      .eq("id", context.delivery.id);

    const result = await sendHubtelSms(config, { to: context.phone, content });
    acceptedMessageId = result.data.messageId;
    const status = hubtelStatusToDeliveryStatus(result.data.status);
    const rateMinor = rateToMinorUnits(result.data.rate);
    const now = new Date().toISOString();

    const { error: updateError } = await context.admin
      .from("delivery_attempts")
      .update({
        status,
        provider_message_id: result.data.messageId,
        provider_response_code: result.responseCode?.toString() ?? null,
        provider_status: result.data.status ?? null,
        rate_minor: rateMinor,
        unit_count: estimate.segments,
        last_status_checked_at: now,
      })
      .eq("id", attempt.id);
    if (updateError) throw new Error("Hubtel accepted the SMS, but its result could not be recorded.");

    await context.admin
      .from("recipient_deliveries")
      .update({ sms_status: status })
      .eq("id", context.delivery.id);

    if (rateMinor !== null) {
      const { error: ledgerError } = await context.admin.from("sms_ledger").insert({
        organization_id: context.delivery.organization_id,
        announcement_id: context.announcement.id,
        amount_minor: rateMinor,
        currency: "GHS",
        entry_type: "charge",
        provider_reference: result.data.messageId,
      });
      if (ledgerError && ledgerError.code !== "23505") {
        console.error("SMS ledger write failed", ledgerError.code);
      }
    }

    return NextResponse.json(
      {
        messageId: result.data.messageId,
        status,
        encoding: estimate.encoding,
        segments: estimate.segments,
        chargedMinor: rateMinor,
        currency: rateMinor === null ? null : "GHS",
      },
      { status: 201 }
    );
  } catch (error) {
    if (attemptId && context) {
      const providerAccepted = acceptedMessageId !== null;
      const code = providerAccepted
        ? "HUBTEL_ACCEPTED_RECORDING_PENDING"
        : error instanceof HubtelRequestError
          ? error.retryable ? "HUBTEL_OUTCOME_UNCERTAIN" : `HUBTEL_HTTP_${error.status}`
          : "INTERNAL_SEND_ERROR";
      await context.admin
        .from("delivery_attempts")
        .update({
          status: providerAccepted ? "queued" : "failed",
          failure_code: code,
          provider_message_id: acceptedMessageId,
        })
        .eq("id", attemptId);
      await context.admin
        .from("recipient_deliveries")
        .update({ sms_status: providerAccepted ? "queued" : "failed" })
        .eq("id", context.delivery.id);
    }
    return responseError(error);
  }
}
