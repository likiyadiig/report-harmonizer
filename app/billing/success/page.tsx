import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card, PageHeading, PageWidth } from "@/components/ui";

// Only a thank you. Anyone can open this address, with or without paying,
// so it grants nothing and ignores session_id. Access is granted by the
// Stripe webhook once Stripe confirms the payment.
export default async function BillingSuccess() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  return (
    <PageWidth>
      <PageHeading>Thank you</PageHeading>
      <Card>
        <p>Your access is being set up. This usually takes a moment.</p>
      </Card>
    </PageWidth>
  );
}
