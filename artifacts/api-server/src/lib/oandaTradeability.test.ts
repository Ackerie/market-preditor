import { describe, it, expect, vi, afterEach } from "vitest";
import { oandaTradeability, isAccountRestrictedReject, markOandaInstrumentUntradeable, type OandaConn } from "./oanda";

const conn = (accountId: string): OandaConn => ({
  apiToken: "test-token",
  accountId,
  mode: "practice",
});

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("oandaTradeability", () => {
  it("returns tradeable when pricing reports a tradeable instrument", async () => {
    mockFetchOnce(200, { prices: [{ tradeable: true, status: "tradeable" }] });
    const result = await oandaTradeability(conn("acct-open"), "EUR_USD");
    expect(result.tradeable).toBe(true);
  });

  it("returns market_closed when pricing reports non-tradeable (weekend close)", async () => {
    mockFetchOnce(200, { prices: [{ tradeable: false, status: "non-tradeable" }] });
    const result = await oandaTradeability(conn("acct-closed"), "USD_CHF");
    expect(result).toEqual({ tradeable: false, reason: "market_closed" });
  });

  it("returns not_tradeable when the account cannot trade the instrument (4xx)", async () => {
    mockFetchOnce(400, { errorMessage: "The instrument specified is not tradeable by the Account" });
    const result = await oandaTradeability(conn("acct-restricted"), "NAS100_USD");
    expect(result).toEqual({ tradeable: false, reason: "not_tradeable" });
  });

  it("returns not_tradeable when pricing returns no price entries", async () => {
    mockFetchOnce(200, { prices: [] });
    const result = await oandaTradeability(conn("acct-empty"), "XYZ_USD");
    expect(result).toEqual({ tradeable: false, reason: "not_tradeable" });
  });

  it("lets the order path proceed on transient OANDA 5xx errors (no false blocks)", async () => {
    mockFetchOnce(503, { errorMessage: "Service unavailable" });
    const result = await oandaTradeability(conn("acct-5xx"), "EUR_USD");
    expect(result.tradeable).toBe(true);
  });

  it("lets the order path proceed when OANDA is unreachable (no false blocks)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const result = await oandaTradeability(conn("acct-offline"), "EUR_USD");
    expect(result.tradeable).toBe(true);
  });

  it("caches results per account+instrument", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ prices: [{ tradeable: false, status: "non-tradeable" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await oandaTradeability(conn("acct-cache"), "GBP_USD");
    await oandaTradeability(conn("acct-cache"), "GBP_USD");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("account-restricted reject handling", () => {
  it("recognizes the OANDA account-restriction reject message", () => {
    expect(isAccountRestrictedReject("The instrument specified is not tradeable by the Account")).toBe(true);
    expect(isAccountRestrictedReject("MARKET_HALTED")).toBe(false);
    expect(isAccountRestrictedReject(null)).toBe(false);
  });

  it("markOandaInstrumentUntradeable makes future tradeability checks skip without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const c = conn("acct-restricted-mark");
    markOandaInstrumentUntradeable(c, "CORN_USD");
    const result = await oandaTradeability(c, "CORN_USD");
    expect(result).toEqual({ tradeable: false, reason: "not_tradeable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
