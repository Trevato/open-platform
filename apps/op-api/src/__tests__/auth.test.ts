import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { authPlugin } from "../auth.js";

describe("authPlugin", () => {
  const app = new Elysia()
    .use(authPlugin)
    .get("/test", ({ user }) => ({ login: user.login }));

  test("returns 401 when no Bearer token", async () => {
    const res = await app.handle(new Request("http://localhost/test"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("Missing");
  });

  test("returns 401 for invalid token", async () => {
    const res = await app.handle(
      new Request("http://localhost/test", {
        headers: { Authorization: "Bearer invalid-token-12345" },
      }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("Invalid");
  });
});
