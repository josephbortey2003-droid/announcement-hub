// Server-side recipient resolution for a published announcement.
//
// Kept free of database calls so the rules can be unit-tested:
// - only active members can receive an announcement;
// - whole-organization, group and individual audiences are combined;
// - exclusions are applied last, so they always win.

export type RecipientInput = {
  wholeOrganization: boolean;
  activeMembershipIds: Iterable<string>;
  individualMembershipIds: Iterable<string>;
  groupMembershipIds: Iterable<string>;
  excludedMembershipIds: Iterable<string>;
};

export function resolveRecipientIds(input: RecipientInput): Set<string> {
  const active = new Set(input.activeMembershipIds);
  const recipients = new Set<string>();
  if (input.wholeOrganization) active.forEach((id) => recipients.add(id));
  for (const id of input.individualMembershipIds) if (active.has(id)) recipients.add(id);
  for (const id of input.groupMembershipIds) if (active.has(id)) recipients.add(id);
  for (const id of input.excludedMembershipIds) recipients.delete(id);
  return recipients;
}

/** Ids from `selected` that are not in `allowed`, e.g. people outside the organization or an authority's scope. */
export function idsOutside(selected: Iterable<string>, allowed: Iterable<string>): string[] {
  const permitted = new Set(allowed);
  return [...new Set(selected)].filter((id) => !permitted.has(id));
}
