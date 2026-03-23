import { redirect } from "next/navigation";
import { getSessionWithRole } from "@/lib/session-role";
import { AgentChat } from "@/app/components/agent-chat";

export default async function AgentChatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const result = await getSessionWithRole();
  if (!result || result.role !== "admin") redirect("/dashboard");
  const { slug } = await params;

  return <AgentChat slug={slug} />;
}
