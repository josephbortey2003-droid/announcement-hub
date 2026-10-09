"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { Check, CircleAlert, LogOut, X } from "lucide-react";
import type { AnnouncementDraft } from "@/components/announcement/audience-composer";
import { ActionModal, type ModalResult } from "@/components/workspace/action-modal";
import { MobileWorkspaceChrome, Sidebar } from "@/components/workspace/chrome";
import { AuthorityDashboard, CreatorDashboard, MemberDashboard } from "@/components/workspace/dashboards";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import {
  mergeNewPeople, readableText,
  type Authority, type AuthorityView, type BrandData, type CreatorView, type Group, type MemberView, type Modal,
  type Person, type Portal, type PublishedAnnouncement, type ThemeMode, type Viewer,
} from "@/lib/workspace/model";
import { brandFromAccess } from "@/lib/workspace/access";

type Notice = { type: "success" | "error"; text: string };
const NOTICE_MS = 4_000;

type WorkspaceProps = {
  portal: Portal;
  viewer: Viewer;
  onExit: () => void;
  brand: BrandData;
  setBrand: (brand: BrandData) => void;
  people: Person[];
  setPeople: Dispatch<SetStateAction<Person[]>>;
  groups: Group[];
  setGroups: Dispatch<SetStateAction<Group[]>>;
  authorities: Authority[];
  setAuthorities: Dispatch<SetStateAction<Authority[]>>;
  announcements: PublishedAnnouncement[];
  setAnnouncements: Dispatch<SetStateAction<PublishedAnnouncement[]>>;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
};

