import type { Connect, ViteDevServer } from "vite";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Pluggable auth backend
// ---------------------------------------------------------------------------

export interface AuthBackend {
  validate(
    username: string,
    password: string,
  ): Promise<{ fullName: string; email: string; roles: string[] } | null>;
}

const demoUsers: Record<
  string,
  { password: string; fullName: string; email: string; roles: string[] }
> = {
  caadmin: {
    password: "Secret.123",
    fullName: "CA Administrator",
    email: "caadmin@test.example.com",
    roles: ["administrator", "agent"],
  },
  agent1: {
    password: "agent123",
    fullName: "Certificate Agent",
    email: "agent1@test.example.com",
    roles: ["agent"],
  },
  auditor1: {
    password: "auditor123",
    fullName: "Security Auditor",
    email: "auditor1@test.example.com",
    roles: ["auditor"],
  },
};

const demoBackend: AuthBackend = {
  async validate(username, password) {
    const user = demoUsers[username];
    if (!user || user.password !== password) return null;
    return { fullName: user.fullName, email: user.email, roles: user.roles };
  },
};

// ---------------------------------------------------------------------------
// Session management (signed cookies)
// ---------------------------------------------------------------------------

const SESSION_COOKIE = "webui_session";
const SECRET = crypto.randomBytes(32).toString("hex");
const SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours
const SESSION_MAX_AGE_SEC = SESSION_MAX_AGE_MS / 1000;

interface SessionPayload {
  username: string;
  fullName: string;
  email: string;
  roles: string[];
  exp: number;
}

function sign(payload: SessionPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", SECRET)
    .update(data)
    .digest("base64url");
  return `${data}.${sig}`;
}

function verify(token: string): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  if (!data || !sig) return null;
  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(data)
    .digest("base64url");
  try {
    if (
      !crypto.timingSafeEqual(
        Buffer.from(sig, "base64url"),
        Buffer.from(expected, "base64url"),
      )
    )
      return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(data, "base64url").toString(),
    ) as SessionPayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const pair of header.split(";")) {
    const [k, ...v] = pair.split("=");
    if (k) cookies[k.trim()] = v.join("=").trim();
  }
  return cookies;
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) return false;
  return entry.count >= MAX_ATTEMPTS;
}

function recordAttempt(ip: string, success: boolean): void {
  if (success) {
    loginAttempts.delete(ip);
    return;
  }
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count++;
  }
}

// ---------------------------------------------------------------------------
// Server-side RBAC for API proxy
// ---------------------------------------------------------------------------

