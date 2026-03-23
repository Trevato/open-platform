import { streamText, UIMessage, convertToModelMessages, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createMCPClient } from "@ai-sdk/mcp";
import { opApiGet } from "@/lib/op-api";
import { auth } from "@/auth";
import { headers } from "next/headers";
import pool from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const OP_API_URL =
  process.env.OP_API_URL || "http://op-api.op-system-op-api.svc:80";

type Params = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: Params) {
  const { slug } = await params;

  let mcpClient: Awaited<ReturnType<typeof createMCPClient>> | null = null;

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const userId = session.user.id;

    const body = await request.json();
    const messages: UIMessage[] = body.messages ?? [];
    const chatId: string | undefined = body.chatId;

    // Fetch agent config including the internal token
    const data = await opApiGet(
      `/api/v1/agents/${encodeURIComponent(slug)}?internal=true`,
    );
    const agent = data.agent;

    // Connect to the MCP server using the agent's Forgejo PAT
    mcpClient = await createMCPClient({
      transport: {
        type: "http",
        url: `${OP_API_URL}/mcp`,
        headers: { Authorization: `Bearer ${agent.forgejo_token}` },
      },
    });

    const tools = await mcpClient.tools();

    const result = streamText({
      model: anthropic(agent.model || "claude-sonnet-4-6"),
      system:
        agent.instructions ||
        `You are ${agent.name}, an AI agent on the Open Platform. You have access to Forgejo tools for managing repositories, issues, and pull requests.`,
      messages: await convertToModelMessages(messages),
      tools,
      ...(agent.allowed_tools?.length
        ? { experimental_activeTools: agent.allowed_tools }
        : {}),
      stopWhen: stepCountIs(agent.max_steps || 25),
    });

    // Ensure onFinish fires even if client disconnects
    result.consumeStream();

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      onFinish: async ({ messages: allMessages }) => {
        // Persist messages to conversation (upsert — creates on first message)
        if (chatId && userId) {
          const title = allMessages.find((m) => m.role === "user");
          const titleText = title?.parts
            ?.filter(
              (p): p is { type: "text"; text: string } => p.type === "text",
            )
            .map((p) => p.text)
            .join(" ")
            .slice(0, 80);

          await pool.query(
            `INSERT INTO conversations (id, agent_slug, user_id, title, messages, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (id) DO UPDATE SET
               messages = EXCLUDED.messages,
               title = COALESCE(conversations.title, EXCLUDED.title),
               updated_at = NOW()`,
            [
              chatId,
              slug,
              userId,
              titleText || null,
              JSON.stringify(allMessages),
            ],
          );
        }

        // Clean up MCP client
        if (mcpClient) {
          await mcpClient.close().catch(() => {});
        }
      },
    });
  } catch (e: unknown) {
    if (mcpClient) {
      await mcpClient.close().catch(() => {});
    }

    const message = e instanceof Error ? e.message : "Unknown error";
    if (message === "Not authenticated") {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const match = message.match(/op-api (\d{3}):/);
    const status = match ? parseInt(match[1]) : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
