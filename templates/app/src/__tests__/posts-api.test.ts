import { describe, it, expect, mock, beforeEach } from "bun:test";

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
    expect(body.error).toBe("Unauthorized");
  });

  it("rejects invalid JSON with 400", async () => {
    mockSession = testSession;
    const res = await createPost(postRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid JSON");
  });

  it("rejects empty title with 400", async () => {
    mockSession = testSession;
    const res = await createPost(postRequest({ title: "", content: "body" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Title required");
  });

  it("rejects title > 200 chars with 400", async () => {
    mockSession = testSession;
    const res = await createPost(
      postRequest({ title: "x".repeat(201), content: "body" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Title too long");
  });

  it("rejects content > 10000 chars with 400", async () => {
    mockSession = testSession;
    const res = await createPost(
      postRequest({ title: "Valid", content: "x".repeat(10001) }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Content too long");
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
    expect(body.id).toBe("new-id");

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
    mockQuery.mockImplementation(() =>
      Promise.resolve({
        rows: [
          {
            id: "1",
            title: "Post",
            content: "Body",
            created_at: "2026-01-01",
            author: "Alice",
            author_image: null,
          },
        ],
        rowCount: 1,
      }),
    );
    const res = await listPosts();
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).not.toHaveProperty("author_id");
    // The SELECT clause should not expose author_id — it's used in JOIN but not returned
    const [sql] = mockQuery.mock.calls[0] as [string];
    const selectClause = sql.slice(0, sql.indexOf("FROM"));
    expect(selectClause).not.toContain("author_id");
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
    expect((await res.json()).error).toBe("Forbidden");
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
    expect((await res.json()).error).toBe("Title required");
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
    expect((await res.json()).error).toContain("Title too long");
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
    expect(body).not.toHaveProperty("author_id");
    // The SELECT clause should not expose author_id
    const [sql] = mockQuery.mock.calls[0] as [string];
    const selectClause = sql.slice(0, sql.indexOf("FROM"));
    expect(selectClause).not.toContain("author_id");
  });
});
