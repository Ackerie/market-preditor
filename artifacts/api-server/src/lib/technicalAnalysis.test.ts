import { describe, expect, it } from "vitest";
import { analyzeCandles } from "./technicalAnalysis";

function candlesFromCloses(closes: number[]) {
  return closes.map((close, index) => ({
    time: new Date(index * 300_000).toISOString(),
    open: close,
    high: close * 1.002,
    low: close * 0.998,
    close,
  }));
}

describe("analyzeCandles", () => {
  it("identifies a sustained bullish trend with positive momentum", () => {
    const analysis = analyzeCandles(
      candlesFromCloses(Array.from({ length: 60 }, (_, index) => 100 + index)),
      160,
    );

    expect(analysis.regime).toBe("bullish_trend");
    expect(analysis.momentum5Pct).toBeGreaterThan(0);
    expect(analysis.momentum20Pct).toBeGreaterThan(0);
    expect(analysis.riskReward).toBe(2);
  });

  it("flags an overbought move near resistance", () => {
    const analysis = analyzeCandles(
      candlesFromCloses([
        ...Array.from({ length: 45 }, () => 100),
        ...Array.from({ length: 15 }, (_, index) => 100 + index * 4),
      ]),
      160,
    );

    expect(analysis.riskFlags).toContain("overbought");
    expect(analysis.riskFlags).toContain("near_resistance");
  });
});