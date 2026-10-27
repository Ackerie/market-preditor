import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({
  db: {},
  brokerConnectionsTable: {},
}));

vi.mock("../credentialCrypto", () => ({
  decryptCredential: (value: string) => value,
}));

vi.mock("../alpaca", () => ({
  alpaca: vi.fn(),
  toAlpacaSymbol: (symbol: string, assetType: string) =>
    assetType === "crypto" ? `${symbol}/USD` : symbol,
}));

import { alpacaAdapter } from "./alpacaAdapter";

describe("alpacaAdapter market quotes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses daily bars for session volume and change instead of latest-minute bars", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const isCrypto = url.includes("/crypto/");
      const symbol = isCrypto ? "BTC/USD" : "AAPL";
      const isQuote = url.includes("/quotes/latest");
      const body = isQuote
        ? {
            quotes: {
              [symbol]: { bp: isCrypto ? "101" : "11", ap: isCrypto ? "103" : "13" },
            },
          }
        : {
            bars: {
              [symbol]: [
                {
                  o: isCrypto ? "100" : "10",
                  v: isCrypto ? 1200 : 2400,
                },
              ],
            },
          };
      return {
        ok: true,
        json: async () => body,
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const quotes = await alpacaAdapter.getMarketQuotes(
      { apiKey: "key", apiSecret: "secret", mode: "live" },
      [
        {
          symbol: "AAPL",
          name: "Apple",
          basePrice: 10,
          marketCap: 0,
          volume: 0,
          logoUrl: "",
          description: "",
          assetType: "stock",
        },
        {
          symbol: "BTC",
          name: "Bitcoin",
          basePrice: 100,
          marketCap: 0,
          volume: 0,
          logoUrl: "",
          description: "",
          assetType: "crypto",
        },
      ],
    );

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const barRequests = fetchMock.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.includes("/bars?"));
    expect(barRequests).toHaveLength(2);
    expect(
      barRequests.every((url) => url.includes("timeframe=1Day")),
    ).toBe(true);
    expect(quotes).toEqual([
      expect.objectContaining({
        symbol: "AAPL",
        price: 12,
        change24h: 20,
        volume: 2400,
      }),
      expect.objectContaining({
        symbol: "BTC",
        price: 102,
        change24h: 2,
        volume: 1200,
      }),
    ]);
  });
});
