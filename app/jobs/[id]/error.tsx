"use client"; // Error pages must be Client Components.

import { useEffect } from "react";
import { Card, PageHeading, PageWidth, primaryButton, textLink } from "@/components/ui";

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
    <PageWidth>
      <PageHeading>Something went wrong</PageHeading>
      <Card>
        <p className="mb-5">
          Something went wrong on our side. If your report is still being
          harmonized, that carries on in the background. This page tries again
          on its own.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className={primaryButton}
        >
          Try again
        </button>
        {/* A plain <a>, not <Link>: a full page load starts fresh. */}
        <p className="mt-5">
          <a href="/" className={textLink}>
            Back to home
          </a>
        </p>
      </Card>
    </PageWidth>
  );
}
