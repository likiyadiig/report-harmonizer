"use client";

import { useActionState, useState } from "react";
import { input, primaryButton, secondaryButton } from "@/components/ui";
import { sendLink, type SignInState } from "./actions";

const initialState: SignInState = { status: "idle" };

type Props = { expiresMinutes: number; linkInTerminal: boolean };

// linkFailed: the page was opened from a sign-in link that didn't work.
export function SignInForm({
  expiresMinutes,
  linkInTerminal,
  linkFailed,
}: Props & { linkFailed: boolean }) {
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
      {linkFailed && state.status === "idle" && (
        <p role="alert" className="text-red-700">
          This link has expired or was already used. Send yourself a new one.
        </p>
      )}
      {!editing && <StatusMessage status={state.status} />}
      <label htmlFor="email" className="font-medium">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={input}
      />
      <button
        type="submit"
        disabled={pending}
        className={primaryButton}
      >
        {pending ? "Sending…" : "Send sign-in link"}
      </button>
    </form>
  );
}

// What went wrong with the last request, if anything.
export function StatusMessage({ status }: { status: SignInState["status"] }) {
  const messages: Partial<Record<SignInState["status"], string>> = {
    error: "We couldn't send your sign-in link. Please try again in a few minutes.",
    limited: "Too many attempts. Please try again in a few minutes.",
    empty: "Please type your email address.",
    invalid: "Please type a valid email address.",
  };
  const message = messages[status];
  if (!message) return null;
  return (
    <p role="alert" className="text-red-700">
      {message}
    </p>
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
        <p className="text-sm text-muted">
          Development without EMAIL_API_KEY. The link is in the server
          terminal.
        </p>
      )}
      <button
        type="button"
        onClick={onChangeAddress}
        className={secondaryButton}
      >
        Use a different email address
      </button>
    </div>
  );
}
