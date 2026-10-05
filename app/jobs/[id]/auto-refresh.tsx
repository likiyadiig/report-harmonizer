"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export const REFRESH_EVERY_MS = 3_000;

// Reloads the job page's data from the server every few seconds, without
// a full page reload. The page only shows this while the job is queued or
// processing: once a refresh brings back "done" or "failed", the page
// stops rendering it, React removes it, and the timer is cleared.
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), REFRESH_EVERY_MS);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
