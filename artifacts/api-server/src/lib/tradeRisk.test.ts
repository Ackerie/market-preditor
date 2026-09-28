import { describe, expect, it } from "vitest";
import { assessTradeRisk } from "./tradeRisk";

const validBuy = {
  signal: "buy" as const,
  confidence: 78,
  entryQuality: 80,
  riskReward: 2,
  stopLossPct: 2,
  takeProfitPct: 4,
  riskFlags: [],
  assetType: "crypto",
  strategy: "daytrade" as const,
  hasPosition: false,
};

describe("assessTradeRisk", () => {
  it("approves a qualified day-trade setup", () => {
    expect(assessTradeRisk(validBuy).allowed).toBe(true);
  });

  it("rejects a low reward-to-risk setup", () => {
    const result = assessTradeRisk({ ...validBuy, riskReward: 1.1 });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("risk/reward is below 1.50");
  });

  it("rejects hard safety flags", () => {
    const result = assessTradeRisk({ ...validBuy, riskFlags: ["wide_spread"] });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("risk flag: wide_spread");
  });

  it("does not require entry metrics to approve a protective sell", () => {
    const result = assessTradeRisk({
      ...validBuy,
      signal: "sell",
      confidence: 45,
      entryQuality: 0,
      riskReward: 0,
      stopLossPct: 0,
      takeProfitPct: 0,
      hasPosition: true,
    });
    expect(result.allowed).toBe(true);
  });
});
