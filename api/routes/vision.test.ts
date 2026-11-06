import { afterEach, describe, expect, it } from "vitest";
import { visionRoutes } from "./vision";

const originalKey = process.env.VISION_API_KEY;
afterEach(() => {
  if (originalKey === undefined) delete process.env.VISION_API_KEY;
  else process.env.VISION_API_KEY = originalKey;
});

describe("vision ingestion authentication", () => {
  it("fails closed when no server key is configured", async () => {
    delete process.env.VISION_API_KEY;
    const response = await visionRoutes.request("/events", { method: "POST", body: "{}" });
    expect(response.status).toBe(503);
  });

  it("rejects missing and incorrect credentials before parsing or database access", async () => {
    process.env.VISION_API_KEY = "test-secret";
    for (const key of [undefined, "wrong-secret"]) {
      const response = await visionRoutes.request("/events", {
        method: "POST",
        headers: key ? { "x-api-key": key } : {},
        body: "{}",
      });
      expect(response.status).toBe(401);
    }
  });

  it("validates an authenticated payload", async () => {
    process.env.VISION_API_KEY = "test-secret";
    const response = await visionRoutes.request("/events", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "test-secret" },
      body: "{}",
    });
    expect(response.status).toBe(400);
  });
});
