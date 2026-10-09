// Converts a signed-in organization membership into the workspace's brand and viewer.

import type { OrganizationAccess } from "@/lib/supabase/browser-auth";
import type { BrandData, Viewer } from "@/lib/workspace/model";

export function brandFromAccess(access: OrganizationAccess): BrandData {
  return {
    organizationId: access.organizationId,
    name: access.name,
    code: access.code,
    color: access.primaryColor,
    secondaryColor: access.secondaryColor,
    logo: access.logo,
  };
}

export function viewerFromAccess(access: OrganizationAccess): Viewer {
  return { name: access.viewerName, signedIn: true };
}
