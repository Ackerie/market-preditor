import { afterEach, describe, expect, it, vi } from "vitest";
import { get24hChange, getLivePrice, refreshPublicQuote } from "./coins";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("public market feed fallback", () => {
  it("fetches live Yahoo quotes when broker data is unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        chart: {
          result: [
            {
              meta: {
                regularMarketPrice: 123.45,
                regularMarketChangePercent: -2.5,
                previousClose: 126.5,
              },
            },
          ],
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const quote = await refreshPublicQuote("AAPL", 100, "stock");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("AAPL"),
      expect.objectContaining({
        headers: expect.objectContaining({ "User-Agent": "Mozilla/5.0" }),
      }),
    );
    expect(quote).toMatchObject({
      price: 123.45,
      change24h: -2.5,
      source: "public",
    });
    expect(getLivePrice("AAPL", 100, "stock")).toBe(123.45);
    expect(get24hChange("AAPL", "stock")).toBe(-2.5);
  });
});
