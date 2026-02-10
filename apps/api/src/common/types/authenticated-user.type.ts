import type { RoleKey } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  email: string;
  activeTenantId: string;
  activeMembershipId: string;
  activeRole: RoleKey;
  isPlatformAdmin: boolean;
}
