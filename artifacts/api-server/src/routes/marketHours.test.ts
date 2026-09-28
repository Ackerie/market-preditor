import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/db", () => ({ db: {} }));
vi.mock("../middleware/auth", () => ({ requireAuth: (_req: unknown, _res: unknown, next: () => void) => next() }));

const { isUsMarketOpen } = await import("./autoTrade");

// Helper: build a UTC Date for a given Eastern wall-clock time (EDT, UTC-4).
const edt = (dateStr: string, h: number, m: number) =>
  new Date(Date.UTC(2026, Number(dateStr.split("-")[1]) - 1, Number(dateStr.split("-")[2]), h + 4, m));

describe("isUsMarketOpen", () => {
  it("is open during regular hours on a weekday", () => {
    expect(isUsMarketOpen(edt("2026-07-22", 9, 30))).toBe(true); // open boundary
    expect(isUsMarketOpen(edt("2026-07-22", 12, 0))).toBe(true);
    expect(isUsMarketOpen(edt("2026-07-22", 15, 59))).toBe(true);
  });

  it("is closed just before the open and at/after the close", () => {
    expect(isUsMarketOpen(edt("2026-07-22", 9, 29))).toBe(false);
    expect(isUsMarketOpen(edt("2026-07-22", 16, 0))).toBe(false);
    expect(isUsMarketOpen(edt("2026-07-22", 20, 0))).toBe(false);
  });

  it("is closed on weekends even at midday", () => {
    expect(isUsMarketOpen(edt("2026-07-25", 12, 0))).toBe(false); // Saturday
    expect(isUsMarketOpen(edt("2026-07-26", 12, 0))).toBe(false); // Sunday
  });

  it("handles winter (EST, UTC-5) correctly", () => {
    // Jan 21 2026 is a Wednesday; 12:00 EST = 17:00 UTC
    expect(isUsMarketOpen(new Date(Date.UTC(2026, 0, 21, 17, 0)))).toBe(true);
    // 16:00 EST = 21:00 UTC → closed
    expect(isUsMarketOpen(new Date(Date.UTC(2026, 0, 21, 21, 0)))).toBe(false);
  });
});
