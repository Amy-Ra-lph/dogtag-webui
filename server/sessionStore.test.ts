// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

// Reset module state between tests
let mod: typeof import("./sessionStore");

beforeEach(async () => {
  vi.resetModules();
  mod = await import("./sessionStore");
});

const testUser = {
  username: "testuser",
  fullName: "Test User",
  email: "test@example.com",
  roles: ["administrator"],
};

// ---------------------------------------------------------------------------
// Session creation
// ---------------------------------------------------------------------------

describe("createSession", () => {
  it("creates a session with a 64-char hex ID", () => {
    const session = mod.createSession(testUser, "password", null, null);
    expect(session.id).toMatch(/^[a-f0-9]{64}$/);
  });

  it("stores user info correctly", () => {
    const session = mod.createSession(testUser, "password", null, null);
    expect(session.username).toBe("testuser");
    expect(session.fullName).toBe("Test User");
    expect(session.email).toBe("test@example.com");
    expect(session.roles).toEqual(["administrator"]);
  });

  it("stores auth method", () => {
    const pwSession = mod.createSession(testUser, "password", null, null);
    expect(pwSession.authMethod).toBe("password");

    const certSession = mod.createSession(testUser, "certificate", null, "PEM");
    expect(certSession.authMethod).toBe("certificate");
  });

  it("stores Dogtag cookies", () => {
    const session = mod.createSession(testUser, "password", "JSESSIONID=abc", null);
    expect(session.dogtagCookies).toBe("JSESSIONID=abc");
  });

  it("stores client cert PEM", () => {
    const session = mod.createSession(testUser, "certificate", null, "-----BEGIN CERT-----");
    expect(session.clientCertPem).toBe("-----BEGIN CERT-----");
  });

  it("sets expiry ~30 minutes from now", () => {
    const before = Date.now();
    const session = mod.createSession(testUser, "password", null, null);
    const after = Date.now();
    const thirtyMin = 30 * 60 * 1000;
    expect(session.expiresAt).toBeGreaterThanOrEqual(before + thirtyMin);
    expect(session.expiresAt).toBeLessThanOrEqual(after + thirtyMin);
  });

  it("initializes lastRoleCheck to creation time", () => {
    const before = Date.now();
    const session = mod.createSession(testUser, "password", null, null);
    expect(session.lastRoleCheck).toBeGreaterThanOrEqual(before);
    expect(session.lastRoleCheck).toBeLessThanOrEqual(Date.now());
  });

  it("generates unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(mod.createSession(testUser, "password", null, null).id);
    }
    expect(ids.size).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Session retrieval
// ---------------------------------------------------------------------------

describe("getSession", () => {
  it("retrieves a valid session", () => {
    const created = mod.createSession(testUser, "password", null, null);
    const retrieved = mod.getSession(created.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.username).toBe("testuser");
  });

  it("returns null for unknown ID", () => {
    expect(mod.getSession("nonexistent")).toBeNull();
  });

  it("returns null for expired session", () => {
    const session = mod.createSession(testUser, "password", null, null);
    session.expiresAt = Date.now() - 1;
    expect(mod.getSession(session.id)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Session deletion
// ---------------------------------------------------------------------------

describe("deleteSession", () => {
  it("removes a session", () => {
    const session = mod.createSession(testUser, "password", null, null);
    mod.deleteSession(session.id);
    expect(mod.getSession(session.id)).toBeNull();
  });

  it("does not throw for unknown ID", () => {
    expect(() => mod.deleteSession("nonexistent")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Cookie and role updates
// ---------------------------------------------------------------------------

describe("updateDogtagCookies", () => {
  it("updates cookies on an existing session", () => {
    const session = mod.createSession(testUser, "password", "old=1", null);
    mod.updateDogtagCookies(session.id, "new=2");
    expect(mod.getSession(session.id)!.dogtagCookies).toBe("new=2");
  });

  it("does nothing for unknown session", () => {
    expect(() => mod.updateDogtagCookies("unknown", "c=1")).not.toThrow();
  });
});

describe("updateSessionRoles", () => {
  it("updates roles and lastRoleCheck", () => {
    const session = mod.createSession(testUser, "password", null, null);
    const before = Date.now();
    mod.updateSessionRoles(session.id, ["agent", "auditor"]);
    const updated = mod.getSession(session.id)!;
    expect(updated.roles).toEqual(["agent", "auditor"]);
    expect(updated.lastRoleCheck).toBeGreaterThanOrEqual(before);
  });

  it("does nothing for unknown session", () => {
    expect(() => mod.updateSessionRoles("unknown", ["agent"])).not.toThrow();
  });
});
