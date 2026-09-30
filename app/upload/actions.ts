"use server";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEFAULT_RULES } from "@/lib/default-rules";
import { isDocx } from "@/lib/docx";
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
  MODEL,
  PROMPT_VERSION,
  getUploadDir,
} from "@/lib/config";

export type UploadState = { message: string };

export async function uploadReport(
  _prevState: UploadState,
  formData: FormData,
): Promise<UploadState> {
  // Server Actions can be called directly, so check the session here too,
  // not only on the page.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const file = formData.get("file");
  // With no file chosen, browsers still send an empty, unnamed file.
  if (!(file instanceof File) || file.name === "") {
    return { message: "Choose a .docx file to upload." };
  }
  if (!file.name.toLowerCase().endsWith(".docx")) {
    return { message: "Only Word files (.docx) can be uploaded." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { message: `This file is over ${MAX_UPLOAD_MB} MB.` };
  }
  if (file.size === 0) {
    return { message: "This file is empty." };
  }

  // Check the content, not just the name: a renamed PDF or text file fails.
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!isDocx(bytes)) {
    return {
      message:
        "This file isn't a valid Word document, even though it ends in .docx.",
    };
  }

  let uploadDir: string;
  try {
    uploadDir = getUploadDir();
  } catch (error) {
    console.error(error);
    return { message: "Uploads aren't set up on the server yet." };
  }

  const ruleSet = await db.ruleSet.findUnique({
    where: { userId: session.user.id },
  });

  const job = await db.job.create({
    data: {
      userId: session.user.id,
      status: "queued",
      originalFilename: file.name,
      rulesSnapshot: ruleSet?.body ?? DEFAULT_RULES,
      model: MODEL,
      promptVersion: PROMPT_VERSION,
    },
  });

  try {
    // Only the app's own user can open the folder or read the files.
    await mkdir(uploadDir, { recursive: true, mode: 0o700 });
    await writeFile(path.join(uploadDir, `${job.id}.docx`), bytes, {
      mode: 0o600,
    });
  } catch (error) {
    // Don't leave a queued job behind that has no file.
    console.error(error);
    await db.job.delete({ where: { id: job.id } });
    return { message: "The file couldn't be saved. Please try again." };
  }

  redirect(`/jobs/${job.id}`);
}
