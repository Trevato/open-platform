import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { opApiGet } from "@/lib/op-api";
import { TerminalView } from "@/app/dashboard/[slug]/terminal/terminal-view";

export default async function InstanceDevPodTerminalPage({
  params,
}: {
  params: Promise<{ slug: string; username: string }>;
}) {
  const { slug, username } = await params;

  try {
    await opApiGet(`/api/v1/instances/${encodeURIComponent(slug)}`);
  } catch {
    notFound();
  }

  let pod;
  try {
    pod = await opApiGet(
      `/api/v1/instances/${encodeURIComponent(slug)}/dev-pods/${encodeURIComponent(username)}`
    );
  } catch {
    notFound();
  }

  if (pod.status !== "running") redirect(`/dashboard/${slug}/dev-pods`);

  return (
    <div className="terminal-page">
      <div className="terminal-header">
        <Link
          href={`/dashboard/${slug}/dev-pods`}
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
      <TerminalView wsPath={`/ws/devpod?username=${username}&slug=${slug}`} />
    </div>
  );
}
