import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getInstanceAccess } from "@/lib/instance-access";
import { TerminalView } from "./terminal-view";

export default async function TerminalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const access = await getInstanceAccess(slug);

  if (!access) {
    notFound();
  }

  const instance = access.instance;

  if (instance.status !== "ready") {
    redirect(`/dashboard/${slug}`);
  }

  return (
    <div className="terminal-page">
      <div className="terminal-header">
        <Link
          href={`/dashboard/${slug}`}
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
          {instance.display_name}
        </Link>
        <span className="terminal-slug">{slug}</span>
      </div>
      <TerminalView slug={slug} />
    </div>
  );
}
