import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PlanCard } from "@/components/plan-card";
import { Badge, PageHeading, PageWidth, textLink } from "@/components/ui";
import { ManageButton } from "./manage-button";
import { UpgradeButton } from "./upgrade-button";

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
    <PageWidth>
      <PageHeading>Billing</PageHeading>

      <PlanCard badge={subscribed && <Badge>Active</Badge>}>
        {pastDue && (
          <p className="mt-5 rounded-lg bg-red-50 p-3 text-red-800">
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
          <Link href="/terms" className={`${textLink} text-sm`}>
            Refund policy and terms
          </Link>
        </div>
      </PlanCard>
    </PageWidth>
  );
}
