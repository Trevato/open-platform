import { describe, it, expect, mock, beforeEach } from "bun:test";

// --- Mocks must be declared before importing the module under test ---

const mockQuery = mock(() => Promise.resolve({ rows: [], rowCount: 0 }));

mock.module("@/lib/db", () => ({
  default: { query: mockQuery },
}));

// --- Now import route handler ---

const { GET } = await import("@/app/api/health/route");

// --- Tests ---

beforeEach(() => {
  mockQuery.mockReset();
});

describe("GET /api/health", () => {
  it("returns 200 with { status: 'ok' } when DB is healthy", async () => {
    mockQuery.mockImplementation(() =>
      Promise.resolve({ rows: [{ "?column?": 1 }], rowCount: 1 }),
    );
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });

  it("returns 503 with { status: 'error' } when DB query throws", async () => {
    mockQuery.mockImplementation(() =>
      Promise.reject(new Error("connection refused")),
    );
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ status: "error" });
  });
});
