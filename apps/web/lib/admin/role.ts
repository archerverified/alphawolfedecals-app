// Pure admin role check (ADR-0005). No DB, no session — unit-tested directly.
//
// "Admin" = the users.is_admin flag AND an active account. A locked/deleted
// account never counts as admin even if the flag is set.

export type RoleCheckUser = {
  isAdmin: boolean;
  status: string;
};

export function isAdminUser(user: RoleCheckUser | null | undefined): boolean {
  return !!user && user.isAdmin === true && user.status === 'active';
}
