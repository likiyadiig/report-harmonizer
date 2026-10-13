"use client";

import { useState } from "react";

// Asks our server for a Stripe Checkout address, then goes there. Paying
// happens on Stripe's page, never here.
export function UpgradeButton() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function upgrade() {
    setPending(true);
    setFailed(false);
    try {
      const response = await fetch("/api/checkout", { method: "POST" });
      if (response.status === 401) {
        window.location.assign("/sign-in");
        return;
      }
      const data: unknown = await response.json();
      const url = (data as { url?: unknown } | null)?.url;
      if (!response.ok || typeof url !== "string") throw new Error("no url");
      // Stays disabled while the browser leaves, so a second click can't
      // start a second checkout.
      window.location.assign(url);
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={upgrade}
        disabled={pending}
        className="w-full rounded-md bg-gray-900 px-5 py-2.5 font-medium text-white hover:bg-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 disabled:opacity-50 sm:w-auto"
      >
        {pending ? "Opening checkout…" : "Upgrade"}
      </button>
      <p aria-live="polite" className="text-sm text-red-700">
        {failed && "Checkout could not start. Please try again."}
      </p>
    </div>
  );
}
