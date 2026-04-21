import fs from "node:fs";
import https from "node:https";

const rejectUnauthorized = process.env.CA_TLS_REJECT_UNAUTHORIZED === "true";
const caBundlePath = process.env.CA_BUNDLE;

let ca: Buffer | undefined;
if (caBundlePath) {
  try {
    ca = fs.readFileSync(caBundlePath);
  } catch (err) {
    console.error(`Failed to read CA bundle from ${caBundlePath}:`, err);
    process.exit(1);
  }
}

if (rejectUnauthorized && !ca && !process.env.NODE_EXTRA_CA_CERTS) {
  console.warn(
    "CA_TLS_REJECT_UNAUTHORIZED=true but no CA_BUNDLE or NODE_EXTRA_CA_CERTS set — " +
      "connections to Dogtag will fail if it uses a self-signed certificate.",
  );
}

export const caTlsOptions: https.AgentOptions = {
  rejectUnauthorized,
  ...(ca ? { ca } : {}),
};
