"use client";

import { useState } from "react";
import { primaryButton, secondaryButton } from "@/components/ui";

// Asks our server for a Stripe Customer Portal address, then goes there.
// Cancelling and changing the card happen on Stripe's page, never here.
// primary makes it the dark main button, for when it is the only action.
export function ManageButton({ primary = false }: { primary?: boolean }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function manage() {
    setPending(true);
    setFailed(false);
    try {
      const response = await fetch("/api/billing-portal", { method: "POST" });
      if (response.status === 401) {
        window.location.assign("/sign-in");
        return;
      }
      const data: unknown = await response.json();
      const url = (data as { url?: unknown } | null)?.url;
      if (!response.ok || typeof url !== "string") throw new Error("no url");
      // Stays disabled while the browser leaves.
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
        onClick={manage}
        disabled={pending}
        className={`${primary ? primaryButton : secondaryButton} w-full sm:w-auto`}
      >
        {pending ? "Opening…" : "Manage subscription"}
      </button>
      <p aria-live="polite" className="text-sm text-red-700">
        {failed && "The billing portal could not open. Please try again."}
      </p>
    </div>
  );
}
