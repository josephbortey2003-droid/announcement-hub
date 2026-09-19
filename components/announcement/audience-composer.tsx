"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Check,
  CircleAlert,
  Search,
  Send,
  UserRound,
  Users,
} from "lucide-react";
import { resolvePreviewAudience } from "@/lib/announcements/audience";
import { calculateSmsSegments } from "@/lib/sms/segments";

export type AudiencePerson = {
  id: string;
  name: string;
  email: string;
  phone: string;
  group: string;
};

export type AudienceGroup = { id: string; name: string; type: string };

export type AnnouncementDraft = {
  title: string;
  body: string;
  priority: "normal" | "important" | "urgent";
  audienceLabel: string;
  audience: {
    wholeOrganization: boolean;
    groupIds: string[];
    membershipIds: string[];
    excludedMembershipIds: string[];
  };
  recipientIds: string[];
  smsFallbackMinutes: number | null;
};

type AudienceComposerProps = {
  people: AudiencePerson[];
  groups: AudienceGroup[];
  allowOrganization: boolean;
  organizationName: string;
  onCancel: () => void;
  onPublish: (draft: AnnouncementDraft) => void;
};

export function AudienceComposer({
  people,
  groups,
  allowOrganization,
  organizationName,
  onCancel,
  onPublish,
}: AudienceComposerProps) {
  const [step, setStep] = useState<"compose" | "review">("compose");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<AnnouncementDraft["priority"]>("normal");
  const [wholeOrganization, setWholeOrganization] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [excludedPeople, setExcludedPeople] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [fallback, setFallback] = useState("none");
  const [error, setError] = useState("");

  const candidateRecipients = useMemo(() => resolvePreviewAudience({
    people,
    groups,
    wholeOrganization,
    groupIds: selectedGroups,
    membershipIds: selectedPeople,
    excludedMembershipIds: [],
  }), [groups, people, selectedGroups, selectedPeople, wholeOrganization]);
  const activeExcludedPeople = useMemo(
    () => excludedPeople.filter((id) => candidateRecipients.some((person) => person.id === id)),
    [candidateRecipients, excludedPeople]
  );
  const recipients = useMemo(
    () => candidateRecipients.filter((person) => !activeExcludedPeople.includes(person.id)),
    [activeExcludedPeople, candidateRecipients]
  );
  const missingPhone = recipients.filter((person) => !person.phone.trim()).length;
  const smsCapable = recipients.length - missingPhone;
  const smsDetails = calculateSmsSegments(`${organizationName}\n${title}\n${body}`);
  const maximumSmsSegments = smsCapable * smsDetails.segments;
  const visiblePeople = people.filter((person) =>
    `${person.name} ${person.email} ${person.phone} ${person.group}`.toLowerCase().includes(search.toLowerCase())
  );
  const includesSomething = wholeOrganization || selectedGroups.length > 0 || selectedPeople.length > 0;

  const audienceLabel = wholeOrganization
    ? activeExcludedPeople.length
      ? `Everyone except ${activeExcludedPeople.length} ${activeExcludedPeople.length === 1 ? "person" : "people"}`
      : "Everyone in the organization"
    : [
        selectedGroups.length ? `${selectedGroups.length} ${selectedGroups.length === 1 ? "group" : "groups"}` : "",
        selectedPeople.length ? `${selectedPeople.length} specific ${selectedPeople.length === 1 ? "person" : "people"}` : "",
      ].filter(Boolean).join(" and ");

  const toggle = (value: string, values: string[], setValues: (next: string[]) => void) => {
    setValues(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  };

  const review = () => {
    if (!title.trim()) return setError("Add a short announcement title.");
    if (!body.trim()) return setError("Write the announcement message.");
    if (!includesSomething) return setError("Choose at least one audience.");
    if (!recipients.length) return setError("The current choices resolve to no recipients. Add members or change the audience.");
    setError("");
    setStep("review");
  };

  const publish = () => onPublish({
    title: title.trim(),
    body: body.trim(),
    priority,
    audienceLabel,
    audience: {
      wholeOrganization,
      groupIds: selectedGroups,
      membershipIds: selectedPeople,
      excludedMembershipIds: activeExcludedPeople,
    },
    recipientIds: recipients.map((person) => person.id),
    smsFallbackMinutes: fallback === "none" ? null : Number(fallback),
  });

  if (step === "review") {
    return <section className="composer-page announcement-composer" aria-labelledby="review-heading">
      <div className="composer-progress" aria-label="Announcement progress"><span>1 Draft</span><strong>2 Review</strong></div>
      <header className="review-heading"><div><p>FINAL CHECK</p><h2 id="review-heading">Review before publishing</h2></div><button type="button" className="text-action" onClick={() => setStep("compose")}><ArrowLeft size={16}/> Edit</button></header>
      <dl className="review-grid">
        <div><dt>Title</dt><dd>{title}</dd></div>
        <div><dt>Priority</dt><dd>{priority}</dd></div>
        <div><dt>Audience</dt><dd>{audienceLabel}</dd></div>
        <div><dt>Resolved recipients</dt><dd>{recipients.length}</dd></div>
        <div><dt>SMS fallback</dt><dd>{fallback === "none" ? "Off" : `After ${fallback} minutes if unread`}</dd></div>
        {fallback !== "none" && <div><dt>Maximum SMS segments</dt><dd>{maximumSmsSegments} if every SMS-capable recipient remains unread</dd></div>}
      </dl>
      <article className="message-preview"><span>MESSAGE PREVIEW</span><h3>{title}</h3><p>{body}</p></article>
      <section className="recipient-preview"><h3>Recipient check</h3><p>{recipients.slice(0, 5).map((person) => person.name).join(", ")}{recipients.length > 5 ? ` and ${recipients.length - 5} more` : ""}</p>{fallback !== "none" && missingPhone > 0 && <p className="field-warning"><CircleAlert size={16}/>{missingPhone} {missingPhone === 1 ? "recipient has" : "recipients have"} no phone number and cannot receive SMS fallback.</p>}</section>
      <footer><button type="button" className="secondary" onClick={() => setStep("compose")}>Back</button><button type="button" className="primary-action" onClick={publish}><Send size={16}/> Publish announcement</button></footer>
    </section>;
  }

  return <section className="composer-page announcement-composer" aria-labelledby="compose-heading">
    <div className="composer-progress" aria-label="Announcement progress"><strong>1 Draft</strong><span>2 Review</span></div>
    <div className="announcement-fields">
      <label><span>Title *</span><input value={title} maxLength={180} onChange={(event) => setTitle(event.target.value)} aria-describedby="title-help"/><small id="title-help">A concise subject recipients can scan quickly. {title.length}/180</small></label>
      <label><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value as AnnouncementDraft["priority"])}><option value="normal">Normal</option><option value="important">Important</option><option value="urgent">Urgent</option></select></label>
    </div>
    <label><span>Announcement *</span><textarea value={body} maxLength={5000} onChange={(event) => setBody(event.target.value)} aria-describedby="message-help"/><small id="message-help">Write the complete official message. {body.length}/5000</small></label>

    <fieldset className="audience-builder"><legend>Who should receive this? *</legend>
      {allowOrganization && <label className={`selection-row organization-choice ${wholeOrganization ? "selected" : ""}`}><input type="checkbox" checked={wholeOrganization} onChange={(event) => setWholeOrganization(event.target.checked)}/><Building2 size={19}/><span><strong>Everyone in the organization</strong><small>Includes every active member, with optional exclusions below.</small></span></label>}
      <section className="audience-section"><header><div><Users size={18}/><span><strong>Groups</strong><small>Combine departments, offices, courses, classes or projects.</small></span></div><span>{selectedGroups.length} selected</span></header>{groups.length ? <div className="selection-grid">{groups.map((group) => <label key={group.id} className={selectedGroups.includes(group.id) ? "selected" : ""}><input type="checkbox" checked={selectedGroups.includes(group.id)} onChange={() => toggle(group.id, selectedGroups, setSelectedGroups)}/><span><strong>{group.name}</strong><small>{group.type}</small></span></label>)}</div> : <p className="selection-empty">Create at least one group before targeting by department, office, course or class.</p>}</section>
      <section className="audience-section"><header><div><UserRound size={18}/><span><strong>Specific people</strong><small>Add individuals alongside selected groups.</small></span></div><span>{selectedPeople.length} selected</span></header><label className="member-search"><Search size={17}/><span className="sr-only">Search members</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search members"/></label>{people.length ? <div className="people-selector">{visiblePeople.map((person) => <label key={person.id} className={selectedPeople.includes(person.id) ? "selected" : ""}><input type="checkbox" checked={selectedPeople.includes(person.id)} onChange={() => toggle(person.id, selectedPeople, setSelectedPeople)}/><span><strong>{person.name}</strong><small>{person.group || "No group"} · {person.email || person.phone}</small></span></label>)}</div> : <p className="selection-empty">Import members before selecting individuals.</p>}</section>
      {includesSomething && candidateRecipients.length > 0 && <section className="audience-section exclusions"><header><div><CircleAlert size={18}/><span><strong>Exclude people</strong><small>Optional. Removed people will not receive this announcement.</small></span></div><span>{activeExcludedPeople.length} excluded</span></header><div className="people-selector compact">{candidateRecipients.map((person) => <label key={person.id} className={activeExcludedPeople.includes(person.id) ? "excluded" : ""}><input type="checkbox" checked={activeExcludedPeople.includes(person.id)} onChange={() => toggle(person.id, excludedPeople, setExcludedPeople)}/><span><strong>{person.name}</strong><small>{person.group || "No group"}</small></span></label>)}</div></section>}
    </fieldset>

    <section className="delivery-choice"><label><span>Unread-message fallback</span><select value={fallback} onChange={(event) => setFallback(event.target.value)}><option value="none">In-app delivery only</option><option value="5">SMS after 5 minutes</option><option value="15">SMS after 15 minutes</option><option value="30">SMS after 30 minutes</option><option value="60">SMS after 1 hour</option></select></label><p>SMS is queued only for unread recipients after the selected delay. The provider-confirmed price will appear only after Hubtel is configured.</p></section>

    <aside className="resolution-summary" aria-live="polite"><div><strong>{recipients.length}</strong><span>resolved {recipients.length === 1 ? "recipient" : "recipients"}</span></div><p>{audienceLabel || "No audience selected yet."}</p>{fallback !== "none" && <span>{smsCapable} SMS-capable · up to {maximumSmsSegments} segments · {missingPhone} without phone numbers</span>}</aside>
    {error && <p className="inline-error" role="alert"><CircleAlert size={16}/>{error}</p>}
    <footer><button type="button" className="secondary" onClick={onCancel}>Cancel</button><button type="button" className="primary-action" onClick={review}><Check size={16}/> Review announcement</button></footer>
  </section>;
}
