// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("caTlsConfig", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.CA_TLS_REJECT_UNAUTHORIZED;
    delete process.env.CA_BUNDLE;
    delete process.env.NODE_EXTRA_CA_CERTS;
  });

  it("defaults rejectUnauthorized to false", async () => {
    const { caTlsOptions } = await import("./caTlsConfig");
    expect(caTlsOptions.rejectUnauthorized).toBe(false);
  });

  it("enables rejectUnauthorized when CA_TLS_REJECT_UNAUTHORIZED=true", async () => {
    process.env.CA_TLS_REJECT_UNAUTHORIZED = "true";
    const { caTlsOptions } = await import("./caTlsConfig");
    expect(caTlsOptions.rejectUnauthorized).toBe(true);
  });

  it("keeps rejectUnauthorized false for other values", async () => {
    process.env.CA_TLS_REJECT_UNAUTHORIZED = "yes";
    const { caTlsOptions } = await import("./caTlsConfig");
    expect(caTlsOptions.rejectUnauthorized).toBe(false);
  });

  it("does not include ca when CA_BUNDLE is not set", async () => {
    const { caTlsOptions } = await import("./caTlsConfig");
    expect(caTlsOptions.ca).toBeUndefined();
  });

  describe("with CA_BUNDLE file", () => {
    let tmpFile: string;

    beforeEach(() => {
      tmpFile = path.join(os.tmpdir(), `ca-test-${Date.now()}.pem`);
      fs.writeFileSync(tmpFile, "-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----\n");
    });

    afterEach(() => {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    });

    it("reads CA bundle from file when CA_BUNDLE is set", async () => {
      process.env.CA_BUNDLE = tmpFile;
      const { caTlsOptions } = await import("./caTlsConfig");
      expect(caTlsOptions.ca).toBeDefined();
      expect(caTlsOptions.ca!.toString()).toContain("BEGIN CERTIFICATE");
    });
  });

  it("exits if CA_BUNDLE file cannot be read", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as never);

    process.env.CA_BUNDLE = "/nonexistent/path/to/ca.pem";
    await expect(import("./caTlsConfig")).rejects.toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});
