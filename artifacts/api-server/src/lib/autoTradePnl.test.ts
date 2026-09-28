import { describe, it, expect } from "vitest";
import { computeAutoTradePnl, type PnlEventRow } from "./autoTradePnl";

const ev = (o: Partial<PnlEventRow>): PnlEventRow => ({
  broker: "alpaca",
  symbol: "BTC",
  side: "buy",
  notionalUsd: "100.00",
  quantity: null,
  fillPrice: null,
  ...o,
});

describe("computeAutoTradePnl", () => {
  it("returns empty summary for no events", () => {
    const r = computeAutoTradePnl([]);
    expect(r.totalRealizedPnlUsd).toBeNull();
    expect(r.positions).toEqual([]);
    expect(r.executedTrades).toBe(0);
  });

  it("computes realized profit on a full round trip", () => {
    const r = computeAutoTradePnl([
      ev({ side: "buy", notionalUsd: "100.00", quantity: "2", fillPrice: "50" }),
      ev({ side: "sell", notionalUsd: "120.00", quantity: "2", fillPrice: "60" }),
    ]);
    expect(r.totalRealizedPnlUsd).toBe(20);
    expect(r.positions[0]).toMatchObject({ symbol: "BTC", realizedPnlUsd: 20, openQty: 0, trades: 2 });
  });

  it("computes realized loss and leaves remaining open quantity at average cost", () => {
    const r = computeAutoTradePnl([
      ev({ side: "buy", notionalUsd: "100.00", quantity: "2", fillPrice: "50" }),
      ev({ side: "buy", notionalUsd: "140.00", quantity: "2", fillPrice: "70" }),
      ev({ side: "sell", notionalUsd: "80.00", quantity: "2", fillPrice: "40" }),
    ]);
    // avg cost = 60; sell 2 @ 40 → -40 realized; 2 left @ 60
    expect(r.positions[0]).toMatchObject({ realizedPnlUsd: -40, openQty: 2, avgCostUsd: 60 });
    expect(r.totalRealizedPnlUsd).toBe(-40);
  });

  it("nulls realizedPnlUsd for a symbol when ANY of its events lacks fill data", () => {
    const r = computeAutoTradePnl([
      ev({ side: "buy", notionalUsd: "100.00" }), // legacy row, no fill data
      ev({ side: "buy", notionalUsd: "100.00", quantity: "1", fillPrice: "100" }),
      ev({ side: "sell", notionalUsd: "110.00", quantity: "1", fillPrice: "110" }),
    ]);
    expect(r.positions[0].realizedPnlUsd).toBeNull();
    expect(r.positions[0].avgCostUsd).toBeNull();
    expect(r.totalRealizedPnlUsd).toBeNull();
    // cash flow still counts everything
    expect(r.totalBuysUsd).toBe(200);
    expect(r.totalSellsUsd).toBe(110);
    expect(r.netCashFlowUsd).toBe(-90);
  });

  it("keeps symbols independent — one legacy symbol doesn't null the others", () => {
    const r = computeAutoTradePnl([
      ev({ symbol: "ETH", side: "buy", notionalUsd: "50.00" }), // legacy
      ev({ symbol: "BTC", side: "buy", notionalUsd: "100.00", quantity: "1", fillPrice: "100" }),
      ev({ symbol: "BTC", side: "sell", notionalUsd: "90.00", quantity: "1", fillPrice: "90" }),
    ]);
    const btc = r.positions.find((p) => p.symbol === "BTC")!;
    const eth = r.positions.find((p) => p.symbol === "ETH")!;
    expect(btc.realizedPnlUsd).toBe(-10);
    expect(eth.realizedPnlUsd).toBeNull();
    expect(r.totalRealizedPnlUsd).toBe(-10);
  });

  it("tracks the same symbol on different brokers separately", () => {
    const r = computeAutoTradePnl([
      ev({ broker: "alpaca", side: "buy", notionalUsd: "100.00", quantity: "1", fillPrice: "100" }),
      ev({ broker: "oanda", side: "buy", notionalUsd: "200.00", quantity: "2", fillPrice: "100" }),
    ]);
    expect(r.positions).toHaveLength(2);
  });

  it("ignores sells with no matching open position (bot sold a pre-existing holding)", () => {
    const r = computeAutoTradePnl([
      ev({ side: "sell", notionalUsd: "100.00", quantity: "1", fillPrice: "100" }),
    ]);
    expect(r.positions[0].realizedPnlUsd).toBe(0);
    expect(r.totalSellsUsd).toBe(100);
  });

  it("falls back to notional when fill price is missing but quantity is known", () => {
    const r = computeAutoTradePnl([
      ev({ side: "buy", notionalUsd: "100.00", quantity: "2" }),
      ev({ side: "sell", notionalUsd: "110.00", quantity: "2" }),
    ]);
    expect(r.positions[0].realizedPnlUsd).toBe(10);
  });
});
