import type { SupabaseClient, User } from "@supabase/supabase-js";
import { normalizeOrganizationCode } from "@/lib/organizations/code";
import { createClient } from "./client";
import { getPublicSupabaseConfig } from "./config";

export type PortalRole = "creator" | "authority" | "member";

export type OrganizationAccess = {
  portal: PortalRole;
  organizationId: string;
  name: string;
  code: string;
  primaryColor: string;
  secondaryColor: string;
  logo: string;
};

export type PendingOrganization = {
  fullName: string;
  name: string;
  code: string;
};

const PENDING_ORGANIZATION_KEY = "announcement-hub-pending-organization";
const REQUESTED_ORGANIZATION_KEY = "announcement-hub-requested-organization";
let browserClient: SupabaseClient | null = null;

export function isSupabaseConfigured() {
  return getPublicSupabaseConfig() !== null;
}

export function getBrowserClient() {
  if (!browserClient) browserClient = createClient();
  return browserClient;
}

export function savePendingOrganization(value: PendingOrganization) {
  window.localStorage.setItem(PENDING_ORGANIZATION_KEY, JSON.stringify({ ...value, code: normalizeOrganizationCode(value.code) }));
}

export function saveRequestedOrganizationCode(value: string) {
  const code = normalizeOrganizationCode(value);
  if (code) window.sessionStorage.setItem(REQUESTED_ORGANIZATION_KEY, code);
}

export function takeRequestedOrganizationCode() {
  const code = window.sessionStorage.getItem(REQUESTED_ORGANIZATION_KEY) ?? "";
  window.sessionStorage.removeItem(REQUESTED_ORGANIZATION_KEY);
  return code;
}

function readPendingOrganization(): PendingOrganization | null {
  const raw = window.localStorage.getItem(PENDING_ORGANIZATION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingOrganization;
    if (!parsed.fullName || !parsed.name || !parsed.code) return null;
    return parsed;
  } catch {
    return null;
  }
}

function portalForRole(role: string): PortalRole {
  if (role === "owner") return "creator";
  if (role === "authority") return "authority";
  return "member";
}

export async function loadOrganizationAccess(client = getBrowserClient(), requestedCode?: string): Promise<OrganizationAccess | null> {
  const { data: userResult, error: userError } = await client.auth.getUser();
  if (userError || !userResult.user) return null;

  const { data: memberships, error: membershipError } = await client
    .from("memberships")
    .select("organization_id, role, created_at")
    .eq("user_id", userResult.user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (membershipError) throw new Error("Your organization memberships could not be loaded.");

  const normalizedRequestedCode = requestedCode ? normalizeOrganizationCode(requestedCode) : "";
  for (const membership of memberships ?? []) {
    const { data: organization, error: organizationError } = await client
      .from("organizations")
      .select("id, name, code")
      .eq("id", membership.organization_id)
      .maybeSingle();
    if (organizationError || !organization) continue;
    if (normalizedRequestedCode && organization.code !== normalizedRequestedCode) continue;

    const { data: branding } = await client
      .from("organization_branding")
      .select("primary_color, secondary_color, logo_path")
      .eq("organization_id", organization.id)
      .maybeSingle();

    return {
      portal: portalForRole(membership.role),
      organizationId: organization.id,
      name: organization.name,
      code: organization.code,
      primaryColor: branding?.primary_color ?? "#065f46",
      secondaryColor: branding?.secondary_color ?? "#10b981",
      logo: branding?.logo_path ?? "",
    };
  }
  return null;
}

export async function completePendingOrganization(user: User, client = getBrowserClient()) {
  const pending = readPendingOrganization();
  if (!pending) return null;

  const existing = await loadOrganizationAccess(client);
  if (existing) {
    window.localStorage.removeItem(PENDING_ORGANIZATION_KEY);
    return existing;
  }

  const { error: profileError } = await client.from("profiles").upsert({
    id: user.id,
    full_name: pending.fullName.trim(),
    updated_at: new Date().toISOString(),
  });
  if (profileError) throw new Error("Your profile could not be created.");

  const { error: organizationError } = await client.from("organizations").insert({
    name: pending.name.trim(),
    code: normalizeOrganizationCode(pending.code),
    created_by: user.id,
  });
  if (organizationError?.code === "23505") throw new Error("That organization code is already in use.");
  if (organizationError) throw new Error("Your organization space could not be created.");

  window.localStorage.removeItem(PENDING_ORGANIZATION_KEY);
  return loadOrganizationAccess(client);
}
