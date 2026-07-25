import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Editorial Desk",
  description: "Evidence-led multi-brand social content operations",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
