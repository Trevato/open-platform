import type { Metadata } from "next";
import { Providers } from "@/app/components/providers";
import "./globals.css";

export function generateMetadata(): Metadata {
  let host = "app";
  try {
    if (process.env.BETTER_AUTH_URL)
      host = new URL(process.env.BETTER_AUTH_URL).hostname.split(".")[0];
  } catch {
    // malformed URL — fall back to "app"
  }
  return { title: host.charAt(0).toUpperCase() + host.slice(1) };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
