type AuthEvent =
  | "login_success"
  | "login_failure"
  | "cert_login_success"
  | "cert_login_failure"
  | "logout"
  | "session_expired"
  | "api_rate_limited";

export function auditLog(
  event: AuthEvent,
  username: string,
  ip: string,
  extra?: Record<string, unknown>,
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    audit: true,
    event,
    username,
    ip,
    ...extra,
  };
  process.stdout.write(JSON.stringify(entry) + "\n");
}
