import { describe, expect, it } from "vitest";
import { isAllowedAppOrigin } from "./appOrigins";

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
