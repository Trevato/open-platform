import { describe, expect, test } from "bun:test";

// Test the sanitize function logic (extracted from instances.ts)
function sanitize({
  admin_password,
  kubeconfig,
  cluster_ip,
  ...safe
}: Record<string, unknown>) {
  return safe;
}

describe("sanitize", () => {
  test("strips admin_password, kubeconfig, cluster_ip", () => {
    const input = {
      id: 1,
      slug: "test",
      status: "ready",
      admin_password: "secret123",
      kubeconfig: "apiVersion: v1...",
      cluster_ip: "10.0.0.1",
      display_name: "Test",
    };

    const result = sanitize(input);

    expect(result).toEqual({
      id: 1,
      slug: "test",
      status: "ready",
      display_name: "Test",
    });

    expect("admin_password" in result).toBe(false);
    expect("kubeconfig" in result).toBe(false);
    expect("cluster_ip" in result).toBe(false);
  });

  test("handles object without sensitive fields", () => {
    const input = { id: 2, slug: "clean" };
    const result = sanitize(input);
    expect(result).toEqual({ id: 2, slug: "clean" });
  });
});

// Test slug validation regex (from instance.ts)
describe("slug validation", () => {
  const slugRegex = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/;

  test("valid slugs", () => {
    expect(slugRegex.test("my-instance")).toBe(true);
    expect(slugRegex.test("a1b")).toBe(true);
    expect(slugRegex.test("test-123-abc")).toBe(true);
  });

  test("invalid slugs", () => {
    expect(slugRegex.test("")).toBe(false);
    expect(slugRegex.test("A")).toBe(false);
    expect(slugRegex.test("-bad")).toBe(false);
    expect(slugRegex.test("bad-")).toBe(false);
    expect(slugRegex.test("a")).toBe(false); // too short
    expect(slugRegex.test("has space")).toBe(false);
    expect(slugRegex.test("UPPER")).toBe(false);
  });
});
