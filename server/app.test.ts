// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

// Mock dogtagAuth before importing app
vi.mock("./dogtagAuth.js", () => ({
  loginToDogtag: vi.fn(),
  loginToDogtagWithCert: vi.fn(),
  logoutFromDogtag: vi.fn(),
  checkDogtagSession: vi.fn(),
}));

vi.mock("./ldapBackend.js", () => ({
  createLdapBackend: vi.fn(),
}));

import { buildApp } from "./app";
import { loginToDogtag, logoutFromDogtag } from "./dogtagAuth";
import type { FastifyInstance } from "fastify";

const mockLoginToDogtag = vi.mocked(loginToDogtag);
const mockLogoutFromDogtag = vi.mocked(logoutFromDogtag);

let app: FastifyInstance;

beforeAll(async () => {
  const built = await buildApp();
  app = built.app;
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

describe("GET /healthz", () => {
  it("returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});

// ---------------------------------------------------------------------------
// Password login
// ---------------------------------------------------------------------------

describe("POST /webui/api/auth/login", () => {
  it("returns 400 for missing credentials", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webui/api/auth/login",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 401 for invalid credentials", async () => {
    mockLoginToDogtag.mockResolvedValue(null);
    const res = await app.inject({
      method: "POST",
      url: "/webui/api/auth/login",
      payload: { username: "bad", password: "bad" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns user info and sets cookie on success", async () => {
    mockLoginToDogtag.mockResolvedValue({
      cookies: "JSESSIONID=abc123",
      account: {
        id: "caadmin",
        FullName: "CA Admin",
        Email: "admin@example.com",
        Roles: ["Administrators", "Certificate Manager Agents"],
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/webui/api/auth/login",
      payload: { username: "caadmin", password: "Secret.123" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.username).toBe("caadmin");
    expect(body.roles).toContain("administrator");
    expect(body.roles).toContain("agent");

    const cookie = res.headers["set-cookie"] as string;
    expect(cookie).toContain("webui_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
  });

  it("maps Dogtag role names to internal roles", async () => {
    mockLoginToDogtag.mockResolvedValue({
      cookies: "JSESSIONID=xyz",
      account: {
        id: "auditor1",
        FullName: "Auditor One",
        Email: "auditor@example.com",
        Roles: ["Auditors"],
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/webui/api/auth/login",
      payload: { username: "auditor1", password: "pass" },
    });

    expect(res.json().roles).toEqual(["auditor"]);
  });
});

// ---------------------------------------------------------------------------
// Session check
// ---------------------------------------------------------------------------

describe("GET /webui/api/auth/me", () => {
  it("returns 401 without session cookie", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/webui/api/auth/me",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns user info with valid session", async () => {
    // Login first
    mockLoginToDogtag.mockResolvedValue({
      cookies: "JSESSIONID=me1",
      account: {
        id: "agent1",
        FullName: "Agent One",
        Email: "agent@example.com",
        Roles: ["Certificate Manager Agents"],
      },
    });

    const loginRes = await app.inject({
      method: "POST",
      url: "/webui/api/auth/login",
      payload: { username: "agent1", password: "pass" },
    });

    const cookie = (loginRes.headers["set-cookie"] as string).split(";")[0];

    const meRes = await app.inject({
      method: "GET",
      url: "/webui/api/auth/me",
      headers: { cookie },
    });

    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().username).toBe("agent1");
    expect(meRes.json().roles).toEqual(["agent"]);
  });
});

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

describe("POST /webui/api/auth/logout", () => {
  it("clears session and sends Clear-Site-Data", async () => {
    mockLoginToDogtag.mockResolvedValue({
      cookies: "JSESSIONID=logout1",
      account: {
        id: "user1",
        FullName: "User One",
        Email: "u1@example.com",
        Roles: ["Administrators"],
      },
    });

    const loginRes = await app.inject({
      method: "POST",
      url: "/webui/api/auth/login",
      payload: { username: "user1", password: "pass" },
    });

    const cookie = (loginRes.headers["set-cookie"] as string).split(";")[0];

    const logoutRes = await app.inject({
      method: "POST",
      url: "/webui/api/auth/logout",
      headers: { cookie },
    });

    expect(logoutRes.statusCode).toBe(200);
    expect(logoutRes.headers["clear-site-data"]).toBe('"cache", "cookies", "storage"');

    // Verify Dogtag logout was called
    expect(mockLogoutFromDogtag).toHaveBeenCalledWith("JSESSIONID=logout1");

    // Session should be invalid now
    const meRes = await app.inject({
      method: "GET",
      url: "/webui/api/auth/me",
      headers: { cookie },
    });
    expect(meRes.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Certificate info probe
// ---------------------------------------------------------------------------

describe("GET /webui/api/auth/cert-info", () => {
  it("returns hasCert false when no cert header", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/webui/api/auth/cert-info",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().hasCert).toBe(false);
  });

  it("returns cert info when headers present", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/webui/api/auth/cert-info",
      headers: {
        "x-ssl-client-cert": "PEM-DATA",
        "x-ssl-client-verify": "SUCCESS",
        "x-ssl-client-s-dn": "CN=testuser",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.hasCert).toBe(true);
    expect(body.subjectDN).toBe("CN=testuser");
    expect(body.verified).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CA proxy auth enforcement
// ---------------------------------------------------------------------------

describe("CA proxy auth", () => {
  it("returns 401 for unauthenticated CA requests", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/ca/rest/certs",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 for invalid session cookie", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/ca/rest/certs",
      headers: { cookie: "webui_session=invalid" },
    });
    expect(res.statusCode).toBe(401);
  });
});
