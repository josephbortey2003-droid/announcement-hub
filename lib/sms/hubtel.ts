import "server-only";

import { z } from "zod";
import type { HubtelConfig } from "./config";
import { normalizeE164 } from "./phone";

const sendResponseSchema = z.object({
  message: z.string().optional(),
  responseCode: z.union([z.string(), z.number()]).optional(),
  data: z.object({
    rate: z.union([z.string(), z.number()]).optional(),
    messageId: z.string().min(1),
    status: z.string().optional(),
    networkId: z.union([z.string(), z.number()]).optional(),
  }),
});

const statusResponseSchema = z.object({
  message: z.string().optional(),
  responseCode: z.union([z.string(), z.number()]).optional(),
  data: z.object({
    rate: z.union([z.string(), z.number()]).optional(),
    units: z.union([z.string(), z.number()]).optional(),
    messageId: z.string().min(1),
    status: z.string().optional(),
    updateTime: z.string().optional(),
  }),
});

export class HubtelRequestError extends Error {
  constructor(message: string, readonly status: number, readonly retryable: boolean) {
    super(message);
    this.name = "HubtelRequestError";
  }
}

function authorization(config: HubtelConfig) {
  return `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`;
}

async function request(config: HubtelConfig, path: string, init: RequestInit) {
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: authorization(config),
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch (error) {
    throw new HubtelRequestError(
      error instanceof Error && error.name === "TimeoutError"
        ? "Hubtel did not respond before the request timed out."
        : "Hubtel could not be reached.",
      503,
      true
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new HubtelRequestError(
      `Hubtel rejected the request with HTTP ${response.status}.`,
      response.status,
      response.status === 408 || response.status === 429 || response.status >= 500
    );
  }
  return payload;
}

export async function sendHubtelSms(
  config: HubtelConfig,
  input: { to: string; content: string }
) {
  const to = normalizeE164(input.to);
  if (config.mode === "test" && !config.testRecipients.has(to)) {
    throw new HubtelRequestError("The recipient is not allowed in SMS test mode.", 403, false);
  }
  if (!input.content.trim() || input.content.length > 5_000) {
    throw new HubtelRequestError("SMS content must contain 1 to 5,000 characters.", 400, false);
  }

  const payload = await request(config, "/send", {
    method: "POST",
    body: JSON.stringify({ from: config.senderId, to, content: input.content }),
  });
  const parsed = sendResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HubtelRequestError("Hubtel returned an unexpected send response.", 502, false);
  }
  return parsed.data;
}

export async function getHubtelSmsStatus(config: HubtelConfig, messageId: string) {
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(messageId)) {
    throw new HubtelRequestError("The Hubtel message ID is invalid.", 400, false);
  }
  const payload = await request(config, `/${encodeURIComponent(messageId)}`, { method: "GET" });
  const parsed = statusResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HubtelRequestError("Hubtel returned an unexpected status response.", 502, false);
  }
  return parsed.data;
}

export function hubtelStatusToDeliveryStatus(value?: string) {
  const status = value?.trim().toLowerCase() ?? "";
  if (["delivered", "success", "successful"].includes(status)) return "delivered" as const;
  if (["failed", "undeliverable", "rejected", "expired"].includes(status)) return "failed" as const;
  if (["sent", "submitted", "accepted"].includes(status)) return "sent" as const;
  return "queued" as const;
}

export function rateToMinorUnits(value: string | number | undefined) {
  if (value === undefined) return null;
  const rate = typeof value === "number" ? value : Number(value);
  return Number.isFinite(rate) && rate >= 0 ? Math.round(rate * 100) : null;
}
