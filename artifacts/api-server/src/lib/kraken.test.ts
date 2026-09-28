import { describe, expect, it } from "vitest";
import { krakenSignature } from "./kraken";

describe("krakenSignature", () => {
  it("matches Kraken's published AddOrder signature example", () => {
    const data = {
      nonce: "1616492376594",
      ordertype: "limit",
      pair: "XBTUSD",
      price: "37500",
      type: "buy",
      volume: "1.25",
    };

    expect(
      krakenSignature(
        "/0/private/AddOrder",
        data,
        "kQH5HW/8p1uGOVjbgWA7FunAmGO8lsSUXNsu3eow76sz84Q18fWxnyRzBHCd3pd5nE9qa99HAZtuZuj6F1huXg==",
      ),
    ).toBe(
      "4/dpxb3iT4tp/ZCVEwSnEsLxx0bqyhLpdfOpc6fn7OR8+UClSV5n9E6aSS8MPtnRfp32bAb0nmbRn6H8ndwLUQ==",
    );
  });
});
