"use client"; // Error pages must be Client Components.

import { Card, PageHeading, PageWidth, primaryButton, textLink } from "@/components/ui";

// Shown instead of a page when something on the server fails unexpectedly,
// most often a database call. The error itself is never shown: it could
// hold internal details. The server log has it.
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <PageWidth>
      <PageHeading>Something went wrong</PageHeading>
      <Card>
        <p className="mb-5">
          Something went wrong on our side. Please try again in a minute.
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
