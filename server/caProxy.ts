import https from "node:https";
import http from "node:http";
import { URL } from "node:url";
import type { FastifyRequest, FastifyReply } from "fastify";
import { getSession, updateDogtagCookies } from "./sessionStore.js";
import { checkRouteAccess } from "./authMiddleware.js";

const CA_TARGET_URL = process.env.CA_TARGET_URL || "https://localhost:8443";

function extractSetCookies(
  headers: http.IncomingHttpHeaders,
): string | null {
  const sc = headers["set-cookie"];
  if (!sc) return null;
  return sc
    .map((c) => c.split(";")[0])
    .join("; ");
}

export async function caProxyHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const sessionId = (request.cookies as Record<string, string>)?.webui_session;
  if (!sessionId) {
    return reply.status(401).send({ error: "Not authenticated" });
  }

  const session = getSession(sessionId);
  if (!session) {
    return reply.status(401).send({ error: "Session expired" });
  }

  const urlPath = request.url;
  if (!checkRouteAccess(urlPath, session.roles)) {
    return reply.status(403).send({ error: "Insufficient permissions" });
  }

  const target = new URL(urlPath, CA_TARGET_URL);
  const isHttps = target.protocol === "https:";

  const agentOptions: https.AgentOptions = {
    rejectUnauthorized: false,
  };

  if (session.authMethod === "certificate" && session.clientCertPem) {
    agentOptions.cert = session.clientCertPem;
  }

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
      const bodyStr =
        typeof body === "string" ? body : JSON.stringify(body);
      proxyReq.write(bodyStr);
    }

    proxyReq.end();
  });
}
