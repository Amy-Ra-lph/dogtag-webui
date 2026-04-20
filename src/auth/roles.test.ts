import { describe, it, expect } from "vitest";
import {
  hasRole,
  hasAnyRole,
  ROLE_ADMIN,
  ROLE_AGENT,
  ROLE_AUDITOR,
  type AuthUser,
} from "./roles";

const admin: AuthUser = {
  username: "admin",
  fullName: "Admin",
  email: "admin@test.com",
  roles: [ROLE_ADMIN, ROLE_AGENT],
};

const agent: AuthUser = {
  username: "agent",
  fullName: "Agent",
  email: "agent@test.com",
  roles: [ROLE_AGENT],
};

const auditor: AuthUser = {
  username: "auditor",
  fullName: "Auditor",
  email: "auditor@test.com",
  roles: [ROLE_AUDITOR],
};

describe("hasRole", () => {
  it("returns true when user has the role", () => {
    expect(hasRole(admin, ROLE_ADMIN)).toBe(true);
    expect(hasRole(admin, ROLE_AGENT)).toBe(true);
    expect(hasRole(agent, ROLE_AGENT)).toBe(true);
    expect(hasRole(auditor, ROLE_AUDITOR)).toBe(true);
  });

  it("returns false when user lacks the role", () => {
    expect(hasRole(agent, ROLE_ADMIN)).toBe(false);
    expect(hasRole(auditor, ROLE_AGENT)).toBe(false);
    expect(hasRole(auditor, ROLE_ADMIN)).toBe(false);
  });

  it("returns false for null user", () => {
    expect(hasRole(null, ROLE_ADMIN)).toBe(false);
  });
});

describe("hasAnyRole", () => {
  it("returns true when user has at least one matching role", () => {
    expect(hasAnyRole(admin, [ROLE_ADMIN, ROLE_AUDITOR])).toBe(true);
    expect(hasAnyRole(auditor, [ROLE_AGENT, ROLE_AUDITOR])).toBe(true);
  });

  it("returns false when user has no matching roles", () => {
    expect(hasAnyRole(agent, [ROLE_ADMIN, ROLE_AUDITOR])).toBe(false);
  });

  it("returns false for null user", () => {
    expect(hasAnyRole(null, [ROLE_ADMIN])).toBe(false);
  });

  it("returns false for empty roles array", () => {
    expect(hasAnyRole(admin, [])).toBe(false);
  });
});
