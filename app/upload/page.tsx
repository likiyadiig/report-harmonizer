import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/lib/config";
import { Card, PageHeading, PageWidth } from "@/components/ui";
import { UploadForm } from "./upload-form";

export default async function Upload() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  return (
    <PageWidth>
      <PageHeading>Upload a report</PageHeading>
      <Card>
        <UploadForm maxBytes={MAX_UPLOAD_BYTES} maxMb={MAX_UPLOAD_MB} />
      </Card>
    </PageWidth>
  );
}
