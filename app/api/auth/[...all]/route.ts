import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// Hands /api/auth/* requests to Better Auth, including opening the link
// in a sign-in email (a GET to /api/auth/magic-link/verify).
const handler = toNextJsHandler(auth);

export const GET = handler.GET;

// Asking for a sign-in link is refused here. The sign-in form calls Better
// Auth from server code (app/sign-in/actions.ts), after our own limits per
// address and per IP (lib/sign-in-limits.ts). This public address would
// skip those limits, and Better Auth's own limit reads the IP from
// X-Forwarded-For, which the visitor can fake. With sign-up open to anyone,
// a script could then send unlimited sign-in emails. Nothing in the app
// uses this address, so it answers 404 like an address that doesn't exist.
export async function POST(request: Request): Promise<Response> {
  if (isMagicLinkRequest(request)) {
    console.log("SIGN_IN_REFUSED code=direct_request");
    return new Response(null, { status: 404 });
  }
  return handler.POST(request);
}

const MAGIC_LINK_PATH = "/api/auth/sign-in/magic-link";

// Compared after undoing small variations (letter case, %-encoding,
// repeated or trailing slashes), so /API/Auth//sign-in/magic-link/ is
// refused too. A path that can't be decoded is refused as well: no real
// request has one.
function isMagicLinkRequest(request: Request): boolean {
  let path: string;
  try {
    path = decodeURIComponent(new URL(request.url).pathname);
  } catch {
    return true;
  }
  path = path.toLowerCase().replace(/\/+/g, "/");
  return path.startsWith(MAGIC_LINK_PATH);
}
