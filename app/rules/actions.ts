"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { MAX_RULES_LENGTH } from "@/lib/default-rules";

export type SaveRulesState = {
  status: "idle" | "saved" | "error";
  message: string;
};

export async function saveRules(
  _prevState: SaveRulesState,
  formData: FormData,
): Promise<SaveRulesState> {
  // Server Actions can be called directly, so check the session here too,
  // not only on the page.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  // Browsers send textarea line breaks as \r\n. Store plain \n so the
  // length matches the counter the user sees.
  const body = String(formData.get("body") ?? "").replace(/\r\n/g, "\n");

  if (body.trim() === "") {
    return { status: "error", message: "Your rules can't be empty." };
  }
  if (body.length > MAX_RULES_LENGTH) {
    return {
      status: "error",
      message: `Your rules are too long (${body.length.toLocaleString("en-US")} / ${MAX_RULES_LENGTH.toLocaleString("en-US")} characters).`,
    };
  }

  await db.ruleSet.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, body },
    update: { body },
  });

  return { status: "saved", message: "Saved" };
}
