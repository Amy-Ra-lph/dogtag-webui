import type { SpiffeId } from "src/types/spire";

export function extractSANs(prettyPrint: string): string[] {
  const sans: string[] = [];
  const lines = prettyPrint.split("\n");
  let inSAN = false;
  for (const line of lines) {
    if (line.includes("Subject Alternative Name")) {
      inSAN = true;
      continue;
    }
    if (inSAN) {
      const dns = line.match(/DNSName:\s*(.+)/);
      if (dns) sans.push(dns[1].trim());
      const ip = line.match(/IPAddress:\s*(.+)/);
      if (ip) sans.push(ip[1].trim());
      const email = line.match(/RFC822Name:\s*(.+)/);
      if (email) sans.push(email[1].trim());
      if (
        line.includes("Identifier:") &&
        !line.includes("Subject Alternative")
      ) {
        inSAN = false;
      }
    }
  }
  return sans;
}

export function extractURISANs(prettyPrint: string): string[] {
  const uris: string[] = [];
  const lines = prettyPrint.split("\n");
  let inSAN = false;
  for (const line of lines) {
    if (line.includes("Subject Alternative Name")) {
      inSAN = true;
      continue;
    }
    if (inSAN) {
      const uri = line.match(/URIName:\s*(.+)/);
      if (uri) uris.push(uri[1].trim());
      if (
        line.includes("Identifier:") &&
        !line.includes("Subject Alternative")
      ) {
        inSAN = false;
      }
    }
  }
  return uris;
}

export function parseSpiffeId(uri: string): SpiffeId | null {
  const match = uri.match(/^spiffe:\/\/([^/]+)(\/.*)?$/);
  if (!match) return null;
  return {
    raw: uri,
    trustDomain: match[1],
    workloadPath: match[2] ?? "/",
  };
}

export function hasCodeSigningEKU(prettyPrint: string): boolean {
  return prettyPrint.includes("1.3.6.1.5.5.7.3.3");
}

export function extractSignerIdentity(prettyPrint: string): string | null {
  const lines = prettyPrint.split("\n");
  let inSAN = false;
  for (const line of lines) {
    if (line.includes("Subject Alternative Name")) {
      inSAN = true;
      continue;
    }
    if (inSAN) {
      const email = line.match(/RFC822Name:\s*(.+)/);
      if (email) return email[1].trim();
      if (
        line.includes("Identifier:") &&
        !line.includes("Subject Alternative")
      ) {
        break;
      }
    }
  }
  return null;
}

export function extractCN(dn: string): string {
  const match = dn.match(/CN=([^,]+)/);
  return match ? match[1] : dn;
}

export function extractFingerprint(prettyPrint: string): string | null {
  const match = prettyPrint.match(
    /Fingerprint\s*\(SHA-?256\):\s*([\s0-9A-Fa-f:]+)/,
  );
  if (!match) return null;
  return match[1].replace(/[:\s]/g, "").toLowerCase();
}
