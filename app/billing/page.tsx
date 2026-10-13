import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ManageButton } from "./manage-button";
import { UpgradeButton } from "./upgrade-button";

// Only things the service does today.
const INCLUDED = [
  "Turn multi-author Word reports into one voice",
  "Every change returned as a Word tracked change",
  "Comments where an edit might change the meaning",
  "Cancel any time",
];

export default async function Billing() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  // Set only by the Stripe webhook, once Stripe confirms the payment.
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { subscriptionStatus: true, stripeCustomerId: true },
  });
  const status = user?.subscriptionStatus;
  const subscribed = status === "active";
  // Past due still has a running subscription. Upgrade would start a
  // second one, so these users fix their card in the portal instead.
  const pastDue = status === "past_due";
  // Anyone who has paid once has a Stripe customer, even after cancelling.
  const hasCustomer = Boolean(user?.stripeCustomerId);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
      <Link href="/" className="text-sm underline">
        Home
      </Link>
      <h1 className="mt-2 mb-6 text-3xl font-semibold tracking-tight sm:text-4xl">
        Billing
      </h1>

      <section className="rounded-lg border border-gray-300 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Report Harmonizer</h2>
          {subscribed && (
            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-sm font-medium text-green-800">
              Active
            </span>
          )}
        </div>

        <p className="mt-2">
          <span className="text-3xl font-semibold tracking-tight">15 euros</span>{" "}
          <span className="text-gray-700">per month</span>
        </p>

        <ul className="mt-5 space-y-2">
          {INCLUDED.map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden="true" className="text-green-700">
                ✓
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        {pastDue && (
          <p className="mt-5 rounded-md bg-red-50 p-3 text-red-800">
            Your last payment failed. Please update your card with Manage subscription.
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:items-start">
          {subscribed || pastDue ? (
            hasCustomer && <ManageButton primary />
          ) : (
            <>
              <UpgradeButton />
              {hasCustomer && <ManageButton />}
            </>
          )}
          <Link href="/terms" className="text-sm underline">
            Refund policy and terms
          </Link>
        </div>
      </section>
    </main>
  );
}
