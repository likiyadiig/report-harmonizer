import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// Only a thank you. Anyone can open this address, with or without paying,
// so it grants nothing and ignores session_id. Access is granted by the
// Stripe webhook once Stripe confirms the payment.
export default async function BillingSuccess() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  return (
    <main className="mx-auto max-w-sm p-8">
      <Link href="/" className="text-sm underline">
        Home
      </Link>
      <h1 className="mt-2 mb-4 text-xl font-semibold">Thank you</h1>
      <p>Your access is being set up. This usually takes a moment.</p>
    </main>
  );
}
