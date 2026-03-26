import type { Metadata } from "next";
import { Providers } from "@/app/components/providers";
import "./globals.css";

export function generateMetadata(): Metadata {
  const host = process.env.BETTER_AUTH_URL
    ? new URL(process.env.BETTER_AUTH_URL).hostname.split(".")[0]
    : "app";
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
