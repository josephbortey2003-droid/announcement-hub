import { NextResponse } from "next/server";
import { authorizeAttemptStatus, SmsAuthorizationError } from "@/lib/sms/authorization";
import { requireHubtelConfig } from "@/lib/sms/config";
import {
  getHubtelSmsStatus,
  HubtelRequestError,
  hubtelStatusToDeliveryStatus,
  rateToMinorUnits,
} from "@/lib/sms/hubtel";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const { messageId } = await params;
    const context = await authorizeAttemptStatus(messageId);
    const result = await getHubtelSmsStatus(requireHubtelConfig(), messageId);
    const status = hubtelStatusToDeliveryStatus(result.data.status);
    const rateMinor = rateToMinorUnits(result.data.rate);
    const units = result.data.units === undefined ? null : Number(result.data.units);

    const { error } = await context.admin
      .from("delivery_attempts")
      .update({
        status,
        provider_status: result.data.status ?? null,
        provider_response_code: result.responseCode?.toString() ?? null,
        rate_minor: rateMinor,
        unit_count: Number.isFinite(units) ? units : null,
        last_status_checked_at: new Date().toISOString(),
        provider_updated_at: result.data.updateTime ?? null,
      })
      .eq("id", context.attempt.id);
    if (error) throw new Error("The updated Hubtel status could not be recorded.");

    await context.admin
      .from("recipient_deliveries")
      .update({ sms_status: status })
      .eq("id", context.attempt.recipient_delivery_id);

    if (rateMinor !== null) {
      const { data: delivery } = await context.admin
        .from("recipient_deliveries")
        .select("announcement_id")
        .eq("id", context.attempt.recipient_delivery_id)
        .maybeSingle();
      if (delivery) {
        const { error: ledgerError } = await context.admin.from("sms_ledger").insert({
          organization_id: context.attempt.organization_id,
          announcement_id: delivery.announcement_id,
          amount_minor: rateMinor,
          currency: "GHS",
          entry_type: "charge",
          provider_reference: messageId,
        });
        if (ledgerError && ledgerError.code !== "23505") {
          console.error("SMS ledger status write failed", ledgerError.code);
        }
      }
    }

    return NextResponse.json({ messageId, status, providerStatus: result.data.status ?? null });
  } catch (error) {
    if (error instanceof SmsAuthorizationError || error instanceof HubtelRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("SMS status check failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "The SMS status could not be checked." }, { status: 500 });
  }
}
