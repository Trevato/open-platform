import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { headers } from "next/headers";
import pool from "@/lib/db";
import { AgentChat } from "@/app/components/agent-chat";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ slug: string; conversationId: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  const { slug, conversationId } = await params;

  // Load existing conversation if it exists (may be a fresh ID with no DB row yet)
  const result = await pool.query(
    `SELECT messages FROM conversations WHERE id = $1 AND user_id = $2 AND agent_slug = $3`,
    [conversationId, session.user.id, slug],
  );

  const messages = result.rows[0]?.messages ?? [];

  return (
    <AgentChat
      slug={slug}
      conversationId={conversationId}
      initialMessages={messages}
    />
  );
}
