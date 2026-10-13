import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEFAULT_RULES } from "@/lib/default-rules";
import { Card, PageHeading, PageWidth } from "@/components/ui";
import { RulesForm } from "./rules-form";

export default async function Rules() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const ruleSet = await db.ruleSet.findUnique({
    where: { userId: session.user.id },
  });

  return (
    <PageWidth>
      <PageHeading>Your style rules</PageHeading>
      <Card>
        <RulesForm initialBody={ruleSet?.body ?? DEFAULT_RULES} />
      </Card>
    </PageWidth>
  );
}
