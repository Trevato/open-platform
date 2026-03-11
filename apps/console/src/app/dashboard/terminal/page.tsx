import { auth } from "@/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { isHosted } from "@/lib/mode";
import { TerminalView } from "@/app/dashboard/[slug]/terminal/terminal-view";

export default async function PlatformTerminalPage() {
  if (isHosted) {
    redirect("/dashboard");
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/");
  }

  return (
    <div className="terminal-page">
      <div className="terminal-header">
        <Link
          href="/dashboard"
          className="text-sm text-muted"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            transition: "color 0.15s",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Dashboard
        </Link>
        <span className="terminal-slug">cluster</span>
      </div>
      <TerminalView />
    </div>
  );
}
