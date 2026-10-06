"use client";

import { useId } from "react";

const LOCALE = "en-GB";
const OPTIONS: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

// Shows a time in the viewer's own time zone, e.g. "6 Oct 2026, 16:32".
// The server only knows its own time zone (UTC), so it renders that first;
// the inline script then rewrites the text while the browser is still
// reading the HTML, before anything is painted, so the UTC time never
// shows. suppressHydrationWarning tells React the different text is on
// purpose and to keep it. On a <Link> navigation or an auto-refresh, the
// script doesn't run, but this component then renders in the browser and
// formats the time there. See the Next.js guide "preventing flash before
// hydration" in node_modules/next/dist/docs/01-app/02-guides.
export function LocalTime({ date }: { date: string }) {
  const id = useId();
  return (
    <>
      <time id={id} dateTime={date} suppressHydrationWarning>
        {new Date(date).toLocaleString(LOCALE, OPTIONS)}
      </time>
      <InlineScript
        html={`{var n=document.getElementById(${JSON.stringify(id)});if(n)n.textContent=new Date(${JSON.stringify(date)}).toLocaleString(${JSON.stringify(LOCALE)},${JSON.stringify(OPTIONS)})}`}
      />
    </>
  );
}

// React warns about rendering a <script> in the browser. Marking it
// text/plain there means it is never run twice; the type mismatch is
// covered by suppressHydrationWarning.
function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
