import { describe, expect, test } from "bun:test";

// Test the AppInfo ready boolean logic directly (extracted from k8s.ts)
function deriveAppStatus(ready: number, desired: number) {
  const isReady = ready >= desired && desired > 0;
  return {
    ready: isReady,
    status: isReady ? "running" : ready > 0 ? "degraded" : "stopped",
  };
}

describe("AppInfo ready derivation", () => {
  test("running when all replicas ready", () => {
    const result = deriveAppStatus(2, 2);
    expect(result.ready).toBe(true);
    expect(result.status).toBe("running");
  });

  test("degraded when some replicas ready", () => {
    const result = deriveAppStatus(1, 3);
    expect(result.ready).toBe(false);
    expect(result.status).toBe("degraded");
  });

  test("stopped when no replicas ready", () => {
    const result = deriveAppStatus(0, 2);
    expect(result.ready).toBe(false);
    expect(result.status).toBe("stopped");
  });

  test("stopped when desired is 0", () => {
    const result = deriveAppStatus(0, 0);
    expect(result.ready).toBe(false);
    expect(result.status).toBe("stopped");
  });

  test("1/1 ready = running", () => {
    const result = deriveAppStatus(1, 1);
    expect(result.ready).toBe(true);
    expect(result.status).toBe("running");
  });
});
