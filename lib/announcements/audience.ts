export type AudienceMember = {
  id: string;
  group: string;
};

export type AudienceGroupRef = {
  id: string;
  name: string;
};

export function resolvePreviewAudience<T extends AudienceMember>(input: {
  people: T[];
  groups: AudienceGroupRef[];
  wholeOrganization: boolean;
  groupIds: string[];
  membershipIds: string[];
  excludedMembershipIds: string[];
}) {
  const ids = new Set<string>();
  if (input.wholeOrganization) input.people.forEach((person) => ids.add(person.id));
  input.membershipIds.forEach((id) => ids.add(id));
  const groupNames = new Set(
    input.groups.filter((group) => input.groupIds.includes(group.id)).map((group) => group.name)
  );
  input.people.forEach((person) => {
    if (groupNames.has(person.group)) ids.add(person.id);
  });
  input.excludedMembershipIds.forEach((id) => ids.delete(id));
  return input.people.filter((person) => ids.has(person.id));
}
