import "server-only";

import { normalizeE164 } from "./phone";

export type HubtelConfig = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  senderId: string;
  mode: "test" | "live";
  testRecipients: Set<string>;
};

export function getHubtelReadiness() {
  const missing = [
    "HUBTEL_SMS_BASE_URL",
    "HUBTEL_CLIENT_ID",
    "HUBTEL_CLIENT_SECRET",
    "HUBTEL_SENDER_ID",
  ].filter((name) => !process.env[name]?.trim());
  return {
    enabled: process.env.HUBTEL_SMS_ENABLED === "true",
    missing,
    mode: process.env.HUBTEL_SMS_MODE === "live" ? "live" : "test",
  } as const;
}

export function requireHubtelConfig(): HubtelConfig {
  const readiness = getHubtelReadiness();
  if (!readiness.enabled) throw new Error("Hubtel SMS is disabled on the server.");
  if (readiness.missing.length) throw new Error("Hubtel SMS configuration is incomplete.");

  const baseUrl = new URL(process.env.HUBTEL_SMS_BASE_URL!);
  if (baseUrl.protocol !== "https:") throw new Error("The Hubtel API URL must use HTTPS.");
  if (baseUrl.username || baseUrl.password) throw new Error("Do not place credentials in the Hubtel API URL.");

  const senderId = process.env.HUBTEL_SENDER_ID!.trim();
  if (!/^[A-Za-z0-9]{1,11}$/.test(senderId)) {
    throw new Error("The Hubtel sender ID must be 1 to 11 letters or numbers.");
  }

  const testRecipients = new Set(
    (process.env.HUBTEL_SMS_TEST_RECIPIENTS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => normalizeE164(value))
  );

  if (readiness.mode === "test" && testRecipients.size === 0) {
    throw new Error("Test mode requires at least one allowlisted recipient.");
  }

  return {
    baseUrl: baseUrl.toString().replace(/\/$/, ""),
    clientId: process.env.HUBTEL_CLIENT_ID!,
    clientSecret: process.env.HUBTEL_CLIENT_SECRET!,
    senderId,
    mode: readiness.mode,
    testRecipients,
  };
}
