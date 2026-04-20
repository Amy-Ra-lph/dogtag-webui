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
