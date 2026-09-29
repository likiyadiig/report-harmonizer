import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// Hands every /api/auth/* request (including the magic link) to Better Auth.
export const { GET, POST } = toNextJsHandler(auth);
