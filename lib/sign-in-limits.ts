// Limits on sign-in link requests, so nobody can flood an inbox or use up
// the email quota. Allowed and not allowed addresses are counted the same
// way, so hitting a limit doesn't reveal who is on ALLOWED_EMAILS.
//
// The counts live in this process's memory. That works because production
// runs a single `next start` process, and the counts only matter for 10
// minutes, so losing them on a restart is fine. If the app ever runs more
// than one process, they must move to Postgres.
const WINDOW_MS = 10 * 60_000;
const MAX_PER_EMAIL = 3;
const MAX_PER_IP = 10;

// Key ("email:..." or "ip:...") to the times of attempts in the window.
const attempts = new Map<string, number[]>();

// Returns false when the address or the IP has reached its limit. Only
// allowed attempts are counted, so waiting a few minutes always works.
export function allowSignInAttempt(email: string, ip: string): boolean {
  const now = Date.now();
  removeOld(now);
  const emailKey = `email:${email.trim().toLowerCase()}`;
  const ipKey = `ip:${ip}`;
  if (count(emailKey) >= MAX_PER_EMAIL || count(ipKey) >= MAX_PER_IP) {
    return false;
  }
  record(emailKey, now);
  record(ipKey, now);
  return true;
}

// The app listens on 127.0.0.1 only (`npm start` uses -H 127.0.0.1), so in
// production every request has come through nginx on the same machine.
// nginx sets X-Real-IP to the visitor's address and replaces any value the
// visitor sent, so it can be trusted. This is only safe while the app
// listens on 127.0.0.1 only. X-Forwarded-For is not used: nginx adds to it,
// so its first entry is whatever the visitor sent. Without nginx (npm run
// dev), all requests share one "local" count.
export function clientIp(headers: Headers): string {
  return headers.get("x-real-ip")?.trim() || "local";
}

function count(key: string): number {
  return attempts.get(key)?.length ?? 0;
}

function record(key: string, now: number): void {
  attempts.set(key, [...(attempts.get(key) ?? []), now]);
}

// Keeps memory bounded: anything older than the window is forgotten.
function removeOld(now: number): void {
  for (const [key, times] of attempts) {
    const recent = times.filter((t) => now - t < WINDOW_MS);
    if (recent.length === 0) attempts.delete(key);
    else attempts.set(key, recent);
  }
}
