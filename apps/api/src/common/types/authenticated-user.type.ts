import type { RoleKey } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  role: RoleKey;
  email: string;
}
