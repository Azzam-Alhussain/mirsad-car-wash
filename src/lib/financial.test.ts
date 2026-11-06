import { describe, expect, it } from "vitest";
import type { WashEvent } from "../types";
import { defaultSettings, TODAY_KEY, calculateMetrics } from "./simulation";
import { periodAnalytics } from "./history";

function completed(overrides: Partial<WashEvent> = {}): WashEvent {
  return {
    id: "test-1", code: "T-1", size: "small", arrival: 500, entry: 510, exit: 530,
    status: "completed", confidence: 0.95, plannedDuration: 20, dayKey: TODAY_KEY,
    price: 35, cost: 8, source: "vision", ...overrides,
  };
}

describe("wash financial calculations", () => {
  it("uses stored transaction prices and recognizes revenue only after exit", () => {
    const active = completed({ id: "active", status: "washing", exit: undefined });
    const result = calculateMetrics([completed(), active], defaultSettings, 600);
    expect(result.revenue).toBe(35);
    expect(result.variableCost).toBe(8);
    expect(result.netProfit).toBe(35 - 8 - 450 - 360);
    expect(result.averageDuration).toBe(20);
    expect(result.completed).toHaveLength(1);
  });

  it("does not rewrite historical profit when current prices change", () => {
    const changed = { ...defaultSettings, prices: { small: 100, medium: 100, large: 100 } };
    const result = calculateMetrics([completed()], changed, 600);
    expect(result.revenue).toBe(35);
    expect(result.netProfit).toBe(-783);
  });

  it("separates actual monthly totals from the annual projection", () => {
    const daily = periodAnalytics([completed()], defaultSettings, "daily");
    const monthly = periodAnalytics([completed()], defaultSettings, "monthly");
    const annual = periodAnalytics([completed()], defaultSettings, "yearly");
    expect(daily.netProfit).toBe(-783);
    expect(monthly.revenue).toBe(35);
    expect(monthly.projected).toBe(false);
    expect(annual.projected).toBe(true);
    expect(annual.revenue).toBe(35 * 365);
    expect(annual.count).toBe(365);
  });
});
