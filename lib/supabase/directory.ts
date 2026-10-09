// Organization directory: the owner's saved roster of people and groups.
//
// People are stored in `organization_directory` as "staged" until they accept an
// invitation and receive a membership. Imports go through the
// `import_directory_entries` database function, which checks that the caller is
// an owner, creates missing groups by name and runs as a single transaction, so
// an import either saves every row or none.
// Schema: supabase/migrations/20260925204035_add_organization_directory.sql
//         supabase/migrations/20260925204318_add_directory_import_function.sql

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Group, Person, PersonStatus } from "@/lib/workspace/model";

export type ImportSource = "individual" | "csv" | "paste";
export type DirectorySnapshot = { people: Person[]; groups: Group[] };

/** Matches the limit enforced by import_directory_entries. */
export const MAX_DIRECTORY_IMPORT = 500;

const GROUP_LABELS: Record<string, string> = {
  department: "Department",
  office: "Office",
  course: "Course",
  class: "Class",
  project: "Project",
};

export async function loadOrganizationDirectory(client: SupabaseClient, organizationId: string): Promise<DirectorySnapshot> {
  const [groupsResult, directoryResult, assignmentsResult] = await Promise.all([
    client.from("groups").select("id, name, group_type").eq("organization_id", organizationId).order("name"),
    client.from("organization_directory")
      .select("id, membership_id, full_name, email, phone_e164, onboarding_status")
      .eq("organization_id", organizationId)
      .order("created_at")
      .order("id"),
    client.from("directory_group_assignments").select("directory_entry_id, group_id").eq("organization_id", organizationId),
  ]);
  if (groupsResult.error || directoryResult.error || assignmentsResult.error) {
    throw new Error("The organization directory could not be loaded.");
  }

  const groups: Group[] = (groupsResult.data ?? []).map((group) => ({
    id: group.id,
    name: group.name,
    type: GROUP_LABELS[group.group_type] ?? group.group_type,
  }));
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  const groupsByEntry = new Map<string, string[]>();
  for (const assignment of assignmentsResult.data ?? []) {
    const name = groupNames.get(assignment.group_id);
    if (name) groupsByEntry.set(assignment.directory_entry_id, [...(groupsByEntry.get(assignment.directory_entry_id) ?? []), name]);
  }

  const people: Person[] = (directoryResult.data ?? []).map((entry) => ({
    id: entry.id,
    membershipId: entry.membership_id ?? undefined,
    name: entry.full_name,
    email: entry.email ?? "",
    phone: entry.phone_e164 ?? "",
    group: (groupsByEntry.get(entry.id) ?? []).join(", "),
    status: entry.onboarding_status as PersonStatus,
  }));
  return { people, groups };
}

export async function createOrganizationGroup(client: SupabaseClient, organizationId: string, input: { name: string; type: string }): Promise<Group> {
  const { data: userResult, error: userError } = await client.auth.getUser();
  if (userError || !userResult.user) throw new Error("Sign in again before creating a group.");
  const { data, error } = await client
    .from("groups")
    .insert({ organization_id: organizationId, name: input.name.trim(), group_type: input.type.toLowerCase(), created_by: userResult.user.id })
    .select("id, name, group_type")
    .single();
  if (error?.code === "23505") throw new Error("A group with that name already exists in this organization.");
  if (error || !data) throw new Error("The group could not be created.");
  return { id: data.id, name: data.name, type: GROUP_LABELS[data.group_type] ?? data.group_type };
}

/** Saves people (already validated by lib/people/import.ts) and returns the refreshed directory. */
export async function importOrganizationPeople(
  client: SupabaseClient,
  organizationId: string,
  source: ImportSource,
  people: Pick<Person, "name" | "email" | "phone" | "group">[],
): Promise<DirectorySnapshot> {
  if (!people.length) throw new Error("There is nobody to import.");
  if (people.length > MAX_DIRECTORY_IMPORT) throw new Error(`Import at most ${MAX_DIRECTORY_IMPORT} people at a time.`);
  const { error } = await client.rpc("import_directory_entries", {
    target_organization: organizationId,
    import_source: source,
    entries: people.map((person) => ({ fullName: person.name, email: person.email, phoneE164: person.phone, groupName: person.group })),
  });
  if (error?.code === "23505") throw new Error("Nothing was saved: someone in this import already has an email address or phone number in the directory.");
  if (error?.code === "42501") throw new Error("Only an organization owner can add people.");
  if (error) throw new Error("Nothing was saved: the people could not be added to the directory.");
  return loadOrganizationDirectory(client, organizationId);
}
