import { describe, it, expect, mock, beforeEach } from "bun:test";
import { NextRequest } from "next/server";

// --- Mocks must be declared before importing the modules under test ---

const mockQuery = mock(() => Promise.resolve({ rows: [], rowCount: 0 }));

mock.module("@/lib/db", () => ({
  default: { query: mockQuery },
}));

mock.module("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}));

let mockSession: { user: { id: string; name: string } } | null = null;

mock.module("@/auth", () => ({
  auth: {
    api: {
      getSession: mock(() => Promise.resolve(mockSession)),
    },
  },
}));

// --- Now import route handlers ---

const { GET: listPosts, POST: createPost } =
  await import("@/app/api/posts/route");
const {
  GET: getPost,
  PATCH: updatePost,
  DELETE: deletePost,
} = await import("@/app/api/posts/[id]/route");

// --- Helpers ---

function listRequest(params?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/posts");
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return new NextRequest(url);
}

function postRequest(body?: unknown): Request {
  if (body === undefined) {
    return new Request("http://localhost/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json{{{",
    });
  }
  return new Request("http://localhost/api/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchRequest(body?: unknown): Request {
  if (body === undefined) {
    return new Request("http://localhost/api/posts/test-id", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not json{{{",
    });
  }
  return new Request("http://localhost/api/posts/test-id", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const idParams = { params: Promise.resolve({ id: "test-uuid" }) };

const testSession = { user: { id: "user-1", name: "Alice" } };

// --- Tests ---

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(() =>
    Promise.resolve({ rows: [], rowCount: 0 }),
  );
  mockSession = null;
});

describe("POST /api/posts", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const res = await createPost(postRequest({ title: "Hello" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe("Unauthorized");
  });

  it("rejects invalid JSON with 400", async () => {
    mockSession = testSession;
    const res = await createPost(postRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toBe("Invalid JSON");
  });

  it("rejects empty title with 400", async () => {
    mockSession = testSession;
    const res = await createPost(postRequest({ title: "", content: "body" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe("Title required");
  });

  it("rejects title > 200 chars with 400", async () => {
    mockSession = testSession;
    const res = await createPost(
      postRequest({ title: "x".repeat(201), content: "body" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain("Title too long");
  });

  it("rejects content > 10000 chars with 400", async () => {
    mockSession = testSession;
    const res = await createPost(
      postRequest({ title: "Valid", content: "x".repeat(10001) }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain("Content too long");
  });

  it("inserts with parameterized query and returns 201", async () => {
    mockSession = testSession;
    mockQuery.mockImplementation(() =>
      Promise.resolve({ rows: [{ id: "new-id" }], rowCount: 1 }),
    );
    const res = await createPost(
      postRequest({ title: "Hello World", content: "Some content" }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe("new-id");

    // Verify parameterized query — SQL must use $1/$2/$3 placeholders
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("$1");
    expect(sql).toContain("$2");
    expect(sql).toContain("$3");
    expect(params).toEqual(["Hello World", "Some content", "user-1"]);
  });
});

describe("GET /api/posts", () => {
  it("returns only public fields (no author_id)", async () => {
    // Count query
    mockQuery.mockImplementationOnce(() =>
      Promise.resolve({ rows: [{ count: 1 }], rowCount: 1 }),
    );
    // Select query
    mockQuery.mockImplementationOnce(() =>
      Promise.resolve({
        rows: [
          {
            id: "1",
            title: "Post",
            content: "Body",
            published: true,
            created_at: "2026-01-01",
            author: "Alice",
            author_image: null,
          },
        ],
        rowCount: 1,
      }),
    );
    const res = await listPosts(listRequest());
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).not.toHaveProperty("author_id");
    expect(body.meta).toEqual({ total: 1, limit: 20, offset: 0 });
    // The SELECT clause should not expose author_id — it's used in JOIN but not returned
    const [, [selectSql]] = [mockQuery.mock.calls[0], mockQuery.mock.calls[1]];
    const selectClause = (selectSql as string).slice(
      0,
      (selectSql as string).indexOf("FROM"),
    );
    expect(selectClause).not.toContain("author_id");
  });

  it("filters by search query with ILIKE", async () => {
    mockQuery.mockImplementationOnce(() =>
      Promise.resolve({ rows: [{ count: 0 }], rowCount: 1 }),
    );
    mockQuery.mockImplementationOnce(() =>
      Promise.resolve({ rows: [], rowCount: 0 }),
    );
    await listPosts(listRequest({ q: "hello" }));

    // Both count and select queries should contain ILIKE
    const [countSql, countParams] = mockQuery.mock.calls[0] as [
      string,
      unknown[],
    ];
    expect(countSql).toContain("ILIKE");
    expect(countParams).toContain("%hello%");

    const [selectSql, selectParams] = mockQuery.mock.calls[1] as [
      string,
      unknown[],
    ];
    expect(selectSql).toContain("ILIKE");
    expect(selectParams[0]).toBe("%hello%");
  });

  it("returns all posts when status=all (no published filter)", async () => {
    mockQuery.mockImplementationOnce(() =>
      Promise.resolve({ rows: [{ count: 0 }], rowCount: 1 }),
    );
    mockQuery.mockImplementationOnce(() =>
      Promise.resolve({ rows: [], rowCount: 0 }),
    );
    await listPosts(listRequest({ status: "all" }));

    const [countSql] = mockQuery.mock.calls[0] as [string];
    expect(countSql).not.toContain("published");
  });

  it("calculates correct offset for page=2", async () => {
    mockQuery.mockImplementationOnce(() =>
      Promise.resolve({ rows: [{ count: 25 }], rowCount: 1 }),
    );
    mockQuery.mockImplementationOnce(() =>
      Promise.resolve({ rows: [], rowCount: 0 }),
    );
    const res = await listPosts(listRequest({ page: "2" }));
    const body = await res.json();

    expect(body.meta.offset).toBe(20);
    // Select query params should include offset=20
    const [, selectParams] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(selectParams).toContain(20);
  });
});

describe("PATCH /api/posts/:id", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const res = await updatePost(patchRequest({ title: "New" }), idParams);
    expect(res.status).toBe(401);
  });

  it("rejects wrong owner with 403", async () => {
    mockSession = testSession;
    mockQuery.mockImplementation(() =>
      Promise.resolve({
        rows: [{ author_id: "other-user" }],
        rowCount: 1,
      }),
    );
    const res = await updatePost(patchRequest({ title: "New" }), idParams);
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toBe("Forbidden");
  });

  it("rejects empty string title with 400", async () => {
    mockSession = testSession;
    mockQuery.mockImplementation(() =>
      Promise.resolve({
        rows: [{ author_id: "user-1" }],
        rowCount: 1,
      }),
    );
    const res = await updatePost(patchRequest({ title: "" }), idParams);
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe("Title required");
  });

  it("rejects title > 200 chars with 400", async () => {
    mockSession = testSession;
    mockQuery.mockImplementation(() =>
      Promise.resolve({
        rows: [{ author_id: "user-1" }],
        rowCount: 1,
      }),
    );
    const res = await updatePost(
      patchRequest({ title: "x".repeat(201) }),
      idParams,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain("Title too long");
  });
});

describe("DELETE /api/posts/:id", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const res = await deletePost(
      new Request("http://localhost/api/posts/test-uuid", {
        method: "DELETE",
      }),
      idParams,
    );
    expect(res.status).toBe(401);
  });

  it("rejects wrong owner with 403", async () => {
    mockSession = testSession;
    mockQuery.mockImplementation(() =>
      Promise.resolve({
        rows: [{ author_id: "other-user" }],
        rowCount: 1,
      }),
    );
    const res = await deletePost(
      new Request("http://localhost/api/posts/test-uuid", {
        method: "DELETE",
      }),
      idParams,
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toBe("Forbidden");
  });
});

describe("GET /api/posts/:id", () => {
  it("returns only expected fields (no author_id leakage)", async () => {
    mockQuery.mockImplementation(() =>
      Promise.resolve({
        rows: [
          {
            id: "1",
            title: "Post",
            content: "Body",
            published: true,
            created_at: "2026-01-01",
            author: "Alice",
            author_image: null,
          },
        ],
        rowCount: 1,
      }),
    );
    const res = await getPost(
      new Request("http://localhost/api/posts/1"),
      idParams,
    );
    const body = await res.json();
    expect(body.data).not.toHaveProperty("author_id");
    // The SELECT clause should not expose author_id
    const [sql] = mockQuery.mock.calls[0] as [string];
    const selectClause = sql.slice(0, sql.indexOf("FROM"));
    expect(selectClause).not.toContain("author_id");
  });

  it("returns 404 for missing post", async () => {
    mockQuery.mockImplementation(() =>
      Promise.resolve({ rows: [], rowCount: 0 }),
    );
    const res = await getPost(
      new Request("http://localhost/api/posts/missing"),
      idParams,
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toBe("Not found");
  });
});
