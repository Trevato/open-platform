import { auth } from "@/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isHosted } from "@/lib/mode";
import { AppList } from "@/app/components/app-list";

export default async function AppsPage() {
  if (isHosted) redirect("/dashboard");

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  return (
    <div className="container">
      <div className="dashboard-header">
        <h1>Apps</h1>
      </div>
      <AppList />
    </div>
  );
}
