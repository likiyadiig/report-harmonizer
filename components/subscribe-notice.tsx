import Link from "next/link";
import { SUBSCRIBE_MESSAGE } from "@/lib/subscription";
import { primaryButton } from "./ui";

// Shown on the home page and /upload, instead of the upload form, to a
// signed-in user without an active subscription. Hiding the form is only
// for clarity: the upload action refuses these users as well.
export function SubscribeNotice() {
  return (
    <div>
      <p>{SUBSCRIBE_MESSAGE}</p>
      <Link href="/billing" className={`${primaryButton} mt-4`}>
        Subscribe
      </Link>
    </div>
  );
}
