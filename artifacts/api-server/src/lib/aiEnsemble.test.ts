import { describe, it, expect } from "vitest";
import { combineVotes, type ModelVote } from "./aiEnsemble";

function vote(
  model: ModelVote["model"],
  signal: ModelVote["signal"],
  confidence = 70,
): ModelVote {
  return {
    model,
    signal,
    confidence,
    entryQuality: 75,
    riskReward: 2,
    stopLossPct: 2,
    takeProfitPct: 4,
    regime: "bullish_trend",
    riskFlags: [],
    reasoning: `${model} says ${signal}`,
    ok: true,
  };
}

describe("combineVotes", () => {
  it("3/3 buy consensus executes buy with averaged confidence", () => {
    const r = combineVotes([
      vote("claude", "buy", 80),
      vote("gpt", "buy", 70),
      vote("gemini", "buy", 60),
    ]);
    expect(r.signal).toBe("buy");
    expect(r.confidence).toBe(70);
    expect(r.modelsResponded).toBe(3);
  });

  it("2/3 majority sell wins", () => {
    const r = combineVotes([
      vote("claude", "sell", 80),
      vote("gpt", "sell", 60),
      vote("gemini", "hold", 90),
    ]);
    expect(r.signal).toBe("sell");
    expect(r.confidence).toBe(70);
  });

  it("single buy vote with two failures does NOT trade (no quorum)", () => {
    const r = combineVotes([vote("claude", "buy", 95)]);
    expect(r.signal).toBe("hold");
  });

  it("1 buy vs 2 hold resolves to hold", () => {
    const r = combineVotes([
      vote("claude", "buy", 95),
      vote("gpt", "hold"),
      vote("gemini", "hold"),
    ]);
    expect(r.signal).toBe("hold");
  });

  it("buy/sell/hold three-way tie resolves to hold", () => {
    const r = combineVotes([
      vote("claude", "buy"),
      vote("gpt", "sell"),
      vote("gemini", "hold"),
    ]);
    expect(r.signal).toBe("hold");
  });

  it("buy vs sell tie with two models resolves to hold", () => {
    const r = combineVotes([vote("claude", "buy"), vote("gpt", "sell")]);
    expect(r.signal).toBe("hold");
  });

  it("2-model buy agreement is enough quorum", () => {
    const r = combineVotes([vote("claude", "buy", 80), vote("gpt", "buy", 70)]);
    expect(r.signal).toBe("buy");
    expect(r.confidence).toBe(75);
  });

  it("all models failed yields low-confidence hold", () => {
    const r = combineVotes([]);
    expect(r.signal).toBe("hold");
    expect(r.confidence).toBe(45);
    expect(r.modelsResponded).toBe(0);
  });

  it("reasoning includes per-model vote summary", () => {
    const r = combineVotes([
      vote("claude", "buy", 80),
      vote("gpt", "buy", 70),
      vote("gemini", "hold", 50),
    ]);
    expect(r.reasoning).toContain("Claude: BUY (80%)");
    expect(r.reasoning).toContain("GPT: BUY (70%)");
    expect(r.reasoning).toContain("Gemini: HOLD (50%)");
  });

  it("no-quorum hold notes the missing consensus", () => {
    const r = combineVotes([
      vote("claude", "buy", 95),
      vote("gpt", "hold"),
      vote("gemini", "hold"),
    ]);
    expect(r.reasoning).toContain("No 2-model consensus");
  });

  describe("protectiveSell (bot holds the position)", () => {
    it("a single sell vote triggers the exit", () => {
      const r = combineVotes(
        [
          vote("claude", "sell", 55),
          vote("gpt", "hold"),
          vote("gemini", "hold"),
        ],
        { protectiveSell: true },
      );
      expect(r.signal).toBe("sell");
      expect(r.reasoning).toContain("Protective exit");
    });

    it("single sell vote with two failures still exits", () => {
      const r = combineVotes([vote("gemini", "sell", 40)], {
        protectiveSell: true,
      });
      expect(r.signal).toBe("sell");
    });

    it("a 2-model buy quorum outvotes a lone sell", () => {
      const r = combineVotes(
        [
          vote("claude", "buy", 80),
          vote("gpt", "buy", 70),
          vote("gemini", "sell", 60),
        ],
        { protectiveSell: true },
      );
      expect(r.signal).toBe("buy");
    });

    it("does not relax the buy quorum", () => {
      const r = combineVotes(
        [
          vote("claude", "buy", 95),
          vote("gpt", "hold"),
          vote("gemini", "hold"),
        ],
        { protectiveSell: true },
      );
      expect(r.signal).toBe("hold");
    });

    it("all-hold votes stay hold", () => {
      const r = combineVotes(
        [vote("claude", "hold"), vote("gpt", "hold"), vote("gemini", "hold")],
        { protectiveSell: true },
      );
      expect(r.signal).toBe("hold");
    });

    it("without the flag a lone sell still holds", () => {
      const r = combineVotes([
        vote("claude", "sell", 90),
        vote("gpt", "hold"),
        vote("gemini", "hold"),
      ]);
      expect(r.signal).toBe("hold");
    });

    it("2-model sell quorum carries no protective-exit note", () => {
      const r = combineVotes(
        [
          vote("claude", "sell", 80),
          vote("gpt", "sell", 60),
          vote("gemini", "hold"),
        ],
        { protectiveSell: true },
      );
      expect(r.signal).toBe("sell");
      expect(r.reasoning).not.toContain("Protective exit");
    });
  });
});
