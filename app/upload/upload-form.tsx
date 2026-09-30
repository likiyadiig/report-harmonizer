"use client";

import { useActionState, useState } from "react";
import { uploadReport, type UploadState } from "./actions";

const initialState: UploadState = { message: "" };

export function UploadForm({
  maxBytes,
  maxMb,
}: {
  maxBytes: number;
  maxMb: number;
}) {
  const [state, formAction, pending] = useActionState(uploadReport, initialState);
  // Files over the limit are stopped here, because the server rejects
  // oversized requests before our action can return a message.
  const [tooBig, setTooBig] = useState(false);

  const message = tooBig ? `This file is over ${maxMb} MB.` : state.message;

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        const file = new FormData(e.currentTarget).get("file");
        if (file instanceof File && file.size > maxBytes) {
          e.preventDefault();
          setTooBig(true);
        }
      }}
      className="flex flex-col gap-3"
    >
      <label htmlFor="file">Word report (.docx, up to {maxMb} MB)</label>
      <input
        id="file"
        name="file"
        type="file"
        accept=".docx"
        onChange={() => setTooBig(false)}
        className="rounded border px-3 py-2"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Uploading…" : "Upload"}
      </button>
      <p aria-live="polite" className="text-sm text-red-700">
        {message}
      </p>
    </form>
  );
}
