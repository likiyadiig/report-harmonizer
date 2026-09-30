import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEFAULT_RULES } from "@/lib/default-rules";
import { RulesForm } from "./rules-form";

export default async function Rules() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const ruleSet = await db.ruleSet.findUnique({
    where: { userId: session.user.id },
  });

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href="/" className="text-sm underline">
        Home
      </Link>
      <h1 className="mt-2 mb-4 text-xl font-semibold">Your style rules</h1>
      <RulesForm initialBody={ruleSet?.body ?? DEFAULT_RULES} />
    </main>
  );
}
