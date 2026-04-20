export const ROLE_ADMIN = "administrator";
export const ROLE_AGENT = "agent";
export const ROLE_AUDITOR = "auditor";

export interface AuthUser {
  username: string;
  fullName: string;
  email: string;
  roles: string[];
}

export function hasRole(user: AuthUser | null, role: string): boolean {
  return user?.roles.includes(role) ?? false;
}

export function hasAnyRole(user: AuthUser | null, roles: string[]): boolean {
  return roles.some((r) => hasRole(user, r));
}
