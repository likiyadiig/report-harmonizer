import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ErrorPage from "@/app/error";

describe("ErrorPage", () => {
  const error = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), {
    digest: "4242424242",
  });
  // Next.js passes the error too. The page must not show any of it.
  const props = { error, retry: () => {} } as Parameters<typeof ErrorPage>[0];
  const html = renderToStaticMarkup(<ErrorPage {...props} />);

  it("shows a friendly message and no error details", () => {
    expect(html).toContain("Something went wrong on our side. Please try again in a minute.");
    expect(html).not.toContain(error.message);
    expect(html).not.toContain(error.digest);
    expect(html).not.toContain("ECONNREFUSED");
  });
});
