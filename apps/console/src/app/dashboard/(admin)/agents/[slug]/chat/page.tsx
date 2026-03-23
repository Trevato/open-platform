import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import { getSessionWithRole } from "@/lib/session-role";

export default async function AgentChatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const result = await getSessionWithRole();
  if (!result || result.role !== "admin") redirect("/dashboard");
  const { slug } = await params;

  // Generate a conversation ID upfront and redirect.
  // This ensures useChat always has a stable id from mount,
  // following the official AI SDK persistence pattern.
  const id = randomUUID();
  redirect(`/dashboard/agents/${slug}/chat/${id}`);
}
