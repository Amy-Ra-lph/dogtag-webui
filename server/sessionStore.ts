import crypto from "node:crypto";

export interface DogtagSession {
  id: string;
  username: string;
  fullName: string;
  email: string;
  roles: string[];
  authMethod: "password" | "certificate";
  dogtagCookies: string | null;
  clientCertPem: string | null;
  createdAt: number;
  expiresAt: number;
  lastRoleCheck: number;
}

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 10_000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

const sessions = new Map<string, DogtagSession>();

export function createSession(
  user: {
    username: string;
    fullName: string;
    email: string;
    roles: string[];
  },
  authMethod: "password" | "certificate",
  dogtagCookies: string | null,
  clientCertPem: string | null,
): DogtagSession {
  if (sessions.size >= MAX_SESSIONS) {
    sweepExpired();
    if (sessions.size >= MAX_SESSIONS) {
      throw new Error("Session limit reached");
    }
  }

  const id = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  const session: DogtagSession = {
    id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    roles: user.roles,
    authMethod,
    dogtagCookies,
    clientCertPem,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    lastRoleCheck: now,
  };

  sessions.set(id, session);
  return session;
}

export function getSession(id: string): DogtagSession | null {
  const session = sessions.get(id);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(id);
    return null;
  }
  return session;
}

export function deleteSession(id: string): void {
  sessions.delete(id);
}

export function updateDogtagCookies(id: string, cookies: string): void {
  const session = sessions.get(id);
  if (session) {
    session.dogtagCookies = cookies;
  }
}

export function updateSessionRoles(id: string, roles: string[]): void {
  const session = sessions.get(id);
  if (session) {
    session.roles = roles;
    session.lastRoleCheck = Date.now();
  }
}

function sweepExpired(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt < now) {
      sessions.delete(id);
    }
  }
}

const sweepTimer = setInterval(sweepExpired, SWEEP_INTERVAL_MS);
sweepTimer.unref();
