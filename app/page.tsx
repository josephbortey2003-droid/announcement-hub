"use client";

// Entry point: shows the sign-in page, or the workspace for the chosen portal.
// The interface itself lives in components/auth and components/workspace.

import { useEffect, useState } from "react";
import { Welcome } from "@/components/auth/welcome";
import { Workspace } from "@/components/workspace/workspace";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { brandFromAccess, viewerFromAccess } from "@/lib/workspace/access";
import {
  demoBrand, previewViewer,
  type Authority, type BrandData, type Group, type Person, type Portal, type PublishedAnnouncement, type ThemeMode, type Viewer,
} from "@/lib/workspace/model";

const THEME_KEY = "announcement-hub-theme";

export default function Home() {
  const [portal, setPortal] = useState<Portal | null>(null);
  const [viewer, setViewer] = useState<Viewer>(previewViewer);
  const [brand, setBrand] = useState<BrandData>(demoBrand);
  const [theme, setThemeState] = useState<ThemeMode>("system");
  // Preview data lives in memory only; it is cleared on refresh and never sent to a server.
  const [people, setPeople] = useState<Person[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [authorities, setAuthorities] = useState<Authority[]>([]);
  const [announcements, setAnnouncements] = useState<PublishedAnnouncement[]>([]);

  useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(THEME_KEY); } catch { /* storage can be blocked */ }
    if (saved !== "light" && saved !== "dark") return;
    const timer = window.setTimeout(() => setThemeState(saved), 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Restore a signed-in session, finishing owner sign-up if it was waiting for email verification.
  useEffect(() => {
    if (getPublicSupabaseConfig() === null) return;
    let active = true;
    const restore = async () => {
      try {
        const { completePendingOrganization, getBrowserClient, loadOrganizationAccess, takeRequestedOrganizationCode } = await import("@/lib/supabase/browser-auth");
        const client = getBrowserClient();
        const { data } = await client.auth.getUser();
        if (!data.user || !active) return;
        const created = await completePendingOrganization(data.user, client);
        const access = created ?? await loadOrganizationAccess(client, takeRequestedOrganizationCode());
        if (!access || !active) return;
        setBrand(brandFromAccess(access));
        setViewer(viewerFromAccess(access));
        setPortal(access.portal);
      } catch (error) {
        console.error("Authenticated workspace restore failed", error instanceof Error ? error.message : "unknown error");
      }
    };
    void restore();
    return () => { active = false; };
  }, []);

  const setTheme = (value: ThemeMode) => {
    setThemeState(value);
    try { window.localStorage.setItem(THEME_KEY, value); } catch { /* storage can be blocked */ }
  };

  const enterPortal = (next: Portal, nextBrand?: BrandData, nextViewer?: Viewer) => {
    if (nextBrand) setBrand(nextBrand);
    setViewer(nextViewer ?? previewViewer);
    setPortal(next);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
  };

  const exitPortal = async () => {
    if (viewer.signedIn && getPublicSupabaseConfig()) {
      const { getBrowserClient } = await import("@/lib/supabase/browser-auth");
      await getBrowserClient().auth.signOut();
    }
    setBrand(demoBrand);
    setViewer(previewViewer);
    setPortal(null);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
  };

  if (!portal) return <Welcome onEnter={enterPortal} theme={theme} setTheme={setTheme} />;
  return (
    <Workspace
      portal={portal}
      viewer={viewer}
      onExit={exitPortal}
      brand={brand}
      setBrand={setBrand}
      people={people}
      setPeople={setPeople}
      groups={groups}
      setGroups={setGroups}
      authorities={authorities}
      setAuthorities={setAuthorities}
      announcements={announcements}
      setAnnouncements={setAnnouncements}
      theme={theme}
      setTheme={setTheme}
    />
  );
}
