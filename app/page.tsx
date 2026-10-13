import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/lib/config";
import { PlanCard } from "@/components/plan-card";
import {
  Card,
  cardSurface,
  dropZone,
  primaryButton,
  secondaryButton,
  UploadIcon,
} from "@/components/ui";
import { UploadForm } from "./upload/upload-form";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (session) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-3xl font-light tracking-tight text-navy sm:text-4xl">
          Welcome back
        </h1>
        <p className="mt-3 break-all text-muted">Signed in as {session.user.email}</p>

        {/* The same form as /upload, so a report can be uploaded right here. */}
        <Card className="mt-8">
          <h2 className="mb-4 text-xl font-medium text-navy">Upload a report</h2>
          <UploadForm maxBytes={MAX_UPLOAD_BYTES} maxMb={MAX_UPLOAD_MB} />
        </Card>
      </div>
    );
  }

  return (
    <>
      <section className="relative isolate overflow-hidden">
        {/* A very soft blue glow behind the top of the page. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[36rem] bg-[radial-gradient(ellipse_60%_60%_at_50%_0%,var(--color-accent-soft),transparent)]"
        />
        <div className={`${bandContent} grid items-center gap-10 py-12 sm:py-20 lg:grid-cols-[1.1fr_1fr]`}>
          <div>
            <p className="text-sm font-semibold tracking-widest text-accent">FOR CONSULTANTS</p>
            <h1 className="mt-3 text-4xl font-light tracking-tight text-navy sm:text-5xl">
              One report, one voice.
            </h1>
            <p className="mt-5 text-lg text-muted">
              Get a report written by many authors back in one voice. Every edit
              is a tracked change you can accept or reject, with a comment
              wherever the meaning might shift.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/sign-in" className={primaryButton}>
                Try it
              </Link>
              <a href="#example" className={secondaryButton}>
                See an example
              </a>
            </div>
          </div>

          {/* Looks like an upload box, but uploading needs an account. */}
          <Card className="p-3 sm:p-3">
            <Link
              href="/sign-in"
              className={`${dropZone} block py-14`}
            >
              <UploadIcon />
              <span className="mt-4 block text-lg font-medium text-navy">
                Drop a Word report here
              </span>
              <span className="mt-1 block text-sm text-muted">Sign in to upload a .docx file</span>
            </Link>
          </Card>
        </div>
      </section>

      <section className="bg-surface">
        <div className={`${bandContent} py-16`}>
          <h2 className="text-2xl font-light tracking-tight text-navy">How it works</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              "Sign in with your email.",
              "Upload your report as a .docx file.",
              "Download the edited file and review the changes in Word.",
            ].map((step, i) => (
              <li key={step}>
                <Card className="h-full">
                  <span
                    aria-hidden="true"
                    className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-strong"
                  >
                    {i + 1}
                  </span>
                  <p className="mt-3">{step}</p>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="example" className="bg-white">
        <div className={`${bandContent} py-16`}>
          <h2 className="text-2xl font-light tracking-tight text-navy">See an example</h2>
          <p className="mt-3 text-muted">
            A made up report, before and after. No sign in needed.
          </p>
          {/* Plain links, not <Link>: these are files to save, not pages.
              They are served from public/samples/ without sign in. */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <a
              href="/samples/sample-report-before.docx"
              download
              className={`${cardSurface} block hover:ring-accent/50`}
            >
              <span className="text-sm font-medium text-muted">Before</span>
              <span className="mt-1 block font-medium text-navy">
                Download the original report (.docx)
              </span>
            </a>
            <a
              href="/samples/sample-report-after.docx"
              download
              className={`${cardSurface} block hover:ring-accent/50`}
            >
              <span className="text-sm font-medium text-muted">After</span>
              <span className="mt-1 block font-medium text-navy">
                Download the edited report (.docx)
              </span>
            </a>
          </div>
        </div>
      </section>

      {/* Nothing clickable sits directly on the navy: the button is inside
          the white card, where the blue focus outline stays visible. */}
      <section className="bg-navy text-white">
        <div className={`${bandContent} py-16`}>
          <h2 className="text-center text-2xl font-light tracking-tight text-white">
            One simple plan
          </h2>
          <div className="mx-auto mt-8 max-w-md text-ink">
            <PlanCard>
              <p className="mt-6 border-t border-line pt-5 text-muted">
                Sign in is by invitation for now, to keep costs under control.
              </p>
              <Link href="/sign-in" className={`${primaryButton} mt-4 w-full`}>
                Try it
              </Link>
            </PlanCard>
          </div>
        </div>
      </section>
    </>
  );
}

// Each band spans the full width; its content keeps the page width.
const bandContent = "mx-auto w-full max-w-5xl px-4 sm:px-6";
