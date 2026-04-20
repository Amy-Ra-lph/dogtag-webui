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
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(data)
    .digest("base64url");
  if (sig !== expected) return null;
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
// Vite server middleware plugin
// ---------------------------------------------------------------------------

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
  });
}

export function authPlugin(backend: AuthBackend = demoBackend) {
  return {
    name: "webui-auth",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/webui/api/auth/")) return next();

        res.setHeader("Content-Type", "application/json");

        // POST /webui/api/auth/login
        if (req.url === "/webui/api/auth/login" && req.method === "POST") {
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

          const user = await backend.validate(username, password);
          if (!user) {
            res.statusCode = 401;
            res.end(JSON.stringify({ error: "Invalid username or password" }));
            return;
          }

          const token = sign({
            username,
            fullName: user.fullName,
            email: user.email,
            roles: user.roles,
            exp: Date.now() + 8 * 60 * 60 * 1000, // 8 hours
          });

          res.setHeader(
            "Set-Cookie",
            `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=28800`,
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
