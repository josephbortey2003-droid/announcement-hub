"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { Check, CircleAlert, LogOut, X } from "lucide-react";
import type { AnnouncementDraft } from "@/components/announcement/audience-composer";
import { ActionModal, type ModalResult } from "@/components/workspace/action-modal";
import { MobileWorkspaceChrome, Sidebar } from "@/components/workspace/chrome";
import { InviteDialog } from "@/components/workspace/invite-dialog";
import { AuthorityDashboard, CreatorDashboard, MemberDashboard } from "@/components/workspace/dashboards";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import {
  mergeNewPeople, reachablePeople, readableText,
  type Authority, type AuthorityView, type BrandData, type CreatorView, type Group, type MemberView, type Modal,
  type Person, type Portal, type PublishedAnnouncement, type ThemeMode, type Viewer,
} from "@/lib/workspace/model";
import { brandFromAccess } from "@/lib/workspace/access";
import type { AnnouncementItem } from "@/lib/supabase/announcements";

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

  // Signed-in people work on real organization data; everyone else uses preview data in memory.
  const connected = viewer.signedIn && Boolean(brand.organizationId) && getPublicSupabaseConfig() !== null;
  // The saved directory is owner-only.
  const savedDirectory = connected && portal === "creator";
  const [savedAnnouncements, setSavedAnnouncements] = useState<AnnouncementItem[]>([]);
  const [publishingGroups, setPublishingGroups] = useState<Group[]>([]);

  // Owners and leaders see what they sent; members see their inbox. Leaders also need their publishing scope.
  const fetchAnnouncements = useCallback(async (): Promise<{ items: AnnouncementItem[]; groups?: Group[] }> => {
    const [{ getBrowserClient }, announcementsApi] = await Promise.all([import("@/lib/supabase/browser-auth"), import("@/lib/supabase/announcements")]);
    const client = getBrowserClient();
    if (portal === "member") return { items: await announcementsApi.loadInbox(client, brand.organizationId!) };
    const [items, groups] = await Promise.all([
      announcementsApi.loadSentAnnouncements(client, brand.organizationId!),
      portal === "authority" ? announcementsApi.loadPublishingGroups(client, brand.organizationId!) : Promise.resolve(undefined),
    ]);
    return { items, groups };
  }, [portal, brand.organizationId]);

  const loadAnnouncements = useCallback(async () => {
    if (!connected) return;
    const result = await fetchAnnouncements();
    setSavedAnnouncements(result.items);
    if (result.groups) setPublishingGroups(result.groups);
  }, [connected, fetchAnnouncements]);

  useEffect(() => {
    if (!connected) return;
    let active = true;
    void (async () => {
      try {
        const result = await fetchAnnouncements();
        if (!active) return;
        setSavedAnnouncements(result.items);
        if (result.groups) setPublishingGroups(result.groups);
      } catch (error) {
        if (active) notify("error", error instanceof Error ? error.message : "Announcements could not be loaded.");
      }
    })();
    return () => { active = false; };
  }, [connected, fetchAnnouncements, notify]);

  const markRead = async (item: AnnouncementItem) => {
    if (!item.deliveryId) return;
    try {
      const [{ getBrowserClient }, { markAnnouncementRead }] = await Promise.all([import("@/lib/supabase/browser-auth"), import("@/lib/supabase/announcements")]);
      const readAt = await markAnnouncementRead(getBrowserClient(), item.deliveryId);
      setSavedAnnouncements((items) => items.map((entry) => (entry.deliveryId === item.deliveryId ? { ...entry, readAt } : entry)));
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "The announcement could not be marked as read.");
    }
  };
  // savedDirectory cannot change while the workspace is mounted, so loading starts immediately.
  const [directoryState, setDirectoryState] = useState<"idle" | "loading" | "ready" | "error">(() => (savedDirectory ? "loading" : "idle"));

  useEffect(() => {
    if (!savedDirectory) return;
    let active = true;
    void (async () => {
      try {
        const [{ getBrowserClient }, { loadOrganizationDirectory }] = await Promise.all([import("@/lib/supabase/browser-auth"), import("@/lib/supabase/directory")]);
        const snapshot = await loadOrganizationDirectory(getBrowserClient(), brand.organizationId!);
        if (!active) return;
        setPeople(snapshot.people);
        setGroups(snapshot.groups);
        setDirectoryState("ready");
      } catch (error) {
        if (!active) return;
        setDirectoryState("error");
        notify("error", error instanceof Error ? error.message : "The organization directory could not be loaded.");
      }
    })();
    return () => { active = false; };
  }, [savedDirectory, brand.organizationId, setPeople, setGroups, notify]);

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
    if ("kind" in value) {
      const { added, skipped } = mergeNewPeople(people, value.people);
      if (!added.length) throw new Error(value.people.length === 1 ? "That email or phone number is already in the directory." : "Everyone in this import is already in the directory.");
      const skippedNote = skipped ? ` ${skipped} already in the directory ${skipped === 1 ? "was" : "were"} skipped.` : "";
      if (savedDirectory) {
        const [{ getBrowserClient }, { importOrganizationPeople }] = await Promise.all([import("@/lib/supabase/browser-auth"), import("@/lib/supabase/directory")]);
        const snapshot = await importOrganizationPeople(getBrowserClient(), brand.organizationId!, value.source, added);
        setPeople(snapshot.people);
        setGroups(snapshot.groups);
        notify("success", `${added.length} ${added.length === 1 ? "person" : "people"} saved to the organization directory.${skippedNote}`);
        return;
      }
      setPeople((current) => [...current, ...added]);
      notify("success", `${added.length} preview ${added.length === 1 ? "member" : "members"} added.${skippedNote}`);
      return;
    }
    if ("personId" in value) {
      setAuthorities((current) => [...current, value]);
      notify("success", "Preview authority assigned.");
      return;
    }
    if ("type" in value) {
      if (savedDirectory) {
        const [{ getBrowserClient }, { createOrganizationGroup }] = await Promise.all([import("@/lib/supabase/browser-auth"), import("@/lib/supabase/directory")]);
        const group = await createOrganizationGroup(getBrowserClient(), brand.organizationId!, value);
        setGroups((current) => [...current, group].sort((a, b) => a.name.localeCompare(b.name)));
        notify("success", "Group saved for the organization.");
        return;
      }
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

  const publish = async (draft: AnnouncementDraft) => {
    if (connected) {
      // Errors are thrown back to the composer, which shows them and lets the author retry.
      const [{ getBrowserClient }, { notifyAnnouncementByEmail, publishAnnouncement }] = await Promise.all([import("@/lib/supabase/browser-auth"), import("@/lib/supabase/announcements")]);
      const client = getBrowserClient();
      const result = await publishAnnouncement(client, brand.organizationId!, draft);
      if (result.duplicate) {
        notify("success", "This announcement was already published; no copy was sent.");
      } else {
        const delivered = `Announcement delivered to ${result.recipientCount} ${result.recipientCount === 1 ? "member's inbox" : "members' inboxes"}`;
        notify("success", `${delivered}. Sending email copies…`);
        // Publishing has succeeded; email is a best-effort extra and never undoes it.
        const email = await notifyAnnouncementByEmail(client, brand.organizationId!, result.announcementId).catch(() => null);
        notify(email?.failed ? "error" : "success", !email || !email.configured
          ? `${delivered}. Email copies are not set up yet.`
          : `${delivered} and emailed to ${email.sent} ${email.sent === 1 ? "person" : "people"}${email.failed ? `; ${email.failed} ${email.failed === 1 ? "email" : "emails"} failed` : ""}.`);
      }
      await loadAnnouncements().catch(() => undefined);
      if (portal === "creator") setCreatorView("announcements");
      else setAuthorityView("history");
      return;
    }
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
  const authorityGroups = connected ? publishingGroups : groups.filter((group) => assignedScopes.has(group.name));

  const previewItems: AnnouncementItem[] = announcements.map((item) => ({
    id: item.id, title: item.title, body: item.body, priority: item.priority, publishedAt: item.sentAt, sender: item.sender,
    audienceLabel: item.audienceLabel, recipientCount: item.recipientIds.length,
  }));
  const shownAnnouncements = connected ? savedAnnouncements : previewItems;

  return (
    <main className="app-shell" data-theme={theme} style={brandStyle}>
      <a className="skip-link" href="#workspace-content">Skip to content</a>
      <MobileWorkspaceChrome portal={portal} view={view} setView={setView} onMenu={() => setMobileOpen(true)} brand={brand} />
      <Sidebar portal={portal} view={view} setView={setView} onExit={onExit} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} brand={brand} viewer={viewer} theme={theme} setTheme={setTheme} />
      {mobileOpen && <button type="button" className="menu-backdrop" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}
      <section className="content-shell" id="workspace-content">
        {portal === "creator" ? (
          <CreatorDashboard view={creatorView} setView={setCreatorView} setModal={setModal} warn={(text) => notify("error", text)} people={people} groups={groups} authorities={authorities} brand={brand} announcements={shownAnnouncements} onPublish={publish} saved={savedDirectory} directoryState={directoryState} />
        ) : portal === "authority" ? (
          <AuthorityDashboard view={authorityView} setView={setAuthorityView} notify={(text) => notify("error", text)} groups={authorityGroups} people={people} announcements={connected ? savedAnnouncements : previewItems.filter((item) => item.sender === "Authorized leader")} onPublish={publish} organizationName={brand.name} saved={connected} />
        ) : (
          <MemberDashboard view={memberView} theme={theme} setTheme={setTheme} announcements={shownAnnouncements} saved={connected} onMarkRead={markRead} onRefresh={() => { loadAnnouncements().catch(() => notify("error", "Announcements could not be loaded.")); }} />
        )}
        <footer className="workspace-footer">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <button type="button" onClick={onExit}><LogOut size={15} /> {viewer.signedIn ? "Sign out" : "Leave preview"}</button>
        </footer>
      </section>
      {modal === "invite" && (
        <InviteDialog
          people={people}
          organizationName={brand.name}
          close={closeModal}
          createLinks={async (entryIds) => {
            const [{ getBrowserClient }, { createInvitations }, { loadOrganizationDirectory }] = await Promise.all([
              import("@/lib/supabase/browser-auth"), import("@/lib/supabase/invitations"), import("@/lib/supabase/directory"),
            ]);
            const client = getBrowserClient();
            const created = await createInvitations(client, brand.organizationId!, entryIds);
            const snapshot = await loadOrganizationDirectory(client, brand.organizationId!);
            setPeople(snapshot.people);
            setGroups(snapshot.groups);
            return created;
          }}
        />
      )}
      {modal && modal !== "invite" && <ActionModal type={modal} close={closeModal} commit={commit} people={reachablePeople(people, savedDirectory)} groups={groups} brand={brand} />}
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
