import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { getCookieOptions } from "./auth";

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    secure: false,
    ...overrides,
  } as unknown as Request;
}

describe("local auth cookies", () => {
  it("does not mark cookies as secure for plain http localhost requests", () => {
    const req = makeReq({ headers: { host: "localhost:8080" } });
    expect(getCookieOptions(req).secure).toBe(false);
  });

  it("marks cookies as secure when the request is already https", () => {
    const req = makeReq({ headers: { host: "app.example.com" }, secure: true });
    expect(getCookieOptions(req).secure).toBe(true);
  });
});
