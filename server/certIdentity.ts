import { X509Certificate } from "node:crypto";

export interface CertIdentity {
  uid: string;
  cn: string;
  email: string;
  issuerDN: string;
  subjectDN: string;
}

export function parseCertIdentity(certPem: string): CertIdentity | null {
  try {
    const cert = new X509Certificate(certPem);
    const subjectDN = cert.subject;
    const issuerDN = cert.issuer;

    const uid = extractField(subjectDN, "UID") || "";
    const cn = extractField(subjectDN, "CN") || "";
    const email =
      extractField(subjectDN, "emailAddress") ||
      extractEmailFromSAN(cert) ||
      "";

    if (!uid && !cn) return null;

    return {
      uid,
      cn,
      email,
      issuerDN,
      subjectDN,
    };
  } catch {
    return null;
  }
}

function extractField(dn: string, field: string): string | null {
  const re = new RegExp(`(?:^|\\n)${field}=([^\\n]+)`, "i");
  const match = dn.match(re);
  return match ? match[1].trim() : null;
}

function extractEmailFromSAN(cert: X509Certificate): string | null {
  const san = cert.subjectAltName;
  if (!san) return null;
  const emailMatch = san.match(/email:([^\s,]+)/i);
  return emailMatch ? emailMatch[1] : null;
}
