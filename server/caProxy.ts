import https from "node:https";
import http from "node:http";
import { URL } from "node:url";
import type { FastifyRequest, FastifyReply } from "fastify";
import {
  getSession,
  deleteSession,
  updateDogtagCookies,
  updateSessionRoles,
} from "./sessionStore.js";
import { checkRouteAccess } from "./authMiddleware.js";
import { checkDogtagSession } from "./dogtagAuth.js";
import { caTlsOptions } from "./caTlsConfig.js";
import { auditLog } from "./auditLog.js";

const CA_TARGET_URL = process.env.CA_TARGET_URL || "https://localhost:8443";
const ROLE_RECHECK_MS = 5 * 60 * 1000;
const WRITE_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);
const API_RATE_LIMIT = 30;
const API_RATE_WINDOW_MS = 60 * 1000;

const apiRateCounters = new Map<string, { count: number; resetAt: number }>();

function isApiRateLimited(sessionId: string): boolean {
  const now = Date.now();
  const entry = apiRateCounters.get(sessionId);
  if (!entry || entry.resetAt < now) return false;
  return entry.count >= API_RATE_LIMIT;
}

function recordApiWrite(sessionId: string): void {
  const now = Date.now();
  const entry = apiRateCounters.get(sessionId);
  if (!entry || entry.resetAt < now) {
    apiRateCounters.set(sessionId, {
      count: 1,
      resetAt: now + API_RATE_WINDOW_MS,
    });
  } else {
    entry.count++;
  }
}

const apiRateSweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of apiRateCounters) {
    if (entry.resetAt < now) apiRateCounters.delete(id);
  }
}, API_RATE_WINDOW_MS);
apiRateSweepTimer.unref();

const DOGTAG_ROLE_MAP: Record<string, string> = {
  Administrators: "administrator",
  "Certificate Manager Agents": "agent",
  Auditors: "auditor",
  "Enterprise CA Administrators": "administrator",
  "Enterprise KRA Administrators": "administrator",
  "Enterprise OCSP Administrators": "administrator",
  "Enterprise TKS Administrators": "administrator",
  "Enterprise TPS Administrators": "administrator",
  administrator: "administrator",
  agent: "agent",
  auditor: "auditor",
};

function extractSetCookies(headers: http.IncomingHttpHeaders): string | null {
  const sc = headers["set-cookie"];
  if (!sc) return null;
  return sc.map((c) => c.split(";")[0]).join("; ");
}

export async function caProxyHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const sessionId = (request.cookies as Record<string, string>)?.webui_session;
  if (!sessionId) {
    return reply.status(401).send({ error: "Not authenticated" });
  }

  let session = getSession(sessionId);
  if (!session) {
    return reply.status(401).send({ error: "Session expired" });
  }

  // Re-validate roles if stale
  const now = Date.now();
  if (session.dogtagCookies && now - session.lastRoleCheck > ROLE_RECHECK_MS) {
    const refreshed = await checkDogtagSession(session.dogtagCookies);
    if (!refreshed) {
      deleteSession(sessionId);
      return reply.status(401).send({ error: "Session expired" });
    }
    const newRoles = (refreshed.account.Roles || [])
      .map((r: string) => DOGTAG_ROLE_MAP[r] || r)
      .filter(Boolean);
    updateSessionRoles(
      sessionId,
      newRoles.length > 0 ? newRoles : session.roles,
    );
    if (refreshed.cookies !== session.dogtagCookies) {
      updateDogtagCookies(sessionId, refreshed.cookies);
    }
    session = getSession(sessionId)!;
  }

  const urlPath = request.url;
  if (!checkRouteAccess(urlPath, session.roles)) {
    return reply.status(403).send({ error: "Insufficient permissions" });
  }

  // Per-session rate limiting for write operations
  if (WRITE_METHODS.has(request.method)) {
    if (isApiRateLimited(sessionId)) {
      auditLog("api_rate_limited", session.username, request.ip, {
        method: request.method,
        path: urlPath,
      });
      return reply
        .status(429)
        .send({ error: "Too many write requests. Try again later." });
    }
    recordApiWrite(sessionId);
  }

  const target = new URL(urlPath, CA_TARGET_URL);
  const isHttps = target.protocol === "https:";

  const agentOptions: https.AgentOptions = {
    ...caTlsOptions,
  };

  // Note: we intentionally do NOT set agentOptions.cert here for cert-auth
  // sessions. nginx terminates TLS — the backend only has the client cert PEM,
  // not the private key — so mTLS replay to Dogtag is impossible. Cert-auth
  // sessions use Dogtag cookies (from admin lookup) for proxying.

  const headers: Record<string, string> = {
    Accept: "application/json",
    Host: target.host,
  };

  if (request.headers["content-type"]) {
    headers["Content-Type"] = request.headers["content-type"] as string;
  }

  if (session.dogtagCookies) {
    headers["Cookie"] = session.dogtagCookies;
  }

  const options: https.RequestOptions = {
    hostname: target.hostname,
    port: target.port || (isHttps ? 443 : 80),
    path: target.pathname + target.search,
    method: request.method,
    headers,
    agent: isHttps ? new https.Agent(agentOptions) : undefined,
  };

  return new Promise<void>((resolve) => {
    const transport = isHttps ? https : http;
    const proxyReq = transport.request(options, (proxyRes) => {
      const newCookies = extractSetCookies(proxyRes.headers);
      if (newCookies) {
        updateDogtagCookies(sessionId, newCookies);
      }

      reply.status(proxyRes.statusCode ?? 500);

      const ct = proxyRes.headers["content-type"];
      if (ct) reply.header("Content-Type", ct);

      reply.send(proxyRes);
      resolve();
    });

    proxyReq.on("error", (err) => {
      request.log.error(err, "CA proxy error");
      reply.status(502).send({ error: "CA backend unavailable" });
      resolve();
    });

    const body = (request as unknown as { body: unknown }).body;
    if (body && request.method !== "GET" && request.method !== "HEAD") {
      const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
      proxyReq.write(bodyStr);
    }

    proxyReq.end();
  });
}
