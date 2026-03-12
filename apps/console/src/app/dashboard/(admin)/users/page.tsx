import { redirect } from "next/navigation";
import { getSessionWithRole } from "@/lib/session-role";
import { UserList } from "@/app/components/user-list";

export default async function UsersPage() {
  const result = await getSessionWithRole();
  if (!result || result.role !== "admin") redirect("/dashboard");

  return (
    <div className="container">
      <div className="dashboard-header">
        <h1>Users</h1>
      </div>
      <UserList />
    </div>
  );
}
