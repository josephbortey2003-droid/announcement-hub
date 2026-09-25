export function normalizeOrganizationCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

export function isValidOrganizationCode(value: string) {
  return /^[A-Z0-9][A-Z0-9-]{3,31}$/.test(normalizeOrganizationCode(value));
}
