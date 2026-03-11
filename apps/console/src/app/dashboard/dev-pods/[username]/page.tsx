import { auth } from "@/auth";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import pool from "@/lib/db";
import { TerminalView } from "@/app/dashboard/[slug]/terminal/terminal-view";

export default async function DevPodTerminalPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {

  const { username } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  const result = await pool.query(
    `SELECT status, forgejo_username FROM dev_pods WHERE forgejo_username = $1`,
    [username]
  );

  if (result.rows.length === 0) {
    notFound();
  }

  const pod = result.rows[0];

  if (pod.status !== "running") {
    redirect("/dashboard/dev-pods");
  }

  return (
    <div className="terminal-page">
      <div className="terminal-header">
        <Link
          href="/dashboard/dev-pods"
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
          Dev Pods
        </Link>
        <span className="terminal-slug">{username}</span>
      </div>
      <TerminalView wsPath={`/ws/devpod?username=${username}`} />
    </div>
  );
}
