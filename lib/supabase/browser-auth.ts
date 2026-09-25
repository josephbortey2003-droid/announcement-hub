import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isValidOrganizationCode, normalizeOrganizationCode } from "@/lib/organizations/code";
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

export type OrganizationIdentityUpdate = {
  organizationId: string;
  name: string;
  code: string;
  primaryColor: string;
  secondaryColor: string;
  logo: string;
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

async function resolveLogoUrl(client: SupabaseClient, logoPath: string | null) {
  if (!logoPath) return "";
  const { data, error } = await client.storage.from("organization-logos").createSignedUrl(logoPath, 3600);
  return error ? "" : data.signedUrl;
}

async function accessForOrganization(client: SupabaseClient, organizationId: string, role: string): Promise<OrganizationAccess | null> {
  const { data: organization, error: organizationError } = await client
    .from("organizations")
    .select("id, name, code")
    .eq("id", organizationId)
    .maybeSingle();
  if (organizationError || !organization) return null;

  const { data: branding } = await client
    .from("organization_branding")
    .select("primary_color, secondary_color, logo_path")
    .eq("organization_id", organization.id)
    .maybeSingle();

  return {
    portal: portalForRole(role),
    organizationId: organization.id,
    name: organization.name,
    code: organization.code,
    primaryColor: branding?.primary_color ?? "#065f46",
    secondaryColor: branding?.secondary_color ?? "#10b981",
    logo: await resolveLogoUrl(client, branding?.logo_path ?? null),
  };
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
    const access = await accessForOrganization(client, membership.organization_id, membership.role);
    if (!access) continue;
    if (normalizedRequestedCode && access.code !== normalizedRequestedCode) continue;
    return access;
  }
  return null;
}

export async function loadOrganizationAccessById(client: SupabaseClient, organizationId: string): Promise<OrganizationAccess | null> {
  const { data: userResult, error: userError } = await client.auth.getUser();
  if (userError || !userResult.user) return null;
  const { data: membership, error } = await client
    .from("memberships")
    .select("organization_id, role")
    .eq("organization_id", organizationId)
    .eq("user_id", userResult.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (error || !membership) return null;
  return accessForOrganization(client, membership.organization_id, membership.role);
}

export async function updateOrganizationIdentity(client: SupabaseClient, value: OrganizationIdentityUpdate) {
  const code = normalizeOrganizationCode(value.code);
  if (!isValidOrganizationCode(code)) throw new Error("Use a unique organization code with 4 to 32 letters, numbers or hyphens.");
  if (value.name.trim().length < 2) throw new Error("Enter an organization name.");

  let logoPath: string | null = null;
  if (value.logo.startsWith("data:")) {
    const blob = await (await fetch(value.logo)).blob();
    if (!["image/png", "image/jpeg"].includes(blob.type) || blob.size > 1048576) {
      throw new Error("Use a PNG or JPEG logo no larger than 1 MB.");
    }
    const extension = blob.type === "image/png" ? "png" : "jpg";
    logoPath = `${value.organizationId}/logo-${Date.now()}.${extension}`;
    const { error: uploadError } = await client.storage.from("organization-logos").upload(logoPath, blob, {
      cacheControl: "3600",
      contentType: blob.type,
      upsert: false,
    });
    if (uploadError) throw new Error("The logo could not be uploaded.");
  }

  const { error } = await client.rpc("update_organization_identity", {
    target_organization: value.organizationId,
    target_name: value.name.trim(),
    target_code: code,
    target_primary_color: value.primaryColor,
    target_secondary_color: value.secondaryColor,
    target_logo_path: logoPath,
  });
  if (error) {
    if (logoPath) await client.storage.from("organization-logos").remove([logoPath]);
    if (error.code === "23505") throw new Error("That organization code is already used by another space.");
    throw new Error("The organization appearance could not be saved.");
  }

  if (logoPath) {
    const { data: files } = await client.storage.from("organization-logos").list(value.organizationId);
    const obsolete = (files ?? []).map(file => `${value.organizationId}/${file.name}`).filter(path => path !== logoPath);
    if (obsolete.length) await client.storage.from("organization-logos").remove(obsolete);
  }

  const access = await loadOrganizationAccessById(client, value.organizationId);
  if (!access) throw new Error("The updated organization could not be reloaded.");
  return access;
}

export function subscribeToOrganizationIdentity(client: SupabaseClient, organizationId: string, onChange: (access: OrganizationAccess) => void) {
  const refresh = async () => {
    const access = await loadOrganizationAccessById(client, organizationId);
    if (access) onChange(access);
  };
  const channel = client
    .channel(`organization-identity:${organizationId}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "organizations", filter: `id=eq.${organizationId}` }, refresh)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "organization_branding", filter: `organization_id=eq.${organizationId}` }, refresh)
    .subscribe();
  return () => { void client.removeChannel(channel); };
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
