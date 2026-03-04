import type { Metadata } from "next";
import { Providers } from "@/app/components/providers";

export const metadata: Metadata = {
  title: "hub",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0f0f13", color: "#e0e0f0" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
