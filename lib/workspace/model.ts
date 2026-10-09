// Shared types and pure helpers for the workspace interface (app/page.tsx and components/workspace).
// Nothing here touches React or the browser, so it can be unit-tested directly.

import { normalizeE164 } from "../sms/phone.ts";
import type { AnnouncementDraft } from "@/components/announcement/audience-composer";

export type Portal = "creator" | "authority" | "member";
export type CreatorView = "overview" | "announcements" | "compose" | "people" | "authorities" | "groups" | "delivery" | "billing" | "branding";
export type AuthorityView = "inbox" | "compose" | "history";
export type MemberView = "inbox" | "history" | "preferences";
export type Modal = "people" | "authority" | "group" | "branding" | null;
export type ThemeMode = "system" | "light" | "dark";

export type BrandData = { organizationId?: string; name: string; code: string; color: string; secondaryColor: string; logo: string };
export type Person = { id: string; name: string; email: string; phone: string; group: string };
export type Group = { id: string; name: string; type: string };
export type Authority = { id: string; personId: string; level: string; scope: string };
export type PublishedAnnouncement = AnnouncementDraft & { id: string; sender: string; sentAt: string };

/** Who is using the workspace: a signed-in account, or the unauthenticated preview. */
export type Viewer = { name: string; signedIn: boolean };
export const previewViewer: Viewer = { name: "Preview user", signedIn: false };

export const demoBrand: BrandData = { name: "Demo University", code: "DEMO-ORG", color: "#176b91", secondaryColor: "#d6ad43", logo: "" };

export const portalLabel: Record<Portal, string> = {
  creator: "Organization owner",
  authority: "Authorized leader",
  member: "Member",
};

export function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "AH";
}

/** Returns dark or white text, whichever reads better on the given brand colour (WCAG relative luminance). */
export function readableText(hex: string) {
  const value = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return "#ffffff";
  const [r, g, b] = [0, 2, 4]
    .map((index) => parseInt(value.slice(index, index + 2), 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.36 ? "#071c2d" : "#ffffff";
}

/**
 * Interprets a sign-in identifier. Anything with "@" is an email; anything else that
 * looks like a phone number (0244 123 456, 233244123456, +233...) becomes E.164.
 */
export function parseSignInIdentifier(value: string): { email: string } | { phone: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? { email: trimmed } : null;
  if (!/^[+\d\s().-]+$/.test(trimmed)) return null;
  try {
    return { phone: normalizeE164(trimmed) };
  } catch {
    return null;
  }
}

/** Splits incoming people into those that are new and those whose email or phone is already in the directory. */
export function mergeNewPeople<T extends { email: string; phone: string }>(existing: T[], incoming: T[]) {
  const known = new Set(existing.flatMap((person) => [person.email && `e:${person.email.toLowerCase()}`, person.phone && `p:${person.phone}`]).filter(Boolean));
  const added: T[] = [];
  let skipped = 0;
  for (const person of incoming) {
    const keys = [person.email && `e:${person.email.toLowerCase()}`, person.phone && `p:${person.phone}`].filter(Boolean);
    if (keys.some((key) => known.has(key))) { skipped += 1; continue; }
    keys.forEach((key) => known.add(key));
    added.push(person);
  }
  return { added, skipped };
}

/** Setup checklist for the owner overview, derived from real state rather than hard-coded. */
export function setupProgress(input: { brand: BrandData; people: number; groups: number; authorities: number }) {
  const steps = {
    created: true,
    branding: Boolean(input.brand.logo) || input.brand.color.toLowerCase() !== demoBrand.color || input.brand.secondaryColor.toLowerCase() !== demoBrand.secondaryColor,
    people: input.people > 0,
    authority: input.groups > 0 && input.authorities > 0,
  };
  return { steps, complete: Object.values(steps).filter(Boolean).length, total: Object.keys(steps).length };
}
