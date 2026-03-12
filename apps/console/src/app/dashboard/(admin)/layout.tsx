import { redirect } from "next/navigation";
import { getSessionWithRole } from "@/lib/session-role";
import { PlatformNav } from "@/app/components/platform-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const result = await getSessionWithRole();
  if (!result || result.role !== "admin") redirect("/dashboard");

  return (
    <div className="dashboard-body">
      <PlatformNav />
      <main className="dashboard-main">{children}</main>
    </div>
  );
}
