"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { CircleAlert, X } from "lucide-react";
import { isValidOrganizationCode, normalizeOrganizationCode } from "@/lib/organizations/code";
import { checkPerson, describeProblems, isSafeCell, parsePeopleImport } from "@/lib/people/import";
import { useDialogFocus } from "@/components/workspace/use-dialog-focus";
import type { ImportSource } from "@/lib/supabase/directory";
import type { Authority, BrandData, Group, Modal, Person } from "@/lib/workspace/model";

export type PeopleImport = { kind: "people"; source: ImportSource; people: Person[] };
export type ModalResult = PeopleImport | Group | Authority | BrandData;

type ActionModalProps = {
  type: Exclude<Modal, null | "invite">;
  close: () => void;
  commit: (value: ModalResult) => Promise<void>;
  /** People who may be given authority (in a saved organization, only accepted members). */
  people: Person[];
  groups: Group[];
  brand: BrandData;
};

const titles = { people: "Add people", authority: "Assign authority", group: "Add group", branding: "Customize appearance" };
const submitLabels = { people: "Add people", authority: "Assign authority", group: "Add group", branding: "Apply appearance" };

/** Focus-trapped dialog for adding people, groups and authority, and for editing organization appearance. */
export function ActionModal({ type, close, commit, people, groups, brand }: ActionModalProps) {
  const ref = useRef<HTMLElement>(null);
  const [method, setMethod] = useState("individual");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [group, setGroup] = useState("");
  const [raw, setRaw] = useState("");
  const [kind, setKind] = useState("Department");
  const [personId, setPersonId] = useState(people[0]?.id ?? "");
  const [level, setLevel] = useState("Department head");
  const [scope, setScope] = useState(groups[0]?.name ?? "");
  const [draft, setDraft] = useState(brand);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useDialogFocus(ref, close);

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv") || file.size > 1_048_576) return setMessage("Use a CSV file no larger than 1 MB.");
    setMessage("");
    setRaw(await file.text());
  };

  const chooseLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 1_048_576) return setMessage("Use a PNG or JPEG no larger than 1 MB.");
    const reader = new FileReader();
    reader.onload = () => setDraft((current) => ({ ...current, logo: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  /** Returns the value to commit, or an error message for the form. */
  const build = (): ModalResult | string => {
    if (type === "people") {
      if (method === "directory") return "Directory sync needs administrator consent and a secure backend; it cannot be simulated locally.";
      if (method === "individual") {
        const checked = checkPerson([name, email, phone, group]);
        return "problem" in checked ? `This person ${checked.problem}` : { kind: "people", source: "individual", people: [{ id: crypto.randomUUID(), ...checked.person }] };
      }
      if (!raw.trim()) return method === "csv" ? "Choose a CSV file to import." : "Add at least one comma-separated row.";
      const { people: imported, problems } = parsePeopleImport(raw);
      if (problems.length) return `Nothing was imported. ${describeProblems(problems)}`;
      if (!imported.length) return "The file has no people to import.";
      return { kind: "people", source: method === "csv" ? "csv" : "paste", people: imported.map((person) => ({ id: crypto.randomUUID(), ...person })) };
    }
    if (type === "group") {
      const trimmed = name.trim();
      if (trimmed.length < 2 || !isSafeCell(trimmed)) return "Enter a group name of at least two characters that does not start with =, +, - or @.";
      if (groups.some((existing) => existing.name.toLowerCase() === trimmed.toLowerCase())) return "A group with that name already exists.";
      return { id: crypto.randomUUID(), name: trimmed, type: kind };
    }
    if (type === "authority") {
      if (!personId || !scope) return "Choose a member and audience.";
      return { id: crypto.randomUUID(), personId, level, scope };
    }
    if (!draft.name.trim() || !isValidOrganizationCode(draft.code) || ![draft.color, draft.secondaryColor].every((value) => /^#[0-9a-f]{6}$/i.test(value))) {
      return "Enter a valid name, a 4 to 32 character organization code, and two colors.";
    }
    return { ...draft, name: draft.name.trim(), code: normalizeOrganizationCode(draft.code) };
  };

  const submit = async () => {
    if (submitting) return;
    const result = build();
    if (typeof result === "string") return setMessage(result);
    setSubmitting(true);
    try {
      await commit(result);
      close();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The input could not be processed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={() => !submitting && close()}>
      <section ref={ref} className="composer" role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><p>ORGANIZATION SETUP</p><h2 id="modal-title">{titles[type]}</h2></div>
          <button type="button" className="close-button" onClick={close} aria-label="Close dialog"><X size={20} /></button>
        </header>

        {type === "people" && (
          <>
            <div className="method-tabs" role="group" aria-label="How to add people">
              {[["individual", "One person"], ["csv", "CSV file"], ["paste", "Paste rows"], ["directory", "Directory"]].map(([id, label]) => (
                <button type="button" key={id} className={method === id ? "active" : ""} aria-pressed={method === id} onClick={() => { setMethod(id); setMessage(""); }}>{label}</button>
              ))}
            </div>
            {method === "individual" && (
              <div className="form-grid">
                <label><span>Full name *</span><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" /></label>
                <label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" /></label>
                <label><span>Phone</span><input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="off" /></label>
                <label>
                  <span>Group</span>
                  <input value={group} onChange={(event) => setGroup(event.target.value)} list="group-options" autoComplete="off" />
                  <datalist id="group-options">{groups.map((option) => <option key={option.id} value={option.name} />)}</datalist>
                </label>
              </div>
            )}
            {method === "csv" && (
              <label>
                <span>CSV file *</span>
                <input type="file" accept=".csv,text/csv" onChange={chooseFile} />
                <small>Maximum 1 MB. Columns: name, email, phone, group. A header row is optional.{raw && ` ${raw.split(/\r?\n/).filter(Boolean).length} lines loaded.`}</small>
              </label>
            )}
            {method === "paste" && (
              <label>
                <span>Comma-separated rows *</span>
                <textarea value={raw} onChange={(event) => setRaw(event.target.value)} placeholder="Full name, email, phone, group" />
                <small>Wrap names that contain commas in quotes, for example &quot;Mensah, Ama&quot;.</small>
              </label>
            )}
            {method === "directory" && <p className="modal-explainer">Google Workspace and Microsoft Entra connections require administrator consent, least-privilege permissions, secure server credentials, sync logs and deprovisioning.</p>}
          </>
        )}

        {type === "group" && (
          <div className="form-grid">
            <label><span>Group name *</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label>
              <span>Type</span>
              <select value={kind} onChange={(event) => setKind(event.target.value)}>
                <option>Department</option><option>Office</option><option>Course</option><option>Class</option><option>Project</option>
              </select>
            </label>
          </div>
        )}

        {type === "authority" && (
          <div className="form-grid">
            <label><span>Member</span><select value={personId} onChange={(event) => setPersonId(event.target.value)}>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
            <label>
              <span>Level</span>
              <select value={level} onChange={(event) => setLevel(event.target.value)}>
                <option>Executive</option><option>Department head</option><option>Manager</option><option>Lecturer</option>
              </select>
            </label>
            <label><span>Permitted audience</span><select value={scope} onChange={(event) => setScope(event.target.value)}>{groups.map((option) => <option key={option.id}>{option.name}</option>)}</select></label>
          </div>
        )}

        {type === "branding" && (
          <>
            <p className="modal-explainer">Your two colors are blended throughout the workspace. Saved changes apply to every member portal on desktop and mobile.</p>
            <div className="form-grid">
              <label><span>Organization name *</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
              <label>
                <span>Organization code *</span>
                <input value={draft.code} onChange={(event) => setDraft({ ...draft, code: normalizeOrganizationCode(event.target.value) })} />
                <small>Must be unique. Members use the updated code at their next sign-in.</small>
              </label>
              <label><span>Gradient start *</span><span className="color-field"><input type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /><output>{draft.color.toUpperCase()}</output></span></label>
              <label><span>Gradient end *</span><span className="color-field"><input type="color" value={draft.secondaryColor} onChange={(event) => setDraft({ ...draft, secondaryColor: event.target.value })} /><output>{draft.secondaryColor.toUpperCase()}</output></span></label>
              <div className="gradient-sample" style={{ background: `linear-gradient(125deg, ${draft.color}, ${draft.secondaryColor})` }} role="img" aria-label="Organization gradient preview"><span>Gradient preview</span></div>
              <label className="logo-field"><span>Circular logo</span><input type="file" accept="image/png,image/jpeg" onChange={chooseLogo} /><small>PNG or JPEG, maximum 1 MB. Square images crop best.</small></label>
            </div>
          </>
        )}

        {message && <p className="inline-error" role="alert"><CircleAlert size={16} />{message}</p>}
        <footer>
          <button type="button" className="secondary" disabled={submitting} onClick={close}>Cancel</button>
          <button type="button" className="primary-action" disabled={submitting} onClick={submit}>{submitting ? "Saving…" : submitLabels[type]}</button>
        </footer>
      </section>
    </div>
  );
}
