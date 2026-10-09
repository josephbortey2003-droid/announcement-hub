"use client";

import { useMemo, useRef, useState } from "react";
import { Check, CircleAlert, Copy, Mail, MessageCircle, X } from "lucide-react";
import { useDialogFocus } from "@/components/workspace/use-dialog-focus";
import { emailLink, invitationLink, invitationMessage, whatsappLink, type CreatedInvitation } from "@/lib/supabase/invitations";
import { statusLabel, type Person } from "@/lib/workspace/model";

type InviteDialogProps = {
  people: Person[];
  organizationName: string;
  close: () => void;
  /** Creates invitations for the chosen directory entries and refreshes the directory. */
  createLinks: (directoryEntryIds: string[]) => Promise<CreatedInvitation[]>;
};

/** Owner dialog: choose people, create one-time invitation links, then copy or share each link. */
export function InviteDialog({ people, organizationName, close, createLinks }: InviteDialogProps) {
  const ref = useRef<HTMLElement>(null);
  useDialogFocus(ref, close);
  const invitable = useMemo(() => people.filter((person) => person.status === "staged" || person.status === "invited"), [people]);
  const [selected, setSelected] = useState<string[]>(() => invitable.filter((person) => person.status === "staged").map((person) => person.id));
  const [created, setCreated] = useState<CreatedInvitation[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const appUrl = typeof window === "undefined" ? "" : `${window.location.origin}${window.location.pathname}`;

  const toggle = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  const submit = async () => {
    if (busy) return;
    if (!selected.length) return setMessage("Choose at least one person to invite.");
    setBusy(true);
    setMessage("");
    try {
      setCreated(await createLinks(selected));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The invitations could not be created.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (invitation: CreatedInvitation) => {
    try {
      await navigator.clipboard.writeText(invitationLink(appUrl, invitation.token));
      setCopied(invitation.directoryEntryId);
    } catch {
      setMessage("Copying was blocked by the browser. Select the link and copy it manually.");
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={() => !busy && close()}>
      <section ref={ref} className="composer invite-dialog" role="dialog" aria-modal="true" aria-labelledby="invite-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><p>MEMBER ONBOARDING</p><h2 id="invite-title">{created ? "Share the invitation links" : "Invite people"}</h2></div>
          <button type="button" className="close-button" onClick={close} aria-label="Close dialog"><X size={20} /></button>
        </header>

        {!created && (
          <>
            <p className="modal-explainer">Each person gets a personal link that works once and expires in 7 days. If the person has an email address, they must sign in with that address. Inviting someone again replaces their previous link.</p>
            {invitable.length ? (
              <div className="people-selector">
                {invitable.map((person) => (
                  <label key={person.id} className={selected.includes(person.id) ? "selected" : ""}>
                    <input type="checkbox" checked={selected.includes(person.id)} onChange={() => toggle(person.id)} />
                    <span><strong>{person.name}</strong><small>{[person.email, person.phone].filter(Boolean).join(" · ")} · {person.status ? statusLabel[person.status] : ""}</small></span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="selection-empty">Everyone in the directory has already joined. Add people first, then invite them.</p>
            )}
          </>
        )}

        {created && (
          <>
            <p className="modal-explainer">These links are shown only now; the database stores just a fingerprint of each one. If you close this window before sharing, invite the person again to get a new link.</p>
            <ul className="invite-links">
              {created.map((invitation) => {
                const link = invitationLink(appUrl, invitation.token);
                const text = invitationMessage(organizationName, invitation.name, link);
                return (
                  <li key={invitation.directoryEntryId}>
                    <div>
                      <strong>{invitation.name}</strong>
                      <small>{[invitation.email, invitation.phone].filter(Boolean).join(" · ")} · expires {new Date(invitation.expiresAt).toLocaleDateString()}</small>
                      <input readOnly value={link} aria-label={`Invitation link for ${invitation.name}`} onFocus={(event) => event.target.select()} />
                    </div>
                    <div className="invite-actions">
                      <button type="button" className="secondary" onClick={() => copy(invitation)}>{copied === invitation.directoryEntryId ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy link</>}</button>
                      <a className="secondary" href={whatsappLink(invitation.phone, text)} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} /> WhatsApp</a>
                      {invitation.email && <a className="secondary" href={emailLink(invitation.email, organizationName, text)}><Mail size={15} /> Email</a>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {message && <p className="inline-error" role="alert"><CircleAlert size={16} />{message}</p>}
        <footer>
          {created ? (
            <button type="button" className="primary-action" onClick={close}>Done</button>
          ) : (
            <>
              <button type="button" className="secondary" disabled={busy} onClick={close}>Cancel</button>
              <button type="button" className="primary-action" disabled={busy || !invitable.length} onClick={submit}>{busy ? "Creating links…" : `Create ${selected.length} ${selected.length === 1 ? "link" : "links"}`}</button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
