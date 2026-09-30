import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/lib/config";
import { UploadForm } from "./upload-form";

export default async function Upload() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href="/" className="text-sm underline">
        Home
      </Link>
      <h1 className="mt-2 mb-4 text-xl font-semibold">Upload a report</h1>
      <UploadForm maxBytes={MAX_UPLOAD_BYTES} maxMb={MAX_UPLOAD_MB} />
    </main>
  );
}