export function Workspace(props: WorkspaceProps) {
  const { portal, viewer, onExit, brand, setBrand, people, setPeople, groups, setGroups, authorities, setAuthorities, announcements, setAnnouncements, theme, setTheme } = props;
  const [creatorView, setCreatorView] = useState<CreatorView>("overview");
  const [authorityView, setAuthorityView] = useState<AuthorityView>("inbox");
  const [memberView, setMemberView] = useState<MemberView>("inbox");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);

  const view = portal === "creator" ? creatorView : portal === "authority" ? authorityView : memberView;
  const setView = (next: string) => {
    if (portal === "creator") setCreatorView(next as CreatorView);
    else if (portal === "authority") setAuthorityView(next as AuthorityView);
    else setMemberView(next as MemberView);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
  };

  // One timer for the current notice, so an older notice can never dismiss a newer one early.
  const notify = useCallback((type: Notice["type"], text: string) => {
    window.clearTimeout(noticeTimer.current);
    setNotice({ type, text });
    noticeTimer.current = window.setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  const closeModal = useCallback(() => setModal(null), []);

  // Signed-in members receive organization identity changes live.
  useEffect(() => {
    if (!brand.organizationId || getPublicSupabaseConfig() === null) return;
    let unsubscribe: (() => void) | undefined;
    let active = true;
    void import("@/lib/supabase/browser-auth").then(({ getBrowserClient, subscribeToOrganizationIdentity }) => {
      if (!active) return;
      unsubscribe = subscribeToOrganizationIdentity(getBrowserClient(), brand.organizationId!, (access) => setBrand(brandFromAccess(access)));
    });
    return () => { active = false; unsubscribe?.(); };
  }, [brand.organizationId, setBrand]);

  const commit = async (value: ModalResult) => {
    if (Array.isArray(value) || "email" in value) {
      const incoming = Array.isArray(value) ? value : [value];
      const { added, skipped } = mergeNewPeople(people, incoming);
      if (!added.length) throw new Error(incoming.length === 1 ? "That email or phone number is already in the directory." : "Everyone in this import is already in the directory.");
      setPeople((current) => [...current, ...added]);
      notify("success", `${added.length} preview ${added.length === 1 ? "member" : "members"} added.${skipped ? ` ${skipped} already in the directory ${skipped === 1 ? "was" : "were"} skipped.` : ""}`);
      return;
    }
    if ("personId" in value) {
      setAuthorities((current) => [...current, value]);
      notify("success", "Preview authority assigned.");
      return;
    }
    if ("type" in value) {
      setGroups((current) => [...current, value]);
      notify("success", "Preview group added.");
      return;
    }
    if (value.organizationId && getPublicSupabaseConfig()) {
      const { getBrowserClient, updateOrganizationIdentity } = await import("@/lib/supabase/browser-auth");
      const access = await updateOrganizationIdentity(getBrowserClient(), {
        organizationId: value.organizationId,
        name: value.name,
        code: value.code,
        primaryColor: value.color,
        secondaryColor: value.secondaryColor,
        logo: value.logo,
      });
      setBrand(brandFromAccess(access));
      notify("success", "Organization identity saved for every member on desktop and mobile.");
      return;
    }
    setBrand(value);
    notify("success", "Preview branding applied locally across all three portals.");
  };

  const publish = (draft: AnnouncementDraft) => {
    const sender = portal === "creator" ? "Organization owner" : "Authorized leader";
    // Same idempotency rule as the server: one announcement per client request id.
    setAnnouncements((items) => items.some((item) => item.id === draft.clientRequestId)
      ? items
      : [{ ...draft, id: draft.clientRequestId, sender, sentAt: new Date().toISOString() }, ...items]);
    notify("success", `Announcement published to ${draft.recipientIds.length} preview ${draft.recipientIds.length === 1 ? "recipient" : "recipients"}.`);
    if (portal === "creator") setCreatorView("announcements");
    else setAuthorityView("history");
  };

  const brandStyle = {
    "--org-primary": brand.color,
    "--org-secondary": brand.secondaryColor,
    "--org-on-primary": readableText(brand.color),
    "--org-on-secondary": readableText(brand.secondaryColor),
  } as CSSProperties;

  // The preview has no signed-in leader, so the authority portal uses every audience the owner has assigned.
  const assignedScopes = new Set(authorities.map((authority) => authority.scope));
  const authorityGroups = groups.filter((group) => assignedScopes.has(group.name));

  return (
    <main className="app-shell" data-theme={theme} style={brandStyle}>
      <a className="skip-link" href="#workspace-content">Skip to content</a>
      <MobileWorkspaceChrome portal={portal} view={view} setView={setView} onMenu={() => setMobileOpen(true)} brand={brand} />
      <Sidebar portal={portal} view={view} setView={setView} onExit={onExit} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} brand={brand} viewer={viewer} theme={theme} setTheme={setTheme} />
      {mobileOpen && <button type="button" className="menu-backdrop" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}
      <section className="content-shell" id="workspace-content">
        {portal === "creator" ? (
          <CreatorDashboard view={creatorView} setView={setCreatorView} setModal={setModal} warn={(text) => notify("error", text)} people={people} groups={groups} authorities={authorities} brand={brand} announcements={announcements} onPublish={publish} />
        ) : portal === "authority" ? (
          <AuthorityDashboard view={authorityView} setView={setAuthorityView} notify={(text) => notify("error", text)} groups={authorityGroups} people={people} announcements={announcements} onPublish={publish} organizationName={brand.name} />
        ) : (
          <MemberDashboard view={memberView} theme={theme} setTheme={setTheme} announcements={announcements} />
        )}
        <footer className="workspace-footer">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <button type="button" onClick={onExit}><LogOut size={15} /> {viewer.signedIn ? "Sign out" : "Leave preview"}</button>
        </footer>
      </section>
      {modal && <ActionModal type={modal} close={closeModal} commit={commit} people={people} groups={groups} brand={brand} />}
      {notice && (
        <div className={`toast ${notice.type}`} role={notice.type === "error" ? "alert" : "status"}>
          {notice.type === "success" ? <Check size={18} /> : <CircleAlert size={18} />}
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss"><X size={15} /></button>
        </div>
      )}
    </main>
  );
}
