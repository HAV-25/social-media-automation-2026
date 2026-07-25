import type { OrganizationRole } from "@content-engine/contracts";

export function canManageBrand(role: OrganizationRole) {
  return role === "administrator" || role === "editor";
}

export function canManageOrganization(role: OrganizationRole) {
  return role === "administrator";
}

export function canReviewContent(role: OrganizationRole) {
  return role === "administrator" || role === "editor" || role === "reviewer";
}
