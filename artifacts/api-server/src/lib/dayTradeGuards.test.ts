import { describe, it, expect } from "vitest";
import { decideExit } from "./dayTradeGuards";

const pos = (openQty: number, avgCostUsd: number | null) => ({ openQty, avgCostUsd });

describe("decideExit", () => {
  it("takes profit when the gain reaches the threshold", () => {
    const d = decideExit(pos(2, 100), 105, 5, 3);
    expect(d.exit).toBe("take_profit");
    expect(d.unrealizedPct).toBeCloseTo(5);
  });

  it("stops out when the loss reaches the threshold", () => {
    const d = decideExit(pos(2, 100), 97, 5, 3);
    expect(d.exit).toBe("stop_loss");
    expect(d.unrealizedPct).toBeCloseTo(-3);
  });

  it("holds when the move is inside both thresholds", () => {
    expect(decideExit(pos(2, 100), 102, 5, 3).exit).toBeNull();
    expect(decideExit(pos(2, 100), 98, 5, 3).exit).toBeNull();
  });

  it("ignores a disabled take-profit threshold (null)", () => {
    expect(decideExit(pos(2, 100), 150, null, 3).exit).toBeNull();
  });

  it("ignores a disabled stop-loss threshold (null)", () => {
    expect(decideExit(pos(2, 100), 50, 5, null).exit).toBeNull();
  });

  it("does nothing without an open position or average cost", () => {
    expect(decideExit(pos(0, 100), 200, 5, 3).exit).toBeNull();
    expect(decideExit(pos(2, null), 200, 5, 3).exit).toBeNull();
    expect(decideExit(pos(2, 0), 200, 5, 3).exit).toBeNull();
  });

  it("ignores invalid current prices", () => {
    expect(decideExit(pos(2, 100), 0, 5, 3).exit).toBeNull();
    expect(decideExit(pos(2, 100), NaN, 5, 3).exit).toBeNull();
  });

  it("take-profit wins when both thresholds are somehow crossed (tp checked first)", () => {
    // tp 1% and sl 1% with +2% move → take profit
    expect(decideExit(pos(1, 100), 102, 1, 1).exit).toBe("take_profit");
  });
});
