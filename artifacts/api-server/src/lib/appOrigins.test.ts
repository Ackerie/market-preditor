import { describe, expect, it } from "vitest";
import { isAllowedAppOrigin, isNativeAppOrigin } from "./appOrigins";

describe("isAllowedAppOrigin", () => {
  const configuredOrigins = new Set(["https://market-predictor-eight.vercel.app"]);

  it("allows explicitly configured origins", () => {
    expect(
      isAllowedAppOrigin("https://market-predictor-eight.vercel.app", configuredOrigins),
    ).toBe(true);
  });

  it("allows preview deployments for the configured Vercel project", () => {
    expect(
      isAllowedAppOrigin(
        "https://market-predictor-git-main-ackeries-projects.vercel.app",
        configuredOrigins,
      ),
    ).toBe(true);
  });

  it("allows the Capacitor native app origins", () => {
    expect(isAllowedAppOrigin("https://localhost", configuredOrigins)).toBe(
      true,
    );
    expect(
      isAllowedAppOrigin("capacitor://localhost", configuredOrigins),
    ).toBe(true);
  });

  it("only identifies the exact native app origins as native", () => {
    expect(isNativeAppOrigin("https://localhost")).toBe(true);
    expect(isNativeAppOrigin("capacitor://localhost")).toBe(true);
    expect(isNativeAppOrigin("https://localhost.attacker.example")).toBe(
      false,
    );
    expect(isNativeAppOrigin(undefined)).toBe(false);
  });

  it("rejects unrelated Vercel and non-HTTPS origins", () => {
    expect(
      isAllowedAppOrigin(
        "https://another-project-ackeries-projects.vercel.app",
        configuredOrigins,
      ),
    ).toBe(false);
    expect(
      isAllowedAppOrigin(
        "http://market-predictor-preview-ackeries-projects.vercel.app",
        configuredOrigins,
      ),
    ).toBe(false);
  });
});
