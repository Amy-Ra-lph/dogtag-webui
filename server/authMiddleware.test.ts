// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import {
  sign,
  verify,
  parseCookies,
  isRateLimited,
  recordAttempt,
  loginAttempts,
  checkRouteAccess,
  type SessionPayload,
} from "./authMiddleware";

// ---------------------------------------------------------------------------
// Session signing and verification
// ---------------------------------------------------------------------------

describe("sign / verify", () => {
  const payload: SessionPayload = {
    username: "testuser",
    fullName: "Test User",
    email: "test@example.com",
    roles: ["administrator"],
    exp: Date.now() + 60_000,
  };

  it("round-trips a valid payload", () => {
    const token = sign(payload);
    const result = verify(token);
    expect(result).not.toBeNull();
    expect(result!.username).toBe("testuser");
    expect(result!.roles).toEqual(["administrator"]);
  });

  it("rejects a tampered data segment", () => {
    const token = sign(payload);
    const [data, sig] = token.split(".");
    const tampered = data!.slice(0, -2) + "XX";
    expect(verify(`${tampered}.${sig}`)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = sign(payload);
    const [data] = token.split(".");
    expect(verify(`${data}.badsig`)).toBeNull();
  });

  it("rejects an expired token", () => {
    const expired = sign({ ...payload, exp: Date.now() - 1000 });
    expect(verify(expired)).toBeNull();
  });

  it("rejects tokens with wrong format", () => {
    expect(verify("")).toBeNull();
    expect(verify("onlyone")).toBeNull();
    expect(verify("a.b.c")).toBeNull();
  });

  it("preserves all payload fields", () => {
    const token = sign(payload);
    const result = verify(token);
    expect(result).toMatchObject({
      username: "testuser",
      fullName: "Test User",
      email: "test@example.com",
      roles: ["administrator"],
    });
  });

  it("handles multi-role payloads", () => {
    const multiRole = sign({
      ...payload,
      roles: ["administrator", "agent", "auditor"],
    });
    const result = verify(multiRole);
    expect(result!.roles).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Cookie parsing
// ---------------------------------------------------------------------------

describe("parseCookies", () => {
  it("parses a single cookie", () => {
    expect(parseCookies("name=value")).toEqual({ name: "value" });
  });

  it("parses multiple cookies", () => {
    expect(parseCookies("a=1; b=2; c=3")).toEqual({ a: "1", b: "2", c: "3" });
  });

  it("handles cookies with = in value", () => {
    expect(parseCookies("token=abc=def=ghi")).toEqual({
      token: "abc=def=ghi",
    });
  });

  it("trims whitespace", () => {
    expect(parseCookies("  a = 1 ;  b = 2 ")).toEqual({ a: "1", b: "2" });
  });

  it("returns empty object for undefined", () => {
    expect(parseCookies(undefined)).toEqual({});
  });

  it("returns empty object for empty string", () => {
    expect(parseCookies("")).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

describe("rate limiting", () => {
  beforeEach(() => {
    loginAttempts.clear();
  });

  it("allows first attempt from new IP", () => {
    expect(isRateLimited("10.0.0.1")).toBe(false);
  });

  it("allows up to 5 failed attempts", () => {
    for (let i = 0; i < 4; i++) {
      recordAttempt("10.0.0.2", false);
    }
    expect(isRateLimited("10.0.0.2")).toBe(false);
  });

  it("blocks after 5 failed attempts", () => {
    for (let i = 0; i < 5; i++) {
      recordAttempt("10.0.0.3", false);
    }
    expect(isRateLimited("10.0.0.3")).toBe(true);
  });

  it("resets on successful login", () => {
    for (let i = 0; i < 4; i++) {
      recordAttempt("10.0.0.4", false);
    }
    recordAttempt("10.0.0.4", true);
    expect(isRateLimited("10.0.0.4")).toBe(false);
  });

  it("tracks IPs independently", () => {
    for (let i = 0; i < 5; i++) {
      recordAttempt("10.0.0.5", false);
    }
    expect(isRateLimited("10.0.0.5")).toBe(true);
    expect(isRateLimited("10.0.0.6")).toBe(false);
  });

  it("allows attempts after window expires", () => {
    loginAttempts.set("10.0.0.7", { count: 5, resetAt: Date.now() - 1 });
    expect(isRateLimited("10.0.0.7")).toBe(false);
  });

  it("resets counter after window expires", () => {
    loginAttempts.set("10.0.0.8", { count: 5, resetAt: Date.now() - 1 });
    recordAttempt("10.0.0.8", false);
    expect(isRateLimited("10.0.0.8")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RBAC route access
// ---------------------------------------------------------------------------

describe("checkRouteAccess", () => {
  describe("administrator", () => {
    const roles = ["administrator"];

    it("allows agent routes", () => {
      expect(checkRouteAccess("/ca/rest/agent/certs", roles)).toBe(true);
    });

    it("allows admin routes", () => {
      expect(checkRouteAccess("/ca/rest/admin/users", roles)).toBe(true);
    });

    it("allows profile routes", () => {
      expect(checkRouteAccess("/ca/rest/profiles", roles)).toBe(true);
      expect(checkRouteAccess("/ca/rest/profiles/caUserCert", roles)).toBe(
        true,
      );
    });

    it("allows cert routes", () => {
      expect(checkRouteAccess("/ca/rest/certs", roles)).toBe(true);
    });

    it("allows audit routes", () => {
      expect(checkRouteAccess("/ca/rest/audit", roles)).toBe(true);
    });

    it("allows catch-all routes", () => {
      expect(checkRouteAccess("/ca/rest/something-new", roles)).toBe(true);
    });
  });

  describe("agent", () => {
    const roles = ["agent"];

    it("allows agent routes", () => {
      expect(checkRouteAccess("/ca/rest/agent/certs", roles)).toBe(true);
    });

    it("denies admin routes", () => {
      expect(checkRouteAccess("/ca/rest/admin/users", roles)).toBe(false);
    });

    it("allows profile routes", () => {
      expect(checkRouteAccess("/ca/rest/profiles", roles)).toBe(true);
      expect(checkRouteAccess("/ca/rest/profiles/caUserCert", roles)).toBe(
        true,
      );
    });

    it("allows cert routes", () => {
      expect(checkRouteAccess("/ca/rest/certs", roles)).toBe(true);
    });

    it("allows account routes", () => {
      expect(checkRouteAccess("/ca/rest/account/login", roles)).toBe(true);
    });

    it("denies audit routes", () => {
      expect(checkRouteAccess("/ca/rest/audit", roles)).toBe(false);
    });

    it("denies unknown routes (catch-all is admin-only)", () => {
      expect(checkRouteAccess("/ca/rest/something-new", roles)).toBe(false);
    });
  });

  describe("auditor", () => {
    const roles = ["auditor"];

    it("denies agent routes", () => {
      expect(checkRouteAccess("/ca/rest/agent/certs", roles)).toBe(false);
    });

    it("denies admin routes", () => {
      expect(checkRouteAccess("/ca/rest/admin/users", roles)).toBe(false);
    });

    it("allows cert routes (read-only)", () => {
      expect(checkRouteAccess("/ca/rest/certs", roles)).toBe(true);
    });

    it("allows audit routes", () => {
      expect(checkRouteAccess("/ca/rest/audit", roles)).toBe(true);
    });

    it("allows account routes", () => {
      expect(checkRouteAccess("/ca/rest/account/login", roles)).toBe(true);
    });

    it("denies profile routes", () => {
      expect(checkRouteAccess("/ca/rest/profiles", roles)).toBe(false);
    });

    it("allows authority routes", () => {
      expect(checkRouteAccess("/ca/rest/authorities", roles)).toBe(true);
    });
  });

  describe("no roles", () => {
    it("denies all routes", () => {
      expect(checkRouteAccess("/ca/rest/certs", [])).toBe(false);
      expect(checkRouteAccess("/ca/rest/agent/certs", [])).toBe(false);
      expect(checkRouteAccess("/ca/rest/admin/users", [])).toBe(false);
    });
  });

  describe("multi-role", () => {
    it("agent+auditor can access audit routes", () => {
      expect(checkRouteAccess("/ca/rest/audit", ["agent", "auditor"])).toBe(
        true,
      );
    });

    it("agent+auditor cannot access admin routes", () => {
      expect(
        checkRouteAccess("/ca/rest/admin/users", ["agent", "auditor"]),
      ).toBe(false);
    });
  });

  describe("route matching edge cases", () => {
    it("matches /ca/rest/certs with subpaths", () => {
      expect(checkRouteAccess("/ca/rest/certs/12345", ["auditor"])).toBe(true);
    });

    it("matches /ca/rest/profiles exactly (no trailing slash)", () => {
      expect(checkRouteAccess("/ca/rest/profiles", ["agent"])).toBe(true);
    });

    it("matches /ca/rest/profiles/ with subpath", () => {
      expect(checkRouteAccess("/ca/rest/profiles/caUserCert", ["agent"])).toBe(
        true,
      );
    });
  });
});
