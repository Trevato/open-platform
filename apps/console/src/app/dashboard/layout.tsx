import { auth } from "@/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { UserMenu } from "@/app/components/sign-in-button";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/");
  }

  return (
    <div>
      <nav className="nav">
        <Link href="/dashboard" className="nav-brand">
          <div className="nav-brand-mark" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="1" width="4" height="4" rx="1" fill="#0f0f13" />
              <rect x="7" y="1" width="4" height="4" rx="1" fill="#0f0f13" />
              <rect x="1" y="7" width="4" height="4" rx="1" fill="#0f0f13" />
              <rect
                x="7"
                y="7"
                width="4"
                height="4"
                rx="1"
                fill="#0f0f13"
                opacity="0.4"
              />
            </svg>
          </div>
          Open Platform
        </Link>
        <UserMenu />
      </nav>
      <main>{children}</main>
    </div>
  );
}
