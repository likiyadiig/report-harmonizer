import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Report Harmonizer",
  description:
    "Upload a multi-author Word report and get it back in one voice, with every edit as a tracked change you can review.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
