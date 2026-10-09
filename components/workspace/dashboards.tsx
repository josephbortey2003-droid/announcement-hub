"use client";

import { useState } from "react";
import { Bell, Building2, Check, CheckCheck, History, Inbox, MessageSquareText, Palette, Plus, RefreshCw, Send, ShieldCheck, Sun, UserPlus, Users, WalletCards } from "lucide-react";
import type { AnnouncementItem } from "@/lib/supabase/announcements";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AudienceComposer, type AnnouncementDraft } from "@/components/announcement/audience-composer";
import { EmptyState, Header, OrgAvatar } from "@/components/workspace/chrome";
import {
  initials, reachablePeople, setupProgress, statusLabel,
  type Authority, type AuthorityView, type BrandData, type CreatorView, type Group, type MemberView, type Modal,
  type Person, type ThemeMode,
} from "@/lib/workspace/model";

type RecordsProps = {
  items: AnnouncementItem[];
  heading: string;
  subtitle: string;
  emptyTitle: string;
  emptyBody: string;
  /** Members: record that an announcement was read. */
  onMarkRead?: (item: AnnouncementItem) => void;
};

function AnnouncementRecords({ items, heading, subtitle, emptyTitle, emptyBody, onMarkRead }: RecordsProps) {
  if (!items.length) return <EmptyState icon={Inbox} title={emptyTitle} body={emptyBody} />;
  return (
    <section className="data-panel published-list">
      <div className="data-head">
        <div><h2>{heading}</h2><p>{subtitle}</p></div>
        <span>{items.length} total</span>
      </div>
      {items.map((item) => {
        const unread = item.deliveryId !== undefined && !item.readAt;
        return (
          <article key={item.id} className={unread ? "unread" : undefined}>
            <span className={`priority-marker ${item.priority}`}>{item.priority}</span>
            <div>
              <h3>{unread && <span className="unread-badge">New</span>}{item.title}</h3>
              <p>{item.body}</p>
              <footer>
                {item.audienceLabel && <span>{item.audienceLabel}</span>}
                {item.recipientCount !== undefined && (
                  <span>{item.recipientCount} {item.recipientCount === 1 ? "recipient" : "recipients"}{item.readCount !== undefined && ` · ${item.readCount} read`}</span>
                )}
                <span>{item.sender}</span>
                <time dateTime={item.publishedAt}>{new Date(item.publishedAt).toLocaleString()}</time>
                {item.readAt && <span><CheckCheck size={13} /> Read</span>}
              </footer>
              {unread && onMarkRead && (
                <button type="button" className="text-action" onClick={() => onMarkRead(item)}><Check size={15} /> Mark as read</button>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}

type CreatorDashboardProps = {
  view: CreatorView;
  setView: (view: CreatorView) => void;
  setModal: (modal: Modal) => void;
  warn: (message: string) => void;
  people: Person[];
  groups: Group[];
  authorities: Authority[];
  brand: BrandData;
  announcements: AnnouncementItem[];
  onPublish: (draft: AnnouncementDraft) => void | Promise<void>;
  /** True when a signed-in owner is working on the saved organization directory. */
  saved: boolean;
  directoryState: "idle" | "loading" | "ready" | "error";
};

export function CreatorDashboard({ view, setView, setModal, warn, people, groups, authorities, brand, announcements, onPublish, saved, directoryState }: CreatorDashboardProps) {
  // In a saved organization, announcements and authority need people who have accepted an invitation.
  const reachable = reachablePeople(people, saved);
  const recordLabel = saved ? "saved" : "preview";
  if (view === "overview") {
    const progress = setupProgress({ brand, people: people.length, groups: groups.length, authorities: authorities.length });
    const nextStep = !progress.steps.branding ? "branding" : !progress.steps.people ? "people" : !progress.steps.authority ? "authority" : undefined;
    const stepNumber = (done: boolean, number: number) => <span className="step-number">{done ? <Check size={14} /> : number}</span>;
    return (
      <>
        <Header title="Overview" description="Set up the organization before inviting members" />
        <section className="setup-card setup-tracker">
          <div className="setup-summary">
            <span>SPACE SETUP</span>
            <h2>{progress.complete === progress.total ? "Your organization is set up" : "Complete your organization setup"}</h2>
            <p>Connect real member data before activity and delivery reporting are shown.</p>
            <div className="setup-progress">
              <span>{progress.complete} of {progress.total} complete</span>
              <div role="progressbar" aria-label="Organization setup progress" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.complete}>
                <i style={{ width: `${(progress.complete / progress.total) * 100}%` }} />
              </div>
            </div>
          </div>
          <Accordion type="single" defaultValue={nextStep} collapsible className="setup-accordion">
            <AccordionItem value="created" className="setup-step done">
              <AccordionTrigger>{stepNumber(true, 1)}<span><strong>Space created</strong><small>{brand.name}</small></span></AccordionTrigger>
              <AccordionContent><p>Your organization space and code are ready for configuration.</p></AccordionContent>
            </AccordionItem>
            <AccordionItem value="branding" className={`setup-step${progress.steps.branding ? " done" : ""}`}>
              <AccordionTrigger>{stepNumber(progress.steps.branding, 2)}<span><strong>Add logo and brand colors</strong><small>{progress.steps.branding ? "Organization identity applied" : "Make the space recognizable"}</small></span></AccordionTrigger>
              <AccordionContent><p>Set the two-color palette and circular logo members will see.</p><button className="secondary" onClick={() => setView("branding")}>Open branding</button></AccordionContent>
            </AccordionItem>
            <AccordionItem value="people" className={`setup-step${progress.steps.people ? " done" : ""}`}>
              <AccordionTrigger>{stepNumber(progress.steps.people, 3)}<span><strong>Import organization members</strong><small>{people.length ? `${people.length} ${recordLabel} ${people.length === 1 ? "record" : "records"}` : "No member records connected yet"}</small></span></AccordionTrigger>
              <AccordionContent><p>Add people individually, paste rows or upload a CSV file.</p><button className="secondary" onClick={() => setView("people")}>Open people</button></AccordionContent>
            </AccordionItem>
            <AccordionItem value="authority" className={`setup-step${progress.steps.authority ? " done" : ""}`}>
              <AccordionTrigger>{stepNumber(progress.steps.authority, 4)}<span><strong>Assign announcement authority</strong><small>{progress.steps.authority ? `${authorities.length} ${authorities.length === 1 ? "assignment" : "assignments"}` : "Define who can contact each audience"}</small></span></AccordionTrigger>
              <AccordionContent><p>Create groups first, then give leaders the minimum audience scope they need.</p><button className="secondary" onClick={() => setView("authorities")}>Open authorities</button></AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>
        <section className="honest-grid">
          <article><Users size={20} /><strong>Member activity</strong><p>Available after members join and activity tracking begins.</p></article>
          <article><MessageSquareText size={20} /><strong>Delivery reporting</strong><p>Available after a messaging provider is connected.</p></article>
        </section>
      </>
    );
  }

  if (view === "compose") {
    return (
      <>
        <Header title="Create announcement" description="Choose exactly who should receive this official update" />
        <AudienceComposer people={reachable} groups={groups} allowOrganization organizationName={brand.name} onCancel={() => setView("announcements")} onPublish={onPublish} />
      </>
    );
  }

  if (view === "announcements") {
    return (
      <>
        <Header
          title="Announcements"
          description="Publish to the whole organization, selected groups or specific people"
          action={<button type="button" className="primary-action" onClick={() => (reachable.length ? setView("compose") : warn(saved ? "Announcements reach people once they accept an invitation. Invite people from the People page." : "Import at least one member before creating an announcement."))}><Plus size={17} /> New announcement</button>}
        />
        <AnnouncementRecords
          items={announcements}
          heading="Published announcements"
          subtitle={saved ? "Delivered to members' inboxes. Read counts update when you reopen this page." : "Preview records from this browser session"}
          emptyTitle="No announcements published"
          emptyBody="Create an announcement, build its audience and review the resolved recipients before publishing."
        />
      </>
    );
  }

  if (view === "people") {
    return (
      <>
        <Header
          title="People"
          description="Import and review organization members"
          action={
            <>
              {saved && people.some((person) => person.status === "staged" || person.status === "invited") && (
                <button type="button" className="secondary" onClick={() => setModal("invite")}><Send size={17} /> Invite people</button>
              )}
              <button type="button" className="primary-action" onClick={() => setModal("people")}><UserPlus size={17} /> Add people</button>
            </>
          }
        />
        {saved && directoryState === "loading" && !people.length ? (
          <EmptyState icon={Users} title="Loading the organization directory" body="Fetching the people saved for this organization." />
        ) : people.length ? (
          <section className="data-panel member-directory">
            <div className="data-head">
              <div><h2>Member directory</h2><p>{saved ? "Saved to your organization. People can sign in after they accept an invitation." : "Preview records added during this session"}</p></div>
              <span>{people.length} {people.length === 1 ? "person" : "people"}</span>
            </div>
            <Table>
              <TableCaption className="sr-only">{saved ? "Organization directory" : "Preview organization members"}</TableCaption>
              <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Contact</TableHead><TableHead>Group</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {people.map((person) => (
                  <TableRow key={person.id}>
                    <TableCell><div className="member-name"><Avatar size="sm"><AvatarFallback>{initials(person.name)}</AvatarFallback></Avatar><strong>{person.name}</strong></div></TableCell>
                    <TableCell>{[person.email, person.phone].filter(Boolean).join(" · ")}</TableCell>
                    <TableCell>{person.group || "Unassigned"}</TableCell>
                    <TableCell><span className="record-status"><Check size={13} /> {person.status ? statusLabel[person.status] : "Preview record"}</span></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        ) : (
          <EmptyState icon={Users} title="No members have been imported" body="Add one person, paste comma-separated rows, or upload a CSV. Directory sync needs a secure backend." action={<button type="button" className="primary-action" onClick={() => setModal("people")}>Choose an input method</button>} />
        )}
      </>
    );
  }

  if (view === "authorities") {
    return (
      <>
        <Header
          title="Authorities"
          description="Assign hierarchy levels and audience scope"
          action={<button type="button" className="primary-action" onClick={() => (reachable.length && groups.length ? setModal("authority") : warn(saved ? "Authority can be given to people once they accept an invitation. Invite people from the People page." : "Add at least one person and one group first."))}><Plus size={17} /> Assign authority</button>}
        />
        {authorities.length ? (
          <section className="data-panel">
            <div className="data-head"><h2>Preview assignments</h2><span>{authorities.length} total</span></div>
            {authorities.map((authority) => (
              <div className="authority-card" key={authority.id}>
                <ShieldCheck size={19} />
                <div><strong>{people.find((person) => person.id === authority.personId)?.name ?? "Removed person"}</strong><p>{authority.level} · {authority.scope}</p></div>
              </div>
            ))}
          </section>
        ) : (
          <EmptyState icon={ShieldCheck} title="No authority assignments yet" body="Import members and create groups first, then assign a hierarchy level and permitted audience." />
        )}
      </>
    );
  }

  if (view === "groups") {
    return (
      <>
        <Header title="Groups" description="Create departments, offices, courses and classes" action={<button type="button" className="primary-action" onClick={() => setModal("group")}><Plus size={17} /> Add group</button>} />
        {groups.length ? (
          <section className="data-panel">
            <div className="data-head"><div><h2>Audience groups</h2>{saved && <p>Saved to your organization</p>}</div><span>{groups.length} total</span></div>
            {groups.map((group) => {
              const members = people.filter((person) => person.group.split(", ").includes(group.name)).length;
              return (
                <div className="authority-card" key={group.id}>
                  <Building2 size={19} />
                  <div><strong>{group.name}</strong><p>{group.type} · {members} {members === 1 ? "member" : "members"}</p></div>
                </div>
              );
            })}
          </section>
        ) : (
          <EmptyState icon={Building2} title="No audience groups yet" body="Create a department, office, course, class or project." />
        )}
      </>
    );
  }

  if (view === "delivery") {
    return (
      <>
        <Header title="Delivery" description="Provider-confirmed channel outcomes" />
        <EmptyState icon={MessageSquareText} title="No delivery records" body="Sent, delivered, read and failed statuses will appear after a messaging provider is connected and the first announcement is sent." />
      </>
    );
  }

  if (view === "billing") {
    return (
      <>
        <Header title="Credits and billing" description="Control SMS fallback spending" />
        <section className="billing-explainer">
          <WalletCards size={24} />
          <h2>Hubtel setup pending</h2>
          <p>The protected Hubtel connection and delivery ledger are installed. Real sending stays disabled until server credentials, an approved sender ID and an organization spending limit are configured. Only provider-confirmed charges will be treated as actual cost.</p>
          <button className="primary-action" onClick={() => warn("Next: activate Hubtel, approve a sender ID, then add the credentials to the secure server environment.")}>Review next step</button>
        </section>
      </>
    );
  }

  return (
    <>
      <Header title="Branding" description="Apply your organization identity to every member experience" />
      <section className="brand-settings">
        <div className="brand-preview">
          <OrgAvatar brand={brand} large />
          <strong>{brand.name}</strong>
          <small>{brand.code}</small>
          <span className="brand-swatches" aria-label="Selected brand colors"><i style={{ background: brand.color }} /><i style={{ background: brand.secondaryColor }} /></span>
        </div>
        <div>
          <h2>Organization appearance</h2>
          <p>Choose two brand colors and a circular logo. The colors are blended into one consistent gradient, then softened for backgrounds and darkened for controls so the entire workspace stays recognizable and readable.</p>
          <button type="button" className="primary-action" onClick={() => setModal("branding")}><Palette size={17} /> Customize appearance</button>
        </div>
      </section>
    </>
  );
}

type AuthorityDashboardProps = {
  view: AuthorityView;
  setView: (view: AuthorityView) => void;
  notify: (message: string) => void;
  groups: Group[];
  people: Person[];
  /** Announcements this leader sent. */
  announcements: AnnouncementItem[];
  onPublish: (draft: AnnouncementDraft) => void | Promise<void>;
  organizationName: string;
  /** True for a signed-in leader working on real data. */
  saved: boolean;
};

export function AuthorityDashboard({ view, setView, notify, groups, people, announcements, onPublish, organizationName, saved }: AuthorityDashboardProps) {
  // A signed-in leader cannot see members' names, so they publish to whole groups and the database counts the recipients.
  const scopedPeople = saved ? [] : people.filter((person) => groups.some((group) => group.name === person.group));
  if (view === "compose") {
    return (
      <>
        <Header title="Create announcement" description="Only creator-assigned audiences are available" />
        <AudienceComposer people={scopedPeople} groups={groups} allowOrganization={false} organizationName={organizationName} onCancel={() => setView("inbox")} onPublish={onPublish} recipientsCountedOnPublish={saved} />
      </>
    );
  }
  if (view === "history") {
    return (
      <>
        <Header title="Sent history" description="Announcements sent from your account" />
        <AnnouncementRecords items={announcements} heading="Sent announcements" subtitle={saved ? "With how many recipients have read each one" : "Preview records from this browser session"} emptyTitle="No announcements sent" emptyBody="Your sent announcements and their read counts will appear here." />
      </>
    );
  }
  return (
    <>
      <Header
        title="Authority overview"
        description="Your publishing access is limited to assigned audiences"
        action={<button type="button" className="primary-action" onClick={() => (groups.length ? setView("compose") : notify("Assign authority over a group in the owner portal before composing."))}><Plus size={17} /> Create announcement</button>}
      />
      <section className="scope-card">
        <ShieldCheck size={22} />
        <div>
          <span>{saved ? "YOUR PUBLISHING SCOPE" : "PREVIEW SCOPE"}</span>
          <h2>{groups.length ? groups.map((group) => group.name).join(", ") : "No audience assigned"}</h2>
          <p>{saved ? "The database re-checks your scope on every announcement, so you can only reach the groups listed here." : "The production server must re-check permission scope for every send. Hiding options in the interface is not sufficient authorization."}</p>
        </div>
      </section>
      {announcements.length ? (
        <AnnouncementRecords items={announcements.slice(0, 3)} heading="Recent announcements" subtitle="Your latest sends" emptyTitle="" emptyBody="" />
      ) : (
        <EmptyState icon={Inbox} title="No recent sends" body={groups.length ? "Create an announcement for one of your assigned audiences." : saved ? "The organization owner has not assigned you an audience yet." : "In the owner portal, create a group and assign authority over it to test scoped publishing."} />
      )}
    </>
  );
}

type MemberDashboardProps = {
  view: MemberView;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  announcements: AnnouncementItem[];
  saved: boolean;
  onMarkRead: (item: AnnouncementItem) => void;
  onRefresh: () => void;
};

export function MemberDashboard({ view, theme, setTheme, announcements, saved, onMarkRead, onRefresh }: MemberDashboardProps) {
  const [channel, setChannel] = useState("in-app-sms");
  if (view === "preferences") {
    return (
      <>
        <Header title="Preferences" description="Choose appearance and notification channels" />
        <section className="preference-list">
          <label>
            <span><Sun size={19} /><strong>Appearance</strong></span>
            <select aria-label="Appearance" value={theme} onChange={(event) => setTheme(event.target.value as ThemeMode)}>
              <option value="system">Use device setting</option><option value="light">Light</option><option value="dark">Dark</option>
            </select>
          </label>
          <label>
            <span><Bell size={19} /><strong>Notifications</strong></span>
            <select aria-label="Notification channel" aria-describedby="channel-help" value={channel} onChange={(event) => setChannel(event.target.value)}>
              <option value="in-app-sms">In-app with SMS fallback</option><option value="in-app">In-app only</option>
            </select>
          </label>
          <p id="channel-help" className="field-help">Notification preferences are not saved in the preview. WhatsApp delivery is planned and not yet available.</p>
        </section>
      </>
    );
  }
  if (view === "history") {
    return (
      <>
        <Header title="Announcement history" description="Announcements you have read" />
        {saved && announcements.some((item) => item.readAt) ? (
          <AnnouncementRecords items={announcements.filter((item) => item.readAt)} heading="Read announcements" subtitle="Newest first" emptyTitle="" emptyBody="" />
        ) : (
          <EmptyState icon={History} title="No announcement history" body="Announcements you have read will appear here with the sender, date and time." />
        )}
      </>
    );
  }
  return (
    <>
      <Header
        title="Inbox"
        description="Official announcements from your organization"
        action={saved ? <button type="button" className="secondary" onClick={onRefresh}><RefreshCw size={16} /> Refresh</button> : undefined}
      />
      <AnnouncementRecords
        items={announcements}
        heading={saved ? `${announcements.filter((item) => !item.readAt).length} unread` : "Published announcements"}
        subtitle={saved ? "Mark an announcement as read so the sender knows it reached you." : "Preview records from this browser session"}
        emptyTitle="No announcements"
        emptyBody="New authorized announcements will appear here with the sender, date, time and priority."
        onMarkRead={saved ? onMarkRead : undefined}
      />
    </>
  );
}
