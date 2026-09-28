import { describe, it, expect } from "vitest";
import { resolveBrokerRoute, assetForOandaInstrument, assetForAlpacaSymbol } from "./brokerRouting";
import { ALL_ASSETS, getCoinBySymbol } from "./coins";

describe("resolveBrokerRoute", () => {
  it("routes stocks to Alpaca with the bare symbol", () => {
    expect(resolveBrokerRoute("AAPL", "stock")).toEqual({
      broker: "alpaca",
      brokerSymbol: "AAPL",
      effectiveAssetType: "stock",
    });
  });

  it("routes crypto to Alpaca with a /USD pair symbol", () => {
    expect(resolveBrokerRoute("BTC", "crypto")).toEqual({
      broker: "alpaca",
      brokerSymbol: "BTC/USD",
      effectiveAssetType: "crypto",
    });
  });

  it("routes 6-letter forex pairs to OANDA with underscore instruments", () => {
    expect(resolveBrokerRoute("EURUSD", "forex")).toEqual({
      broker: "oanda",
      brokerSymbol: "EUR_USD",
      effectiveAssetType: "forex",
    });
    expect(resolveBrokerRoute("USDJPY", "forex")).toEqual({
      broker: "oanda",
      brokerSymbol: "USD_JPY",
      effectiveAssetType: "forex",
    });
  });

  it("rejects forex symbols that are not 6 letters", () => {
    expect(resolveBrokerRoute("EUR", "forex")).toBeNull();
    expect(resolveBrokerRoute("EURUSDX", "forex")).toBeNull();
  });

  it("routes known commodities to OANDA CFD instruments", () => {
    const expected: Record<string, string> = {
      WTI: "WTICO_USD",
      BRENT: "BCO_USD",
      NATGAS: "NATGAS_USD",
      SILVER: "XAG_USD",
      COPPER: "XCU_USD",
      PLATINUM: "XPT_USD",
      WHEAT: "WHEAT_USD",
      CORN: "CORN_USD",
    };
    for (const [symbol, instrument] of Object.entries(expected)) {
      expect(resolveBrokerRoute(symbol, "commodity")).toEqual({
        broker: "oanda",
        brokerSymbol: instrument,
        effectiveAssetType: "commodity",
      });
    }
  });

  it("rejects unknown commodities", () => {
    expect(resolveBrokerRoute("LUMBER", "commodity")).toBeNull();
  });

  it("routes index futures to OANDA index CFDs", () => {
    const expected: Record<string, string> = {
      "ES-FUT": "SPX500_USD",
      "NQ-FUT": "NAS100_USD",
      "YM-FUT": "US30_USD",
      "RTY-FUT": "US2000_USD",
    };
    for (const [symbol, instrument] of Object.entries(expected)) {
      const route = resolveBrokerRoute(symbol, "futures");
      expect(route).toMatchObject({
        broker: "oanda",
        brokerSymbol: instrument,
        effectiveAssetType: "futures",
      });
      expect(route?.note).toContain("OANDA index CFD");
    }
  });

  it("routes crypto perpetual futures to Alpaca spot on the underlying", () => {
    const route = resolveBrokerRoute("BTC-PERP", "futures");
    expect(route).toMatchObject({
      broker: "alpaca",
      brokerSymbol: "BTC/USD",
      effectiveAssetType: "crypto",
    });
    expect(route?.note).toContain("spot crypto");
  });

  it("rejects perp futures whose underlying is not a known crypto", () => {
    expect(resolveBrokerRoute("FAKECOIN-PERP", "futures")).toBeNull();
  });

  it("routes single-stock futures to the underlying Alpaca stock", () => {
    const stockFuts = ALL_ASSETS.filter(
      (a) => a.assetType === "futures" && a.symbol.endsWith("-FUT") && getCoinBySymbol(a.symbol.replace(/-FUT$/, ""))?.assetType === "stock"
    );
    for (const fut of stockFuts) {
      const underlying = fut.symbol.replace(/-FUT$/, "");
      expect(resolveBrokerRoute(fut.symbol, "futures")).toMatchObject({
        broker: "alpaca",
        brokerSymbol: underlying,
        effectiveAssetType: "stock",
      });
    }
  });

  it("rejects unknown asset types", () => {
    expect(resolveBrokerRoute("BTC", "bond")).toBeNull();
    expect(resolveBrokerRoute("BTC", "")).toBeNull();
  });

  it("resolves every listed instrument to a broker or explicitly returns null", () => {
    // Snapshot of routability across the full instrument list — a regression
    // here means an instrument silently changed broker or dropped out.
    const unroutable: string[] = [];
    for (const asset of ALL_ASSETS) {
      const route = resolveBrokerRoute(asset.symbol, asset.assetType);
      if (!route) {
        unroutable.push(asset.symbol);
        continue;
      }
      expect(["alpaca", "oanda"]).toContain(route.broker);
      expect(route.brokerSymbol.length).toBeGreaterThan(0);
      if (asset.assetType === "stock" || asset.assetType === "crypto") {
        expect(route.broker).toBe("alpaca");
      }
      if (asset.assetType === "forex" || asset.assetType === "commodity") {
        expect(route.broker).toBe("oanda");
      }
    }
    // BNB is listed in the app but Alpaca doesn't offer it — intentionally unroutable.
    expect(unroutable).toEqual(["BNB", "BNB-PERP"]);
  });
});

describe("reverse lookups", () => {
  it("maps OANDA instruments back to internal assets", () => {
    expect(assetForOandaInstrument("EUR_USD")?.symbol).toBe("EURUSD");
    expect(assetForOandaInstrument("XAG_USD")?.symbol).toBe("SILVER");
    expect(assetForOandaInstrument("SPX500_USD")?.symbol).toBe("ES-FUT");
    expect(assetForOandaInstrument("NOPE_USD")).toBeUndefined();
  });

  it("maps Alpaca symbols back to internal assets", () => {
    expect(assetForAlpacaSymbol("AAPL")?.symbol).toBe("AAPL");
    expect(assetForAlpacaSymbol("BTC/USD")?.symbol).toBe("BTC");
    expect(assetForAlpacaSymbol("BTCUSD")?.symbol).toBe("BTC");
    expect(assetForAlpacaSymbol("ZZZZ")).toBeUndefined();
  });
});

describe("Alpaca-unsupported crypto", () => {
  it("does not route BNB (Alpaca has no BNB/USD asset)", () => {
    expect(resolveBrokerRoute("BNB", "crypto")).toBeNull();
    expect(resolveBrokerRoute("BNB-PERP", "futures")).toBeNull();
  });
});
