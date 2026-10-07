"use client";

import { useActionState, useState } from "react";
import { sendLink, type SignInState } from "./actions";

const initialState: SignInState = { status: "idle" };

type Props = { expiresMinutes: number; linkInTerminal: boolean };

export function SignInForm({ expiresMinutes, linkInTerminal }: Props) {
  const [state, formAction, pending] = useActionState(sendLink, initialState);
  // Controlled, so the typed address survives React resetting the form
  // after it is sent, and is still there after "Use a different email address".
  const [email, setEmail] = useState("");
  // Set when the user goes back from the sent message to fix the address.
  const [editing, setEditing] = useState(false);

  if (state.status === "sent" && !editing) {
    return (
      <SentMessage
        email={state.email}
        expiresMinutes={expiresMinutes}
        linkInTerminal={linkInTerminal}
        onChangeAddress={() => setEditing(true)}
      />
    );
  }

  return (
    <form
      action={(formData) => {
        setEditing(false);
        return formAction(formData);
      }}
      className="flex flex-col gap-3"
    >
      {state.status === "error" && !editing && (
        <p role="alert" className="text-red-700">
          We couldn&apos;t send your sign-in link. Please try again in a few
          minutes.
        </p>
      )}
      <label htmlFor="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded border px-3 py-2"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send sign-in link"}
      </button>
    </form>
  );
}

// Shows the address exactly as typed, so a typo is easy to notice.
export function SentMessage({
  email,
  expiresMinutes,
  linkInTerminal,
  onChangeAddress,
}: Props & { email: string; onChangeAddress: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p>
        We sent a link to <strong className="break-all">{email}</strong>.
        Open it to sign in.
      </p>
      <p>
        It can take a minute to arrive. If you don&apos;t see it, check your
        spam folder. The link expires in {expiresMinutes} minutes.
      </p>
      {linkInTerminal && (
        <p className="text-sm text-gray-600">
          Development without EMAIL_API_KEY. The link is in the server
          terminal.
        </p>
      )}
      <button
        type="button"
        onClick={onChangeAddress}
        className="rounded border px-3 py-2"
      >
        Use a different email address
      </button>
    </div>
  );
}
