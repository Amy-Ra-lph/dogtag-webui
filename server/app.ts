import Fastify from "fastify";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import httpProxy from "@fastify/http-proxy";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isRateLimited,
  recordAttempt,
} from "./authMiddleware.js";
import {
  createSession,
  getSession,
  deleteSession,
} from "./sessionStore.js";
import {
  loginToDogtag,
  loginToDogtagWithCert,
  logoutFromDogtag,
} from "./dogtagAuth.js";
import { caProxyHandler } from "./caProxy.js";
import { createLdapBackend } from "./ldapBackend.js";
import type { AuthBackend } from "./authMiddleware.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SESSION_COOKIE = "webui_session";
const SESSION_MAX_AGE_SEC = 2 * 60 * 60;
const REKOR_URL = process.env.REKOR_URL || "";
const BACKEND_PORT = parseInt(process.env.BACKEND_PORT || "3000", 10);

function buildAuthBackend(): AuthBackend | undefined {
  const ldapUrl = process.env.LDAP_URL;
  if (!ldapUrl) return undefined;

  return createLdapBackend({
    url: ldapUrl,
    baseDn: process.env.LDAP_BASE_DN || "o=pki-tomcat-CA",
    bindDn: process.env.LDAP_BIND_DN,
    bindPassword: process.env.LDAP_BIND_PASSWORD,
    userSearchBase: process.env.LDAP_USER_SEARCH_BASE,
    groupSearchBase: process.env.LDAP_GROUP_SEARCH_BASE,
    tlsRejectUnauthorized: process.env.LDAP_TLS_REJECT_UNAUTHORIZED !== "false",
    tlsCaCertPath: process.env.LDAP_TLS_CA_CERT,
    startTls: process.env.LDAP_STARTTLS === "true",
  });
}

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
    },
  });

  await app.register(cookie);

  const ldapBackend = buildAuthBackend();
  const useLdapFallback = !!ldapBackend;

  function getClientIp(request: { ip: string; headers: Record<string, unknown> }): string {
    const xff = request.headers["x-forwarded-for"];
    if (typeof xff === "string") return xff.split(",")[0].trim();
    return request.ip;
  }

  function setCookie(
    reply: { header: (name: string, value: string) => void },
    name: string,
    value: string,
    maxAge: number,
  ) {
    const securePart = process.env.NODE_ENV === "production" ? " Secure;" : "";
    reply.header(
      "Set-Cookie",
      `${name}=${value}; HttpOnly;${securePart} Path=/; SameSite=Strict; Max-Age=${maxAge}`,
    );
  }

  // ---------------------------------------------------------------
  // Health check
  // ---------------------------------------------------------------
  app.get("/healthz", async () => ({ status: "ok" }));

  // ---------------------------------------------------------------
  // Auth: password login
  // ---------------------------------------------------------------
  app.post<{ Body: { username: string; password: string } }>(
    "/webui/api/auth/login",
    async (request, reply) => {
      const clientIp = getClientIp(request);
      if (isRateLimited(clientIp)) {
        return reply
          .status(429)
          .send({ error: "Too many login attempts. Try again later." });
      }

      const { username, password } = request.body || {};
      if (!username || !password) {
        return reply.status(400).send({ error: "Username and password required" });
      }

      // Try Dogtag basic auth first
      const dogtagResult = await loginToDogtag(username, password);

      let roles: string[] = [];
      let fullName = username;
      let email = "";

      if (dogtagResult) {
        roles = dogtagResult.account.Roles || [];
        fullName = dogtagResult.account.FullName || username;
        email = dogtagResult.account.Email || "";
      } else if (useLdapFallback && ldapBackend) {
        // Fall back to LDAP-only validation (Dogtag may not support basic auth)
        const ldapUser = await ldapBackend.validate(username, password);
        if (!ldapUser) {
          recordAttempt(clientIp, false);
          return reply.status(401).send({ error: "Invalid username or password" });
        }
        roles = ldapUser.roles;
        fullName = ldapUser.fullName;
        email = ldapUser.email;
      } else {
        recordAttempt(clientIp, false);
        return reply.status(401).send({ error: "Invalid username or password" });
      }

      recordAttempt(clientIp, true);

      // Map Dogtag role names to our internal roles
      const mappedRoles = mapDogtagRoles(roles);

      const session = createSession(
        { username, fullName, email, roles: mappedRoles },
        "password",
        dogtagResult?.cookies || null,
        null,
      );

      setCookie(reply, SESSION_COOKIE, session.id, SESSION_MAX_AGE_SEC);

      return reply.send({
        username,
        fullName,
        email,
        roles: mappedRoles,
      });
    },
  );

  // ---------------------------------------------------------------
  // Auth: client certificate login
  // ---------------------------------------------------------------
  app.post("/webui/api/auth/cert-login", async (request, reply) => {
    const certPem = request.headers["x-ssl-client-cert"] as string | undefined;
    const verifyStatus = request.headers["x-ssl-client-verify"] as string | undefined;

    if (!certPem || verifyStatus === "NONE") {
      return reply.status(401).send({ error: "No client certificate presented" });
    }

    const decodedPem = decodeURIComponent(certPem);

    const dogtagResult = await loginToDogtagWithCert(decodedPem);
    if (!dogtagResult) {
      return reply.status(401).send({ error: "Certificate authentication failed" });
    }

    const mappedRoles = mapDogtagRoles(dogtagResult.account.Roles || []);

    const session = createSession(
      {
        username: dogtagResult.account.id,
        fullName: dogtagResult.account.FullName || dogtagResult.account.id,
        email: dogtagResult.account.Email || "",
        roles: mappedRoles,
      },
      "certificate",
      dogtagResult.cookies,
      decodedPem,
    );

    setCookie(reply, SESSION_COOKIE, session.id, SESSION_MAX_AGE_SEC);

    return reply.send({
      username: session.username,
      fullName: session.fullName,
      email: session.email,
      roles: session.roles,
    });
  });

  // ---------------------------------------------------------------
  // Auth: certificate info probe
  // ---------------------------------------------------------------
  app.get("/webui/api/auth/cert-info", async (request, reply) => {
    const certPem = request.headers["x-ssl-client-cert"] as string | undefined;
    const verifyStatus = request.headers["x-ssl-client-verify"] as string | undefined;
    const subjectDn = request.headers["x-ssl-client-s-dn"] as string | undefined;

    if (!certPem || verifyStatus === "NONE") {
      return reply.send({ hasCert: false });
    }

    return reply.send({
      hasCert: true,
      subjectDN: subjectDn || null,
      verified: verifyStatus === "SUCCESS",
    });
  });

  // ---------------------------------------------------------------
  // Auth: session check
  // ---------------------------------------------------------------
  app.get("/webui/api/auth/me", async (request, reply) => {
    const sessionId = request.cookies?.[SESSION_COOKIE];
    if (!sessionId) {
      return reply.status(401).send({ error: "Not authenticated" });
    }

    const session = getSession(sessionId);
    if (!session) {
      return reply.status(401).send({ error: "Session expired" });
    }

    return reply.send({
      username: session.username,
      fullName: session.fullName,
      email: session.email,
      roles: session.roles,
    });
  });

  // ---------------------------------------------------------------
  // Auth: logout
  // ---------------------------------------------------------------
  app.post("/webui/api/auth/logout", async (request, reply) => {
    const sessionId = request.cookies?.[SESSION_COOKIE];
    if (sessionId) {
      const session = getSession(sessionId);
      if (session?.dogtagCookies) {
        await logoutFromDogtag(session.dogtagCookies);
      }
      deleteSession(sessionId);
    }

    setCookie(reply, SESSION_COOKIE, "", 0);
    return reply.send({ ok: true });
  });

  // ---------------------------------------------------------------
  // CA REST API proxy (per-user session relay)
  // ---------------------------------------------------------------
  app.all("/ca/rest/*", async (request, reply) => {
    return caProxyHandler(request, reply);
  });

  // ---------------------------------------------------------------
  // Rekor proxy (passthrough, no auth)
  // ---------------------------------------------------------------
  if (REKOR_URL) {
    await app.register(httpProxy, {
      upstream: REKOR_URL,
      prefix: "/rekor/api/v1",
      rewritePrefix: "/api/v1",
      httpMethods: ["GET", "POST"],
    });
  }

  // ---------------------------------------------------------------
  // SPA static files (must be last)
  // ---------------------------------------------------------------
  const distDir = path.resolve(__dirname, "../dist");
  await app.register(fastifyStatic, {
    root: distDir,
    prefix: "/",
    wildcard: false,
  });

  // SPA fallback: serve index.html for client-side routes
  app.setNotFoundHandler(async (_request, reply) => {
    return reply.sendFile("index.html");
  });

  return { app, port: BACKEND_PORT };
}

const DOGTAG_ROLE_MAP: Record<string, string> = {
  Administrators: "administrator",
  "Certificate Manager Agents": "agent",
  Auditors: "auditor",
  "Enterprise CA Administrators": "administrator",
  "Enterprise KRA Administrators": "administrator",
  "Enterprise OCSP Administrators": "administrator",
  "Enterprise TKS Administrators": "administrator",
  "Enterprise TPS Administrators": "administrator",
  // Pass through already-mapped roles (from LDAP backend)
  administrator: "administrator",
  agent: "agent",
  auditor: "auditor",
};

function mapDogtagRoles(rawRoles: string[]): string[] {
  const mapped = new Set<string>();
  for (const role of rawRoles) {
    const m = DOGTAG_ROLE_MAP[role];
    if (m) mapped.add(m);
  }
  return [...mapped];
}
