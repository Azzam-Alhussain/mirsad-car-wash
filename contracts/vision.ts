import { z } from "zod";

export type VehicleSize = "small" | "medium" | "large";

export const visionEventSchema = z.object({
  phase: z.enum(["entry", "exit"]),
  trackingId: z.string().min(1).max(120),
  cameraId: z.string().min(1).max(80),
  timestamp: z.coerce.date(),
  size: z.enum(["small", "medium", "large"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
  bay: z.number().int().min(1).max(100).optional(),
  imageUrl: z.string().url().max(2048).optional(),
});

export const visionExample = {
  phase: "entry",
  trackingId: "vehicle-2048",
  cameraId: "CAM-BAY-01",
  timestamp: "2026-11-05T14:32:00+03:00",
  size: "medium",
  confidence: 0.96,
  bay: 1,
  imageUrl: "https://camera-storage.example/captures/vehicle-2048-entry.jpg",
};