const ROLE_ROUTE_MAP: Array<{ pattern: RegExp; roles: string[] }> = [
  { pattern: /^\/ca\/rest\/agent\//, roles: ["administrator", "agent"] },
  {
    pattern: /^\/ca\/rest\/admin\//,
    roles: ["administrator"],
  },
  {
    pattern: /^\/ca\/rest\/profiles$/,
    roles: ["administrator", "agent"],
  },
  {
    pattern: /^\/ca\/rest\/profiles\//,
    roles: ["administrator", "agent"],
  },
  {
    pattern: /^\/ca\/rest\/account\//,
    roles: ["administrator", "agent", "auditor"],
  },
  {
    pattern: /^\/ca\/rest\/certs/,
    roles: ["administrator", "agent", "auditor"],
  },
  {
    pattern: /^\/ca\/rest\/authorities/,
    roles: ["administrator", "agent", "auditor"],
  },
  { pattern: /^\/ca\/rest\/audit/, roles: ["administrator", "auditor"] },
  {
    pattern: /^\/ca\/rest\//,
    roles: ["administrator"],
  },
];

function checkRouteAccess(url: string, roles: string[]): boolean {
  for (const rule of ROLE_ROUTE_MAP) {
    if (rule.pattern.test(url)) {
      return rule.roles.some((r) => roles.includes(r));
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Vite server middleware plugin
// ---------------------------------------------------------------------------

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
  });
}

function getClientIp(req: Connect.IncomingMessage): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

function checkOrigin(req: Connect.IncomingMessage): boolean {
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  if (!origin && !referer) return true; // non-browser clients
  const host = req.headers.host;
  if (origin) {
    try {
      const url = new URL(origin);
      return url.host === host;
    } catch {
      return false;
    }
  }
  if (referer) {
    try {
      const url = new URL(referer);
      return url.host === host;
    } catch {
      return false;
    }
  }
  return false;
}

export function authPlugin(backend?: AuthBackend) {
  const isDemoMode = !backend;
  const activeBackend = backend ?? demoBackend;

  if (isDemoMode) {
    console.warn(
      "\n⚠  WebUI auth: using DEMO backend with built-in credentials." +
        "\n   Set a custom AuthBackend for production use.\n",
    );
  }

  return {
    name: "webui-auth",
    configureServer(server: ViteDevServer) {
      // RBAC middleware for CA API proxy
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/ca/rest/")) return next();

        const cookies = parseCookies(req.headers.cookie);
        const token = cookies[SESSION_COOKIE];
        if (!token) return next(); // let Dogtag handle unauthenticated
        const session = verify(token);
        if (!session) return next();

        if (!checkRouteAccess(req.url, session.roles)) {
          res.statusCode = 403;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Insufficient permissions" }));
          return;
        }
        next();
      });

      // Auth endpoints
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/webui/api/auth/")) return next();

        res.setHeader("Content-Type", "application/json");

        // POST /webui/api/auth/login
        if (req.url === "/webui/api/auth/login" && req.method === "POST") {
          if (!checkOrigin(req)) {
            res.statusCode = 403;
            res.end(JSON.stringify({ error: "Invalid origin" }));
            return;
          }

          const clientIp = getClientIp(req);
          if (isRateLimited(clientIp)) {
            res.statusCode = 429;
            res.end(
              JSON.stringify({
                error: "Too many login attempts. Try again later.",
              }),
            );
            return;
          }

          const body = await readBody(req);
          let username = "";
          let password = "";
          try {
            const parsed = JSON.parse(body);
            username = String(parsed.username ?? "");
            password = String(parsed.password ?? "");
          } catch {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "Invalid request body" }));
            return;
          }

          const user = await activeBackend.validate(username, password);
          if (!user) {
            recordAttempt(clientIp, false);
            res.statusCode = 401;
            res.end(JSON.stringify({ error: "Invalid username or password" }));
            return;
          }

          recordAttempt(clientIp, true);

          const token = sign({
            username,
            fullName: user.fullName,
            email: user.email,
            roles: user.roles,
            exp: Date.now() + SESSION_MAX_AGE_MS,
          });

          const secure = req.headers["x-forwarded-proto"] === "https";
          const securePart = secure ? " Secure;" : "";

          res.setHeader(
            "Set-Cookie",
            `${SESSION_COOKIE}=${token}; HttpOnly;${securePart} Path=/; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SEC}`,
          );
          res.statusCode = 200;
          res.end(
            JSON.stringify({
              username,
              fullName: user.fullName,
              email: user.email,
              roles: user.roles,
            }),
          );
          return;
        }

        // POST /webui/api/auth/logout
        if (req.url === "/webui/api/auth/logout" && req.method === "POST") {
          res.setHeader(
            "Set-Cookie",
            `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`,
          );
          res.statusCode = 200;
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        // GET /webui/api/auth/me
        if (req.url === "/webui/api/auth/me" && req.method === "GET") {
          const cookies = parseCookies(req.headers.cookie);
          const token = cookies[SESSION_COOKIE];
          if (!token) {
            res.statusCode = 401;
            res.end(JSON.stringify({ error: "Not authenticated" }));
            return;
          }
          const session = verify(token);
          if (!session) {
            res.statusCode = 401;
            res.end(JSON.stringify({ error: "Session expired" }));
            return;
          }
          res.statusCode = 200;
          res.end(
            JSON.stringify({
              username: session.username,
              fullName: session.fullName,
              email: session.email,
              roles: session.roles,
            }),
          );
          return;
        }

        res.statusCode = 404;
        res.end(JSON.stringify({ error: "Not found" }));
      });
    },
  };
}
