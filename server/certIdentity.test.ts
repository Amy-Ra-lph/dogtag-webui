// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseCertIdentity } from "./certIdentity";
import fs from "node:fs";
import path from "node:path";

const ADMIN_CERT_PATH = path.resolve(__dirname, "../certs/admin.cert");

function loadAdminCert(): string {
  return fs.readFileSync(ADMIN_CERT_PATH, "utf-8");
}

describe("parseCertIdentity", () => {
  it("returns null for empty string", () => {
    expect(parseCertIdentity("")).toBeNull();
  });

  it("returns null for garbage input", () => {
    expect(parseCertIdentity("not a cert")).toBeNull();
  });

  it("returns null for truncated PEM", () => {
    expect(
      parseCertIdentity(
        "-----BEGIN CERTIFICATE-----\ngarbage\n-----END CERTIFICATE-----",
      ),
    ).toBeNull();
  });

  it("parses CN from the admin cert", () => {
    const pem = loadAdminCert();
    const result = parseCertIdentity(pem);
    expect(result).not.toBeNull();
    expect(result!.cn).toBe("PKI Administrator");
  });

  it("extracts email from subject DN", () => {
    const pem = loadAdminCert();
    const result = parseCertIdentity(pem);
    expect(result).not.toBeNull();
    expect(result!.email).toBe("caadmin@test.example.com");
  });

  it("returns subjectDN and issuerDN", () => {
    const pem = loadAdminCert();
    const result = parseCertIdentity(pem);
    expect(result).not.toBeNull();
    expect(result!.subjectDN).toContain("PKI Administrator");
    expect(result!.issuerDN).toContain("CA Signing Certificate");
  });

  it("uses CN as fallback when UID is absent", () => {
    const pem = loadAdminCert();
    const result = parseCertIdentity(pem);
    expect(result).not.toBeNull();
    expect(result!.uid).toBe("");
    expect(result!.cn).toBeTruthy();
  });
});
