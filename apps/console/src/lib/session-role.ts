import { auth } from "@/auth";
import { headers } from "next/headers";
import { checkIsAdmin } from "./roles";

export type UserRole = "admin" | "user";

export async function getSessionWithRole() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const role: UserRole = (await checkIsAdmin(session.user.name)) ? "admin" : "user";
  return { session, role };
}
