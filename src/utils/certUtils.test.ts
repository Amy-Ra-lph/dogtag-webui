import { describe, it, expect } from "vitest";
import { extractSANs } from "./certUtils";

const SAMPLE_PRETTY_PRINT = `
        Identifier: Certificate Authority - Data
            Version: v3
            Serial Number: 0x1
            Subject: CN=Certificate Authority,OU=pki-tomcat,O=test.example.com
            Issuer: CN=Certificate Authority,OU=pki-tomcat,O=test.example.com
            Identifier: Subject Alternative Name - Extension
                DNSName: server1.example.com
                DNSName: server2.example.com
                IPAddress: 192.168.1.100
            Identifier: Authority Key Identifier - Extension
`;

describe("extractSANs", () => {
  it("extracts DNS names from PrettyPrint", () => {
    const sans = extractSANs(SAMPLE_PRETTY_PRINT);
    expect(sans).toContain("server1.example.com");
    expect(sans).toContain("server2.example.com");
  });

  it("extracts IP addresses", () => {
    const sans = extractSANs(SAMPLE_PRETTY_PRINT);
    expect(sans).toContain("192.168.1.100");
  });

  it("returns all SANs in order", () => {
    const sans = extractSANs(SAMPLE_PRETTY_PRINT);
    expect(sans).toEqual([
      "server1.example.com",
      "server2.example.com",
      "192.168.1.100",
    ]);
  });

  it("extracts RFC822 (email) names", () => {
    const text = `
            Identifier: Subject Alternative Name - Extension
                RFC822Name: admin@example.com
                DNSName: mail.example.com
            Identifier: Key Usage - Extension
`;
    const sans = extractSANs(text);
    expect(sans).toEqual(["admin@example.com", "mail.example.com"]);
  });

  it("returns empty array when no SAN extension exists", () => {
    const text = `
        Identifier: Certificate Authority - Data
            Version: v3
            Serial Number: 0xF
            Subject: CN=Test Cert
`;
    expect(extractSANs(text)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(extractSANs("")).toEqual([]);
  });

  it("stops parsing at the next Identifier section", () => {
    const text = `
            Identifier: Subject Alternative Name - Extension
                DNSName: san1.example.com
            Identifier: Key Usage - Extension
                DNSName: not-a-san.example.com
`;
    const sans = extractSANs(text);
    expect(sans).toEqual(["san1.example.com"]);
  });

  it("handles single SAN entry", () => {
    const text = `
            Identifier: Subject Alternative Name - Extension
                DNSName: only-one.example.com
            Identifier: Authority Key Identifier - Extension
`;
    expect(extractSANs(text)).toEqual(["only-one.example.com"]);
  });

  it("handles mixed SAN types", () => {
    const text = `
            Identifier: Subject Alternative Name - Extension
                DNSName: web.example.com
                IPAddress: 10.0.0.1
                RFC822Name: user@example.com
                DNSName: api.example.com
                IPAddress: 10.0.0.2
            Identifier: Basic Constraints - Extension
`;
    const sans = extractSANs(text);
    expect(sans).toEqual([
      "web.example.com",
      "10.0.0.1",
      "user@example.com",
      "api.example.com",
      "10.0.0.2",
    ]);
  });
});
