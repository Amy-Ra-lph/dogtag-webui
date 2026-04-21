// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { auditLog } from "./auditLog";

describe("auditLog", () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it("writes a JSON line to stdout", () => {
    auditLog("login_success", "admin", "10.0.0.1");
    expect(writeSpy).toHaveBeenCalledOnce();
    const output = writeSpy.mock.calls[0]![0] as string;
    expect(output.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(output);
    expect(parsed.event).toBe("login_success");
    expect(parsed.username).toBe("admin");
    expect(parsed.ip).toBe("10.0.0.1");
    expect(parsed.audit).toBe(true);
  });

  it("includes ISO timestamp", () => {
    auditLog("logout", "user1", "10.0.0.2");
    const parsed = JSON.parse(writeSpy.mock.calls[0]![0] as string);
    expect(() => new Date(parsed.timestamp)).not.toThrow();
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("includes extra fields when provided", () => {
    auditLog("login_failure", "baduser", "10.0.0.3", {
      method: "password",
      backend: "ldap",
    });
    const parsed = JSON.parse(writeSpy.mock.calls[0]![0] as string);
    expect(parsed.method).toBe("password");
    expect(parsed.backend).toBe("ldap");
  });

  it("handles all event types", () => {
    const events = [
      "login_success",
      "login_failure",
      "cert_login_success",
      "cert_login_failure",
      "logout",
      "session_expired",
      "api_rate_limited",
    ] as const;

    for (const event of events) {
      writeSpy.mockClear();
      auditLog(event, "user", "127.0.0.1");
      const parsed = JSON.parse(writeSpy.mock.calls[0]![0] as string);
      expect(parsed.event).toBe(event);
    }
  });

  it("works without extra fields", () => {
    auditLog("logout", "user", "10.0.0.1");
    const parsed = JSON.parse(writeSpy.mock.calls[0]![0] as string);
    expect(Object.keys(parsed)).toEqual(
      expect.arrayContaining(["timestamp", "audit", "event", "username", "ip"]),
    );
  });
});
