import type { Metadata } from "next";
import { Providers } from "@/app/components/providers";
import { Header } from "@/app/components/header";

export const metadata: Metadata = {
  title: "Arcade",
  description: "Game leaderboard platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          background: "#0f0f13",
          color: "#e2e2e8",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          minHeight: "100vh",
        }}
      >
        <Providers>
          <Header />
          {children}
        </Providers>
      </body>
    </html>
  );
}
