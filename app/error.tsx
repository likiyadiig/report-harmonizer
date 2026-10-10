"use client"; // Error pages must be Client Components.

// Shown instead of a page when something on the server fails unexpectedly,
// most often a database call. The error itself is never shown: it could
// hold internal details. The server log has it.
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-4 text-xl font-semibold">Something went wrong</h1>
      <p className="mb-4">
        Something went wrong on our side. Please try again in a minute.
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
