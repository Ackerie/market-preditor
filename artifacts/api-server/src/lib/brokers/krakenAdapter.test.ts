import { beforeEach, describe, expect, it, vi } from "vitest";
import { STOCKS } from "../coins";

const mocks = vi.hoisted(() => ({
  krakenPrivate: vi.fn(),
  krakenPublic: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: {},
  krakenConnectionsTable: {},
}));

vi.mock("../credentialCrypto", () => ({
  decryptCredential: (value: string) => value,
}));

vi.mock("../kraken", () => ({
  krakenPrivate: mocks.krakenPrivate,
  krakenPublic: mocks.krakenPublic,
}));

import { krakenAdapter } from "./krakenAdapter";

describe("krakenAdapter xStocks support", () => {
  beforeEach(() => {
    mocks.krakenPrivate.mockReset();
    mocks.krakenPublic.mockReset();
  });

  it("routes listed app stocks as tokenized asset pairs", () => {
    expect(krakenAdapter.routeSymbol("AAPL", "stock")).toEqual({
      brokerSymbol: "AAPLxUSD",
      effectiveAssetType: "tokenized_asset",
    });
    expect(krakenAdapter.assetForBrokerSymbol("AAPLxUSD")?.symbol).toBe("AAPL");
  });

  it("reads xStock quotes returned under the Kraken pair altname", async () => {
    mocks.krakenPublic.mockResolvedValue({
      result: { AAPLxUSD: { c: ["339.32"], o: "340.05", v: ["29", "29"] } },
    });

    const quotes = await krakenAdapter.getMarketQuotes({}, [STOCKS[0]]);

    expect(mocks.krakenPublic).toHaveBeenCalledWith("Ticker", {
      asset_class: "tokenized_asset",
      assetVersion: "1",
    });
    expect(quotes).toEqual([
      expect.objectContaining({
        symbol: "AAPL",
        price: 339.32,
        source: "kraken",
      }),
    ]);
  });

  it("finds xStock balances when checking an auto-trade sell position", async () => {
    mocks.krakenPrivate.mockResolvedValue({ result: { AAPLx: "2" } });
    mocks.krakenPublic.mockResolvedValue({
      result: { AAPLxUSD: { c: ["100"], o: "99", v: ["1", "1"] } },
    });

    await expect(
      krakenAdapter.getSellablePosition({}, "AAPLxUSD", "tokenized_asset"),
    ).resolves.toEqual({ marketValueUsd: 200, qtyAvailable: "2" });
  });

  it("includes the tokenized asset class when submitting an xStock order", async () => {
    mocks.krakenPublic.mockResolvedValue({
      result: { AAPLxUSD: { c: ["100"], o: "99", v: ["1", "1"] } },
    });
    mocks.krakenPrivate.mockResolvedValue({ result: { txid: ["order-1"] } });

    await krakenAdapter.placeMarketOrder(
      {},
      {
        brokerSymbol: "AAPLxUSD",
        side: "buy",
        notionalUsd: 10,
        effectiveAssetType: "tokenized_asset",
      },
    );

    expect(mocks.krakenPrivate).toHaveBeenCalledWith({}, "AddOrder", {
      pair: "AAPLxUSD",
      type: "buy",
      ordertype: "market",
      volume: "0.10000000",
      asset_class: "tokenized_asset",
    });
  });
});
