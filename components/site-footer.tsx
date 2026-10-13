import Link from "next/link";

const EMAIL = "contact@malikstefan.com";

export function SiteFooter() {
  return (
    <footer className="border-t border-line/70">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link href="/terms" className="hover:text-navy hover:underline">
          Refund policy and terms
        </Link>
        <a href={`mailto:${EMAIL}`} className="break-all hover:text-navy hover:underline">
          {EMAIL}
        </a>
        <p>Made in Denmark</p>
      </div>
    </footer>
  );
}
