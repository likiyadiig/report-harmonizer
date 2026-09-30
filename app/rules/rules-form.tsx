"use client";

import { useActionState, useState } from "react";
import { saveRules, type SaveRulesState } from "./actions";
import { MAX_RULES_LENGTH } from "@/lib/default-rules";

const initialState: SaveRulesState = { status: "idle", message: "" };

export function RulesForm({ initialBody }: { initialBody: string }) {
  const [state, formAction, pending] = useActionState(saveRules, initialState);
  // Controlled, so the text survives React resetting the form after a save.
  const [body, setBody] = useState(initialBody);
  // Hide "Saved" once the text changes again.
  const [savedBody, setSavedBody] = useState<string | null>(null);

  const length = body.replace(/\r\n/g, "\n").length;
  const tooLong = length > MAX_RULES_LENGTH;
  const showSaved = state.status === "saved" && savedBody === body;

  return (
    <form
      action={(formData) => {
        setSavedBody(body);
        return formAction(formData);
      }}
      className="flex flex-col gap-3"
    >
      <label htmlFor="body">Style rules</label>
      <textarea
        id="body"
        name="body"
        rows={14}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="rounded border px-3 py-2 font-mono text-sm"
      />
      <p className={`text-sm ${tooLong ? "text-red-700" : "text-gray-600"}`}>
        {length.toLocaleString("en-US")} / {MAX_RULES_LENGTH.toLocaleString("en-US")} characters
      </p>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      <p aria-live="polite" className="text-sm">
        {state.status === "error" && (
          <span className="text-red-700">{state.message}</span>
        )}
        {showSaved && <span className="text-green-700">{state.message}</span>}
      </p>
    </form>
  );
}
