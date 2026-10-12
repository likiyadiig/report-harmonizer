import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { UpgradeButton } from "./upgrade-button";

export default async function Billing() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  return (
    <main className="mx-auto max-w-sm p-8">
      <Link href="/" className="text-sm underline">
        Home
      </Link>
      <h1 className="mt-2 mb-4 text-xl font-semibold">Billing</h1>
      <div className="mb-4 rounded border p-4">
        <p className="font-medium">Report Harmonizer</p>
        <p className="text-gray-700">15 euros a month</p>
      </div>
      <UpgradeButton />
    </main>
  );
}
