import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { visionEventSchema } from "../../contracts/vision";
import { ingestEntry, ingestExit } from "../queries/wash";

export const visionRoutes = new Hono();

function secretsMatch(received: string | undefined, expected: string) {
  if (!received) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

visionRoutes.post(
  "/events",
  bodyLimit({ maxSize: 128 * 1024, onError: (c) => c.body(null, 413) }),
  async (c) => {
    const apiKey = process.env.VISION_API_KEY?.trim();
    if (!apiKey) return c.json({ error: "Vision ingestion is not configured" }, 503);
    if (!secretsMatch(c.req.header("x-api-key"), apiKey)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const parsed = visionEventSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid vision event", issues: parsed.error.flatten() }, 400);
    const input = parsed.data;
    if (input.phase === "entry") {
      if (!input.size || input.confidence === undefined) {
        return c.json({ error: "size and confidence are required for entry events" }, 400);
      }
      const rows = await ingestEntry({
        trackingId: input.trackingId, cameraId: input.cameraId, size: input.size,
        confidence: input.confidence, bay: input.bay, timestamp: input.timestamp, imageUrl: input.imageUrl,
      });
      return c.json({ ok: true, event: rows?.[0] }, 201);
    }
    const rows = await ingestExit({ trackingId: input.trackingId, cameraId: input.cameraId, timestamp: input.timestamp, imageUrl: input.imageUrl });
    if (!rows?.[0]) return c.json({ error: "No entry event found for trackingId" }, 404);
    return c.json({ ok: true, event: rows?.[0] });
  },
);
