import {
  describe,
  expect,
  test,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  mock,
} from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { AuthenticatedUser } from "../auth.js";

// ── Environment setup ─────────────────────────────────────────────────

process.env.FORGEJO_URL = "http://forgejo.test";
process.env.FORGEJO_INTERNAL_URL = "http://forgejo-internal.test";
process.env.WOODPECKER_INTERNAL_URL = "http://woodpecker.test";
process.env.PLATFORM_DOMAIN = "test.local";

const testUser: AuthenticatedUser = {
  login: "testuser",
  email: "test@example.com",
  fullName: "Test User",
  isAdmin: false,
  avatarUrl: "",
  token: "test-token-123",
  id: 1,
};

const adminUser: AuthenticatedUser = {
  login: "admin",
  email: "admin@example.com",
  fullName: "Admin User",
  isAdmin: true,
  avatarUrl: "",
  token: "admin-token-456",
  id: 2,
};

// ── Fetch mock infrastructure ─────────────────────────────────────────

const originalFetch = globalThis.fetch;
let fetchMock: ReturnType<typeof mock>;

function mockFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  fetchMock = mock(handler as (...args: unknown[]) => unknown);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

// Default fetch mock: returns 404 for system org membership (non-admin),
// and empty arrays for list endpoints.
function defaultFetchHandler(url: string, init?: RequestInit): Response {
  const urlStr = String(url);

  // isSystemOrgMember check — return 404 (not a member)
  if (urlStr.includes("/api/v1/orgs/system/members/")) {
    return new Response(null, { status: 404 });
  }

  // list_orgs
  if (urlStr.includes("/api/v1/user/orgs")) {
    return jsonResponse([]);
  }

  // list_repos
  if (urlStr.match(/\/api\/v1\/orgs\/[^/]+\/repos/)) {
    return jsonResponse([]);
  }

  // get_repo
  if (
    urlStr.match(/\/api\/v1\/repos\/[^/]+\/[^/]+$/) &&
    (!init?.method || init.method === "GET")
  ) {
    return new Response(JSON.stringify({ message: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // admin users endpoint
  if (urlStr.includes("/api/v1/admin/users")) {
    return new Response(JSON.stringify({ message: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // create org
  if (urlStr.includes("/api/v1/orgs") && init?.method === "POST") {
    return jsonResponse({ name: "test-org" }, 201);
  }

  // Default: 404
  return new Response(JSON.stringify({ message: "Not Found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── MCP client/server helper ──────────────────────────────────────────

async function createTestClient(user: AuthenticatedUser): Promise<{
  client: Client;
  cleanup: () => Promise<void>;
}> {
  const { createMcpServer } = await import("../mcp/server.js");
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  const server = createMcpServer(user);
  await server.connect(serverTransport);

  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);

  return {
    client,
    cleanup: async () => {
      await client.close();
      await server.close();
    },
  };
}

// ── Tool catalog ──────────────────────────────────────────────────────

describe("MCP tool catalog", () => {
  beforeEach(() => mockFetch(defaultFetchHandler));
  afterEach(() => restoreFetch());

  test("createMcpServer registers expected tool count", async () => {
    const { client, cleanup } = await createTestClient(testUser);
    try {
      const { tools } = await client.listTools();
      expect(tools.length).toBe(64);
    } finally {
      await cleanup();
    }
  });

  test("expected tool names are present", async () => {
    const { client, cleanup } = await createTestClient(testUser);
    try {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);

      expect(names).toContain("whoami");
      expect(names).toContain("list_repos");
      expect(names).toContain("create_org");
      expect(names).toContain("list_platform_services");
      expect(names).toContain("list_orgs");
      expect(names).toContain("get_repo");
      expect(names).toContain("create_pr");
      expect(names).toContain("list_issues");
      expect(names).toContain("list_apps");
      expect(names).toContain("list_agents");
    } finally {
      await cleanup();
    }
  });
});

// ── Admin enforcement ─────────────────────────────────────────────────

describe("MCP admin tool enforcement", () => {
  beforeEach(() => mockFetch(defaultFetchHandler));
  afterEach(() => restoreFetch());

  test("create_org with non-admin returns admin required", async () => {
    const { client, cleanup } = await createTestClient(testUser);
    try {
      const result = await client.callTool({
        name: "create_org",
        arguments: { name: "test-org" },
      });
      const text = (result.content as Array<{ text: string }>)[0].text;
      const parsed = JSON.parse(text);
      expect(parsed.error).toBe("Admin access required");
    } finally {
      await cleanup();
    }
  });

  test("list_platform_services with non-admin returns admin required", async () => {
    const { client, cleanup } = await createTestClient(testUser);
    try {
      const result = await client.callTool({
        name: "list_platform_services",
        arguments: {},
      });
      const text = (result.content as Array<{ text: string }>)[0].text;
      const parsed = JSON.parse(text);
      expect(parsed.error).toBe("Admin access required");
    } finally {
      await cleanup();
    }
  });

  test("create_platform_user with non-admin returns admin required", async () => {
    const { client, cleanup } = await createTestClient(testUser);
    try {
      const result = await client.callTool({
        name: "create_platform_user",
        arguments: { username: "newuser", email: "new@example.com" },
      });
      const text = (result.content as Array<{ text: string }>)[0].text;
      const parsed = JSON.parse(text);
      expect(parsed.error).toBe("Admin access required");
    } finally {
      await cleanup();
    }
  });

  test("create_platform_app with non-admin returns admin required", async () => {
    const { client, cleanup } = await createTestClient(testUser);
    try {
      const result = await client.callTool({
        name: "create_platform_app",
        arguments: { org: "system", name: "test-app" },
      });
      const text = (result.content as Array<{ text: string }>)[0].text;
      const parsed = JSON.parse(text);
      expect(parsed.error).toBe("Admin access required");
    } finally {
      await cleanup();
    }
  });
});

// ── User tools ────────────────────────────────────────────────────────

describe("MCP user tools", () => {
  beforeEach(() => mockFetch(defaultFetchHandler));
  afterEach(() => restoreFetch());

  test("whoami returns authenticated user info", async () => {
    const { client, cleanup } = await createTestClient(testUser);
    try {
      const result = await client.callTool({
        name: "whoami",
        arguments: {},
      });
      const text = (result.content as Array<{ text: string }>)[0].text;
      const parsed = JSON.parse(text);
      expect(parsed.login).toBe("testuser");
      expect(parsed.email).toBe("test@example.com");
      expect(parsed.isAdmin).toBe(false);
    } finally {
      await cleanup();
    }
  });

  test("list_orgs returns parsed org list from Forgejo", async () => {
    mockFetch((url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/v1/user/orgs")) {
        return jsonResponse([
          { name: "org1", description: "First org", full_name: "org1" },
          { name: "org2", description: "Second org", full_name: "org2" },
        ]);
      }
      return defaultFetchHandler(url);
    });

    const { client, cleanup } = await createTestClient(testUser);
    try {
      const result = await client.callTool({
        name: "list_orgs",
        arguments: {},
      });
      const text = (result.content as Array<{ text: string }>)[0].text;
      const parsed = JSON.parse(text);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);
      expect(parsed[0].name).toBe("org1");
      expect(parsed[1].name).toBe("org2");
    } finally {
      await cleanup();
    }
  });
});

// ── Error handling ────────────────────────────────────────────────────

describe("MCP error handling", () => {
  beforeEach(() => mockFetch(defaultFetchHandler));
  afterEach(() => restoreFetch());

  test("tool calling Forgejo that returns 404 propagates error", async () => {
    mockFetch((url: string, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.match(/\/api\/v1\/repos\/[^/]+\/[^/]+$/)) {
        return new Response("repository not found", {
          status: 404,
          headers: { "Content-Type": "text/plain" },
        });
      }
      return defaultFetchHandler(url, init);
    });

    const { client, cleanup } = await createTestClient(testUser);
    try {
      const result = await client.callTool({
        name: "get_repo",
        arguments: { org: "nonexistent", repo: "nope" },
      });
      // The ForgejoClient throws on non-ok, which should be caught and returned as error content
      const text = (result.content as Array<{ text: string }>)[0].text;
      expect(text).toContain("404");
    } finally {
      await cleanup();
    }
  });

  test("get_repo for nonexistent repo returns error", async () => {
    const { client, cleanup } = await createTestClient(testUser);
    try {
      const result = await client.callTool({
        name: "get_repo",
        arguments: { org: "ghost", repo: "missing" },
      });
      const text = (result.content as Array<{ text: string }>)[0].text;
      expect(text).toContain("404");
    } finally {
      await cleanup();
    }
  });

  test("list_repos with Forgejo failure propagates error", async () => {
    mockFetch((url: string) => {
      const urlStr = String(url);
      if (urlStr.match(/\/api\/v1\/orgs\/[^/]+\/repos/)) {
        return new Response("Internal Server Error", {
          status: 500,
          headers: { "Content-Type": "text/plain" },
        });
      }
      return defaultFetchHandler(url);
    });

    const { client, cleanup } = await createTestClient(testUser);
    try {
      const result = await client.callTool({
        name: "list_repos",
        arguments: { org: "broken-org" },
      });
      const text = (result.content as Array<{ text: string }>)[0].text;
      expect(text).toContain("500");
    } finally {
      await cleanup();
    }
  });

  test("tool with missing required argument returns error", async () => {
    const { client, cleanup } = await createTestClient(testUser);
    try {
      // list_repos requires "org" — omit it
      const result = await client.callTool({
        name: "list_repos",
        arguments: {},
      });
      // SDK validates zod schema server-side and returns an error result
      expect(result.isError).toBe(true);
    } finally {
      await cleanup();
    }
  });
});
