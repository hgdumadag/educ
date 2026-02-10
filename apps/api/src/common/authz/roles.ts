import { RoleKey } from "@prisma/client";

export const TENANT_ADMIN_ROLES = [RoleKey.school_admin] as const;
export const CONTENT_MANAGER_ROLES = [RoleKey.teacher, RoleKey.parent, RoleKey.tutor] as const;
export const TENANT_OPERATOR_ROLES = [...TENANT_ADMIN_ROLES, ...CONTENT_MANAGER_ROLES] as const;

export function isTenantAdminRole(role: RoleKey): boolean {
  return role === RoleKey.school_admin;
}

export function isContentManagerRole(role: RoleKey): boolean {
  return role === RoleKey.teacher || role === RoleKey.parent || role === RoleKey.tutor;
}

export function canManageTenantWorkspace(role: RoleKey): boolean {
  return isTenantAdminRole(role) || isContentManagerRole(role);
}

export function canViewStudentData(role: RoleKey): boolean {
  return role === RoleKey.student || canManageTenantWorkspace(role);
}
