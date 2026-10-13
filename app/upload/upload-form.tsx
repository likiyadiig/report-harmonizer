"use client";

import { useActionState, useState } from "react";
import { dropZone, primaryButton, UploadIcon } from "@/components/ui";
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
  // Only for display: the real file input is invisible, see below.
  const [fileName, setFileName] = useState("");

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
      <label htmlFor="file" className="font-medium">
        Word report (.docx, up to {maxMb} MB)
      </label>
      {/* The real file input is stretched invisibly over the whole box, so
          clicking the box opens the file picker and dropping a file onto
          it works without any extra code. */}
      <div
        className={`${dropZone} relative has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent`}
      >
        <UploadIcon />
        <p className="mt-4 text-lg font-medium break-all text-navy">
          {fileName || "Drop your report here"}
        </p>
        <p className="mt-1 text-sm text-muted">
          {fileName ? "Click to choose a different file" : "or click to choose a file"}
        </p>
        <input
          id="file"
          name="file"
          type="file"
          accept=".docx"
          onChange={(e) => {
            setTooBig(false);
            setFileName(e.target.files?.[0]?.name ?? "");
          }}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </div>
      <button type="submit" disabled={pending} className={`${primaryButton} sm:self-start`}>
        {pending ? "Uploading…" : "Upload"}
      </button>
      <p aria-live="polite" className="text-sm text-red-700">
        {message}
      </p>
    </form>
  );
}
