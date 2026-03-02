import type { Metadata } from "next";
import { Providers } from "@/app/components/providers";

export const metadata: Metadata = {
  title: "PROJECT_NAME",
};

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
