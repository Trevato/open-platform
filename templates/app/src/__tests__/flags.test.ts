import { describe, it, expect, mock, beforeEach } from "bun:test";

// --- Mocks must be declared before importing the modules under test ---

const mockQuery = mock(() => Promise.resolve({ rows: [], rowCount: 0 }));

mock.module("@/lib/db", () => ({
  default: { query: mockQuery },
}));

let mockFetchResponse: Response = new Response("[]", { status: 200 });

mock.module("@/lib/forgejo", () => ({
  forgejoFetch: mock(() => Promise.resolve(mockFetchResponse)),
}));

// --- Import after mocks ---

const { getUserOrgs } = await import("@/lib/forgejo-orgs");

// --- Tests ---

describe("getUserOrgs", () => {
  beforeEach(() => {
    mockFetchResponse = new Response("[]", { status: 200 });
  });

  it("returns empty array when user has no orgs", async () => {
    mockFetchResponse = new Response("[]", { status: 200 });
    const orgs = await getUserOrgs("user1");
    expect(orgs).toEqual([]);
  });

  it("returns org names from Forgejo response", async () => {
    mockFetchResponse = new Response(
      JSON.stringify([
        { username: "alpha-team", name: "Alpha Team" },
        { username: "beta-org", name: "Beta Org" },
      ]),
      { status: 200 },
    );
    const orgs = await getUserOrgs("user1");
    expect(orgs).toEqual([{ name: "alpha-team" }, { name: "beta-org" }]);
  });

  it("returns empty array on API error", async () => {
    mockFetchResponse = new Response("error", { status: 500 });
    const orgs = await getUserOrgs("user1");
    expect(orgs).toEqual([]);
  });

  it("prefers username over name field", async () => {
    mockFetchResponse = new Response(
      JSON.stringify([{ username: "org-slug", name: "Display Name" }]),
      { status: 200 },
    );
    const orgs = await getUserOrgs("user1");
    expect(orgs).toEqual([{ name: "org-slug" }]);
  });

  it("falls back to name when username is empty", async () => {
    mockFetchResponse = new Response(
      JSON.stringify([{ username: "", name: "FallbackName" }]),
      { status: 200 },
    );
    const orgs = await getUserOrgs("user1");
    expect(orgs).toEqual([{ name: "FallbackName" }]);
  });
});

describe("Flag targeting patterns", () => {
  // Test the decide() logic patterns used in flags.ts.
  // These are pure functions -- no Next.js request context needed.

  interface Entities {
    user: { id: string; name: string } | null;
    orgs: Array<{ name: string }>;
    environment: string;
  }

  const envGate = (entities: Entities | undefined) => {
    if (!entities) return false;
    return entities.environment !== "production";
  };

  const orgAllowlist =
    (allowed: string[]) => (entities: Entities | undefined) => {
      if (!entities) return false;
      return entities.orgs.some((o) => allowed.includes(o.name));
    };

  const userAllowlist =
    (allowed: string[]) => (entities: Entities | undefined) => {
      if (!entities) return false;
      return allowed.includes(entities.user?.name ?? "");
    };

  const authOnly = (entities: Entities | undefined) => {
    if (!entities) return false;
    return entities.user !== null;
  };

  describe("environment gate", () => {
    it("true in development", () => {
      expect(
        envGate({ user: null, orgs: [], environment: "development" }),
      ).toBe(true);
    });

    it("true in preview", () => {
      expect(envGate({ user: null, orgs: [], environment: "preview" })).toBe(
        true,
      );
    });

    it("false in production", () => {
      expect(envGate({ user: null, orgs: [], environment: "production" })).toBe(
        false,
      );
    });

    it("false when no entities", () => {
      expect(envGate(undefined)).toBe(false);
    });
  });

  describe("org allowlist", () => {
    const check = orgAllowlist(["beta-org"]);

    it("true when user in allowed org", () => {
      expect(
        check({
          user: { id: "1", name: "dev" },
          orgs: [{ name: "beta-org" }],
          environment: "production",
        }),
      ).toBe(true);
    });

    it("false when user not in allowed org", () => {
      expect(
        check({
          user: { id: "1", name: "dev" },
          orgs: [{ name: "other-org" }],
          environment: "production",
        }),
      ).toBe(false);
    });

    it("false for anonymous user", () => {
      expect(check({ user: null, orgs: [], environment: "production" })).toBe(
        false,
      );
    });
  });

  describe("user allowlist", () => {
    const check = userAllowlist(["alice", "bob"]);

    it("true for allowed user", () => {
      expect(
        check({
          user: { id: "1", name: "alice" },
          orgs: [],
          environment: "production",
        }),
      ).toBe(true);
    });

    it("false for unlisted user", () => {
      expect(
        check({
          user: { id: "2", name: "charlie" },
          orgs: [],
          environment: "production",
        }),
      ).toBe(false);
    });
  });

  describe("authenticated only", () => {
    it("true for authenticated user", () => {
      expect(
        authOnly({
          user: { id: "1", name: "dev" },
          orgs: [],
          environment: "production",
        }),
      ).toBe(true);
    });

    it("false for anonymous", () => {
      expect(
        authOnly({ user: null, orgs: [], environment: "production" }),
      ).toBe(false);
    });
  });
});
