// Shared building blocks for every page, so the whole site looks the same.

// Button looks as class names rather than components, because the same look
// is needed on <Link>, plain <a> and <button> elements.
const buttonBase =
  "inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-center font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export const primaryButton = `${buttonBase} bg-navy text-white hover:bg-navy-hover`;

export const secondaryButton = `${buttonBase} border border-line bg-white text-navy hover:border-muted/40 hover:bg-surface`;

export const textLink = "text-accent underline underline-offset-2 hover:text-navy";

export const input =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-ink placeholder:text-muted focus-visible:border-accent";

// The card look on its own, for links that should look like a card.
export const cardSurface =
  "rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_4px_16px_rgba(15,23,42,0.06)] ring-1 ring-line/70 sm:p-6";

// A dashed box that looks like a place to drop a file.
export const dropZone =
  "rounded-xl border-2 border-dashed border-accent/40 bg-accent-soft/40 px-6 py-12 text-center hover:border-accent hover:bg-accent-soft";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`${cardSurface} ${className}`}>{children}</div>;
}

export function UploadIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="mx-auto size-10 text-accent"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
      />
    </svg>
  );
}

export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-accent-soft px-2.5 py-0.5 text-sm font-medium text-accent-strong">
      {children}
    </span>
  );
}

// The reading width used by every page except the home page.
export function PageWidth({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">{children}</div>;
}

export function PageHeading({
  children,
  intro,
}: {
  children: React.ReactNode;
  intro?: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <h1 className="text-3xl font-light tracking-tight text-navy break-words sm:text-4xl">
        {children}
      </h1>
      {intro && <p className="mt-3 text-muted">{intro}</p>}
    </div>
  );
}
