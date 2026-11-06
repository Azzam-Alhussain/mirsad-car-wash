import { desc, eq } from "drizzle-orm";
import { appSettings, washEvents } from "@db/schema";
import type { VehicleSize } from "../../contracts/vision";
import { getDb } from "./connection";

const prices = { small: 35, medium: 50, large: 70 };
const costs = { small: 8, medium: 11, large: 15 };
const sizes: VehicleSize[] = ["small", "medium", "small", "large", "medium", "small"];

let seedPromise: Promise<void> | null = null;

async function seedHistory() {
  const db = getDb();
  const existing = await db.select({ id: washEvents.id }).from(washEvents).limit(1);
  if (existing.length) return;

  const rows: (typeof washEvents.$inferInsert)[] = [];
  const now = new Date();
  for (let daysAgo = 180; daysAgo >= 1; daysAgo -= 1) {
    const count = 20 + ((daysAgo * 7) % 16);
    for (let index = 0; index < count; index += 1) {
      const size = sizes[(index + daysAgo) % sizes.length];
      const duration = (size === "small" ? 18 : size === "medium" ? 25 : 32) + ((index * 3 + daysAgo) % 7) - 2;
      const entry = new Date(now);
      entry.setDate(now.getDate() - daysAgo);
      entry.setHours(8 + Math.floor(index / 4), (index * 13) % 60, 0, 0);
      const exit = new Date(entry.getTime() + duration * 60_000);
      rows.push({
        trackingId: `seed-${daysAgo}-${index}`,
        code: `H-${daysAgo}-${1000 + index}`,
        size,
        status: "completed",
        cameraId: `CAM-${(index % 3) + 1}`,
        bay: (index % 3) + 1,
        arrivalAt: new Date(entry.getTime() - 120_000),
        entryAt: entry,
        exitAt: exit,
        durationMinutes: duration,
        confidence: String(0.9 + ((index % 9) / 100)),
        price: String(prices[size]),
        cost: String(costs[size]),
        source: "seed",
      });
    }
  }
  for (let index = 0; index < rows.length; index += 500) {
    await db.insert(washEvents).values(rows.slice(index, index + 500));
  }
}

export async function ensureSeed() {
  if (process.env.SEED_DEMO_DATA === "false") return;
  if (!seedPromise) seedPromise = seedHistory().catch((error) => { seedPromise = null; throw error; });
  return seedPromise;
}

export async function listWashEvents() {
  await ensureSeed();
  return getDb().select().from(washEvents).orderBy(desc(washEvents.entryAt)).limit(6000);
}

export async function getSettings() {
  const db = getDb();
  const rows = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  if (rows[0]) return rows[0];
  await db.insert(appSettings).values({ id: 1 }).onDuplicateKeyUpdate({ set: { id: 1 } });
  return (await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1))[0];
}

export async function updateSettings(input: {
  prices: Record<VehicleSize, number>; variableCosts: Record<VehicleSize, number>; fixedDaily: number; laborDaily: number;
}) {
  await getDb().insert(appSettings).values({
    id: 1,
    smallPrice: String(input.prices.small), mediumPrice: String(input.prices.medium), largePrice: String(input.prices.large),
    smallCost: String(input.variableCosts.small), mediumCost: String(input.variableCosts.medium), largeCost: String(input.variableCosts.large),
    fixedDaily: String(input.fixedDaily), laborDaily: String(input.laborDaily),
  }).onDuplicateKeyUpdate({ set: {
    smallPrice: String(input.prices.small), mediumPrice: String(input.prices.medium), largePrice: String(input.prices.large),
    smallCost: String(input.variableCosts.small), mediumCost: String(input.variableCosts.medium), largeCost: String(input.variableCosts.large),
    fixedDaily: String(input.fixedDaily), laborDaily: String(input.laborDaily),
  }});
  return getSettings();
}

export async function correctEventSize(id: number, size: VehicleSize) {
  const db = getDb();
  const settings = await getSettings();
  const price = { small: settings.smallPrice, medium: settings.mediumPrice, large: settings.largePrice }[size];
  const cost = { small: settings.smallCost, medium: settings.mediumCost, large: settings.largeCost }[size];
  await db.update(washEvents).set({ size, price, cost, confidence: "1" }).where(eq(washEvents.id, id));
  return db.select().from(washEvents).where(eq(washEvents.id, id)).limit(1);
}

export async function ingestEntry(input: {
  trackingId: string; cameraId: string; size: VehicleSize; confidence: number; bay?: number; timestamp: Date; imageUrl?: string;
}) {
  const db = getDb();
  const settings = await getSettings();
  const price = { small: settings.smallPrice, medium: settings.mediumPrice, large: settings.largePrice }[input.size];
  const cost = { small: settings.smallCost, medium: settings.mediumCost, large: settings.largeCost }[input.size];
  await db.insert(washEvents).values({
    trackingId: input.trackingId, code: `AI-${input.trackingId.slice(-10)}`, size: input.size, status: "washing",
    cameraId: input.cameraId, bay: input.bay, arrivalAt: input.timestamp, entryAt: input.timestamp,
    confidence: String(input.confidence), price, cost, entryImageUrl: input.imageUrl, source: "vision",
  }).onDuplicateKeyUpdate({ set: {
    size: input.size, status: "washing", cameraId: input.cameraId, bay: input.bay, entryAt: input.timestamp,
    confidence: String(input.confidence), entryImageUrl: input.imageUrl, exitAt: null, durationMinutes: null,
  }});
  return db.select().from(washEvents).where(eq(washEvents.trackingId, input.trackingId)).limit(1);
}

export async function ingestExit(input: {
  trackingId: string; cameraId: string; timestamp: Date; imageUrl?: string;
}) {
  const db = getDb();
  const rows = await db.select().from(washEvents).where(eq(washEvents.trackingId, input.trackingId)).limit(1);
  const event = rows[0];
  if (!event) return null;
  const durationMinutes = Math.max(0, Math.round((input.timestamp.getTime() - event.entryAt.getTime()) / 60_000));
  await db.update(washEvents).set({
    status: "completed", exitAt: input.timestamp, durationMinutes,
    exitImageUrl: input.imageUrl, cameraId: input.cameraId,
  }).where(eq(washEvents.id, event.id));
  return db.select().from(washEvents).where(eq(washEvents.id, event.id)).limit(1);
}
