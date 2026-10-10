"use client"; // Error pages must be Client Components.

import { useEffect } from "react";

export const RETRY_EVERY_MS = 10_000;

// Shown when the job page can't be loaded, most often because the database
// is briefly unavailable. The job keeps running, so instead of stopping
// like the normal auto refresh would, this page asks the server for the
// job page again every few seconds. Once that works, the job page comes
// back and its own auto refresh starts again. The error itself is never
// shown: it could hold internal details.
export default function JobErrorPage({ retry }: { retry: () => void }) {
  useEffect(() => {
    const timer = setInterval(() => retry(), RETRY_EVERY_MS);
    return () => clearInterval(timer);
  }, [retry]);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-4 text-xl font-semibold">Something went wrong</h1>
      <p className="mb-4">
        Something went wrong on our side. If your report is still being
        harmonized, that carries on in the background. This page tries again
        on its own.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="rounded border px-3 py-2"
      >
        Try again
      </button>
      {/* A plain <a>, not <Link>: a full page load starts fresh. */}
      <p className="mt-4">
        <a href="/" className="underline">
          Back to home
        </a>
      </p>
    </main>
  );
}
