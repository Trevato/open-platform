import { auth } from "@/auth";
import { headers } from "next/headers";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Extend session on every navigation
  await auth.api.getSession({ headers: await headers() });
  return <>{children}</>;
}
