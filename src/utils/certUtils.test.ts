import { describe, it, expect } from "vitest";
import {
  extractSANs,
  extractURISANs,
  parseSpiffeId,
  hasCodeSigningEKU,
  extractSignerIdentity,
  extractCN,
  extractFingerprint,
} from "./certUtils";

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

describe("extractURISANs", () => {
  it("extracts URI SANs from PrettyPrint", () => {
    const text = `
            Identifier: Subject Alternative Name - Extension
                URIName: spiffe://test.example.com/workload/web-server
                URIName: spiffe://test.example.com/workload/api
            Identifier: Authority Key Identifier - Extension
`;
    const uris = extractURISANs(text);
    expect(uris).toEqual([
      "spiffe://test.example.com/workload/web-server",
      "spiffe://test.example.com/workload/api",
    ]);
  });

  it("returns empty array when no URI SANs exist", () => {
    const text = `
            Identifier: Subject Alternative Name - Extension
                DNSName: server.example.com
            Identifier: Authority Key Identifier - Extension
`;
    expect(extractURISANs(text)).toEqual([]);
  });

  it("returns empty for empty string", () => {
    expect(extractURISANs("")).toEqual([]);
  });

  it("stops at next Identifier section", () => {
    const text = `
            Identifier: Subject Alternative Name - Extension
                URIName: spiffe://domain/path
            Identifier: Key Usage - Extension
                URIName: not-a-san
`;
    expect(extractURISANs(text)).toEqual(["spiffe://domain/path"]);
  });
});

describe("parseSpiffeId", () => {
  it("parses a valid SPIFFE ID", () => {
    const result = parseSpiffeId(
      "spiffe://test.example.com/workload/web-server",
    );
    expect(result).toEqual({
      raw: "spiffe://test.example.com/workload/web-server",
      trustDomain: "test.example.com",
      workloadPath: "/workload/web-server",
    });
  });

  it("handles SPIFFE ID with no path", () => {
    const result = parseSpiffeId("spiffe://trust.domain");
    expect(result).toEqual({
      raw: "spiffe://trust.domain",
      trustDomain: "trust.domain",
      workloadPath: "/",
    });
  });

  it("returns null for non-SPIFFE URIs", () => {
    expect(parseSpiffeId("https://example.com")).toBeNull();
    expect(parseSpiffeId("")).toBeNull();
    expect(parseSpiffeId("spiffe://")).toBeNull();
  });

  it("handles deep workload paths", () => {
    const result = parseSpiffeId("spiffe://domain/ns/prod/sa/api-server");
    expect(result?.workloadPath).toBe("/ns/prod/sa/api-server");
  });
});

describe("hasCodeSigningEKU", () => {
  it("returns true when code signing OID is present", () => {
    const text = `
            Identifier: Extended Key Usage - Extension
                1.3.6.1.5.5.7.3.3 - Code Signing
            Identifier: Authority Key Identifier - Extension
`;
    expect(hasCodeSigningEKU(text)).toBe(true);
  });

  it("returns false when code signing OID is absent", () => {
    const text = `
            Identifier: Extended Key Usage - Extension
                1.3.6.1.5.5.7.3.1 - Server Authentication
`;
    expect(hasCodeSigningEKU(text)).toBe(false);
  });
});

describe("extractSignerIdentity", () => {
  it("extracts email from SAN RFC822Name", () => {
    const text = `
            Identifier: Subject Alternative Name - Extension
                RFC822Name: dev@company.com
            Identifier: Key Usage - Extension
`;
    expect(extractSignerIdentity(text)).toBe("dev@company.com");
  });

  it("returns null when no RFC822Name exists", () => {
    const text = `
            Identifier: Subject Alternative Name - Extension
                DNSName: server.example.com
            Identifier: Key Usage - Extension
`;
    expect(extractSignerIdentity(text)).toBeNull();
  });

  it("returns null when no SAN section exists", () => {
    expect(extractSignerIdentity("Version: v3\nSerial: 0x1")).toBeNull();
  });
});

describe("extractCN", () => {
  it("extracts CN from a full DN", () => {
    expect(extractCN("CN=Certificate Authority,OU=pki,O=example.com")).toBe(
      "Certificate Authority",
    );
  });

  it("returns full string when no CN found", () => {
    expect(extractCN("OU=pki,O=example.com")).toBe("OU=pki,O=example.com");
  });
});

describe("extractFingerprint", () => {
  it("extracts SHA-256 fingerprint from PrettyPrint", () => {
    const text = `
            Fingerprint (SHA-256):
                AB:CD:12:34:EF:56:78:90:AB:CD:12:34:EF:56:78:90:
                AB:CD:12:34:EF:56:78:90:AB:CD:12:34:EF:56:78:90
`;
    expect(extractFingerprint(text)).toBe(
      "abcd1234ef567890abcd1234ef567890abcd1234ef567890abcd1234ef567890",
    );
  });

  it("handles single-line fingerprint", () => {
    const text =
      "Fingerprint (SHA256): AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99";
    expect(extractFingerprint(text)).toBe(
      "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899",
    );
  });

  it("returns null when no fingerprint found", () => {
    expect(extractFingerprint("Version: v3\nSerial: 0x1")).toBeNull();
  });
});
