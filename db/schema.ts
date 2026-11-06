import {
  mysqlTable, mysqlEnum, serial, varchar, text, timestamp, int, decimal,
} from "drizzle-orm/mysql-core";

export const washEvents = mysqlTable("wash_events", {
  id: serial("id").primaryKey(),
  trackingId: varchar("tracking_id", { length: 120 }).notNull().unique(),
  code: varchar("code", { length: 40 }).notNull(),
  size: mysqlEnum("size", ["small", "medium", "large"]).notNull(),
  status: mysqlEnum("status", ["queued", "washing", "completed"]).notNull().default("washing"),
  cameraId: varchar("camera_id", { length: 80 }).notNull(),
  bay: int("bay"),
  arrivalAt: timestamp("arrival_at").notNull(),
  entryAt: timestamp("entry_at").notNull(),
  exitAt: timestamp("exit_at"),
  durationMinutes: int("duration_minutes"),
  confidence: decimal("confidence", { precision: 5, scale: 4 }).notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull().default("0"),
  cost: decimal("cost", { precision: 10, scale: 2 }).notNull().default("0"),
  entryImageUrl: text("entry_image_url"),
  exitImageUrl: text("exit_image_url"),
  source: mysqlEnum("source", ["simulation", "vision", "seed"]).notNull().default("vision"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const appSettings = mysqlTable("app_settings", {
  id: int("id").primaryKey().default(1),
  smallPrice: decimal("small_price", { precision: 10, scale: 2 }).notNull().default("35"),
  mediumPrice: decimal("medium_price", { precision: 10, scale: 2 }).notNull().default("50"),
  largePrice: decimal("large_price", { precision: 10, scale: 2 }).notNull().default("70"),
  smallCost: decimal("small_cost", { precision: 10, scale: 2 }).notNull().default("8"),
  mediumCost: decimal("medium_cost", { precision: 10, scale: 2 }).notNull().default("11"),
  largeCost: decimal("large_cost", { precision: 10, scale: 2 }).notNull().default("15"),
  fixedDaily: decimal("fixed_daily", { precision: 10, scale: 2 }).notNull().default("450"),
  laborDaily: decimal("labor_daily", { precision: 10, scale: 2 }).notNull().default("360"),
});

export type WashEventRow = typeof washEvents.$inferSelect;
export type AppSettingsRow = typeof appSettings.$inferSelect;
