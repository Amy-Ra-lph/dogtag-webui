// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseCertIdentity } from "./certIdentity";

// Test fixture: Dogtag admin cert (CN=PKI Administrator, valid 2026-2028)
const ADMIN_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIID3zCCAsegAwIBAgIQMBcQz9fyMBoBcVjIy2IHmzANBgkqhkiG9w0BAQsFADA4
MRUwEwYDVQQKDAxUZXN0IEV4YW1wbGUxHzAdBgNVBAMMFkNBIFNpZ25pbmcgQ2Vy
dGlmaWNhdGUwHhcNMjYwNDIwMTI1MTE5WhcNMjgwNDA5MTI1MTE5WjCBgTElMCMG
A1UECgwcVGVzdCBFeGFtcGxlIFNlY3VyaXR5IERvbWFpbjETMBEGA1UECwwKcGtp
LXRvbWNhdDEnMCUGCSqGSIb3DQEJARYYY2FhZG1pbkB0ZXN0LmV4YW1wbGUuY29t
MRowGAYDVQQDDBFQS0kgQWRtaW5pc3RyYXRvcjCCASIwDQYJKoZIhvcNAQEBBQAD
ggEPADCCAQoCggEBAMV+SbILVOWAW5o/f1N6QOHFo/Y8bljIfhVhx9OQ88nQkLCC
4ZukqCCFd0hEmWETBY47M+KtVxtkdXNHhAmQsVTkHMg+hBqiEpfj8dj2wGBxuOSk
eAhVIk+3yLeI/jFtwlqiUfScDr+0T+JY3svycMciy6OKZFX6sZ10j3fhSQlkBxVa
4BcjXe6PIiigy8URmRkDqhcpyMVWUSUdb0migXGT/tKmwncHlr0uVhjn/j1C4f1i
Im8FV7Ti9AjYhhhivQBfyHYGvpD/x7N74J5SZtt45Wu9Ra7Y0Q7oUgXeFbBqvG7W
+8HSikNAnoZ+63px9YS4A1JviU3og9mB+qPdI6ECAwEAAaOBmjCBlzAfBgNVHSME
GDAWgBQCFPa46G+uSBb+Rl1RbBEA2NW4bzBFBggrBgEFBQcBAQQ5MDcwNQYIKwYB
BQUHMAGGKWh0dHA6Ly9wa2kxLnRlc3QuZXhhbXBsZS5jb206ODA4MC9jYS9vY3Nw
MA4GA1UdDwEB/wQEAwIF4DAdBgNVHSUEFjAUBggrBgEFBQcDAgYIKwYBBQUHAwQw
DQYJKoZIhvcNAQELBQADggEBAHyT3a1RTlA5OSsK7DBn8HXaPM9IrMbLMWcC67yA
HYseb7XMMFYMB4ZFFYnTyE7TAiHZStnRKrHIGT/7wQNd3lRTO2ZQNLBDuCVJ86wj
NNaqe+MUJ8t01AI9lpONjUBiNp4bNkebRE/yEaNFpJPx4Wsa8exCmw3cunXUfsRz
pMJa/FdAYS5dxw5Slj9CHl66pKjqKHBxKznzP568D7XCZqszhjDTDkYJyQLFkYyl
ZSFC+xHnErCB2JECr4/6f3TDKbIsXy7AGL51uUl6Eb54QHSHxCHkQEz/C1xU/XwQ
/7BSGmUV4pyYymhaTdAl9CAfDwhGclb/fXKsINghb3qJDAM=
-----END CERTIFICATE-----`;

function loadAdminCert(): string {
  return ADMIN_CERT_PEM;
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
