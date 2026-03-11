import { auth } from "@/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isHosted } from "@/lib/mode";
import { UserList } from "@/app/components/user-list";

export default async function UsersPage() {
  if (isHosted) redirect("/dashboard");

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  return (
    <div className="container">
      <div className="dashboard-header">
        <h1>Users</h1>
      </div>
      <UserList />
    </div>
  );
}
