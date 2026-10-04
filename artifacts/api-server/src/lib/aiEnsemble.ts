export type Signal = "buy" | "sell" | "hold";

export interface ModelVote {
  model: "claude" | "gpt" | "gemini";
  signal: Signal;
  confidence: number;
  entryQuality: number;
  riskReward: number;
  stopLossPct: number;
  takeProfitPct: number;
  regime: "bullish_trend" | "bearish_trend" | "range" | "volatile" | "unknown";
  riskFlags: string[];
  reasoning: string;
  ok: boolean;
}

export interface UserAiCredentials {
  anthropic?: string;
  openai?: string;
  gemini?: string;
}

export interface EnsembleResult {
  signal: Signal;
  confidence: number;
  entryQuality: number;
  riskReward: number;
  stopLossPct: number;
  takeProfitPct: number;
  regime: ModelVote["regime"];
  riskFlags: string[];
  reasoning: string;
  votes: ModelVote[];
  modelsResponded: number;
}

function parseSignalJson(raw: string): Omit<ModelVote, "model" | "ok"> {
  const text = raw
    .trim()
    .replace(/^```json\n?/, "")
    .replace(/^```\n?/, "")
    .replace(/\n?```$/, "");
  const parsed = JSON.parse(text) as {
    signal?: string;
    confidence?: number;
    entryQuality?: number;
    riskReward?: number;
    stopLossPct?: number;
    takeProfitPct?: number;
    regime?: string;
    riskFlags?: unknown;
    reasoning?: string;
  };
  const numberOr = (value: unknown, fallback: number) => {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : fallback;
  };
  const signal: Signal =
    parsed.signal === "buy"
      ? "buy"
      : parsed.signal === "sell"
        ? "sell"
        : "hold";
  return {
    signal,
    confidence: Math.min(100, Math.max(0, numberOr(parsed.confidence, 50))),
    entryQuality: Math.min(100, Math.max(0, numberOr(parsed.entryQuality, 50))),
    riskReward: Math.max(0, numberOr(parsed.riskReward, 1)),
    stopLossPct: Math.max(0, numberOr(parsed.stopLossPct, 0)),
    takeProfitPct: Math.max(0, numberOr(parsed.takeProfitPct, 0)),
    regime: ["bullish_trend", "bearish_trend", "range", "volatile"].includes(
      parsed.regime ?? "",
    )
      ? (parsed.regime as ModelVote["regime"])
      : "unknown",
    riskFlags: Array.isArray(parsed.riskFlags)
      ? parsed.riskFlags
          .filter((flag): flag is string => typeof flag === "string")
          .slice(0, 8)
      : [],
    reasoning:
      typeof parsed.reasoning === "string" && parsed.reasoning
        ? parsed.reasoning
        : "No reasoning provided.",
  };
}

// Providers are loaded lazily so a missing/broken integration config becomes a
// per-model failure (vote skipped) instead of crashing server startup.
async function askClaude(
  prompt: string,
  credentials?: UserAiCredentials,
): Promise<ModelVote> {
  const { anthropic, createAnthropicClient } =
    await import("@workspace/integrations-anthropic-ai");
  const client = credentials?.anthropic
    ? createAnthropicClient(
        credentials.anthropic,
        process.env.ANTHROPIC_BASE_URL,
      )
    : anthropic;
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 280,
    messages: [
      {
        role: "user",
        content: `Act as the lead portfolio strategist. Prioritize market regime, thesis durability, and multi-factor confirmation.\n\n${prompt}`,
      },
    ],
  });
  const content = message.content[0];
  if (content.type !== "text") throw new Error("non-text response");
  return { model: "claude", ok: true, ...parseSignalJson(content.text) };
}

async function askGpt(
  prompt: string,
  credentials?: UserAiCredentials,
): Promise<ModelVote> {
  const { openai, createOpenAiClient } =
    await import("@workspace/integrations-openai-ai-server");
  const client = credentials?.openai
    ? createOpenAiClient(credentials.openai, process.env.OPENAI_BASE_URL)
    : openai;
  const response = await client.chat.completions.create({
    model: "gpt-5.4-mini",
    max_completion_tokens: 8192,
    messages: [
      {
        role: "user",
        content: `Act as the quantitative technical analyst. Prioritize price structure, momentum, volatility, risk/reward, and precise invalidation levels.\n\n${prompt}`,
      },
    ],
  });
  const text = response.choices[0]?.message?.content ?? "";
  return { model: "gpt", ok: true, ...parseSignalJson(text) };
}

async function askGemini(
  prompt: string,
  credentials?: UserAiCredentials,
): Promise<ModelVote> {
  const { ai, createGeminiClient } =
    await import("@workspace/integrations-gemini-ai");
  const client = credentials?.gemini
    ? createGeminiClient(credentials.gemini, process.env.GEMINI_BASE_URL)
    : ai;
  const response = await client.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Act as the skeptical risk reviewer. Look for missing data, crowded or low-quality setups, adverse regimes, and reasons to reject a trade.\n\n${prompt}`,
          },
        ],
      },
    ],
    config: { maxOutputTokens: 8192, responseMimeType: "application/json" },
  });
  return { model: "gemini", ok: true, ...parseSignalJson(response.text ?? "") };
}

const MODEL_LABELS: Record<ModelVote["model"], string> = {
  claude: "Claude",
  gpt: "GPT",
  gemini: "Gemini",
};

export interface CombineOptions {
  /**
   * When true, the bot already holds this position, so a SELL is a
   * protective exit: a single model's sell vote is enough to trigger it
   * (unless a 2-model buy quorum outvotes it). Buys always require the
   * full 2-model quorum regardless of this flag.
   */
  protectiveSell?: boolean;
}

/**
 * Combines model votes into a single decision. Safety rules for real money:
 * - A BUY decision requires a QUORUM of at least 2 models agreeing.
 *   One model alone can never spend money.
 * - A SELL normally also requires a 2-model quorum, EXCEPT when
 *   `protectiveSell` is set (the bot holds the position): then any single
 *   sell vote triggers the exit, since selling reduces risk.
 * - Ties and no-quorum situations resolve to hold.
 * - Confidence is the average of the models that voted with the winner.
 */
export function combineVotes(
  votes: ModelVote[],
  opts?: CombineOptions,
): EnsembleResult {
  if (votes.length === 0) {
    return {
      signal: "hold",
      confidence: 45,
      entryQuality: 0,
      riskReward: 0,
      stopLossPct: 0,
      takeProfitPct: 0,
      regime: "unknown",
      riskFlags: ["data_stale"],
      reasoning: "AI analysis unavailable — holding current position.",
      votes: [],
      modelsResponded: 0,
    };
  }

  const tally: Record<Signal, number> = { buy: 0, sell: 0, hold: 0 };
  for (const v of votes) tally[v.signal] += 1;

  let winner: Signal = "hold";
  if (tally.buy >= 2 && tally.buy > tally.sell && tally.buy > tally.hold)
    winner = "buy";
  else if (tally.sell >= 2 && tally.sell > tally.buy && tally.sell > tally.hold)
    winner = "sell";
  else if (opts?.protectiveSell && tally.sell >= 1) winner = "sell";

  const winnerVotes = votes.filter((v) => v.signal === winner);
  const confidenceSource = winnerVotes.length > 0 ? winnerVotes : votes;
  const confidence = Math.round(
    confidenceSource.reduce((sum, v) => sum + v.confidence, 0) /
      confidenceSource.length,
  );
  const average = (
    field: "entryQuality" | "riskReward" | "stopLossPct" | "takeProfitPct",
  ) =>
    winnerVotes.length > 0
      ? winnerVotes.reduce((sum, vote) => sum + vote[field], 0) /
        winnerVotes.length
      : 0;
  const regimes = winnerVotes
    .map((vote) => vote.regime)
    .filter((regime) => regime !== "unknown");
  const regime =
    regimes.length > 0
      ? regimes.sort(
          (a, b) =>
            regimes.filter((value) => value === b).length -
            regimes.filter((value) => value === a).length,
        )[0]
      : "unknown";
  const riskFlags = [...new Set(winnerVotes.flatMap((vote) => vote.riskFlags))];

  const voteSummary = votes
    .map(
      (v) =>
        `${MODEL_LABELS[v.model]}: ${v.signal.toUpperCase()} (${v.confidence}%)`,
    )
    .join(", ");
  const lead = winnerVotes[0] ?? votes[0];
  const protectiveNote =
    winner === "sell" && opts?.protectiveSell && tally.sell < 2
      ? " Protective exit — a single sell vote is enough to close a held position."
      : "";
  const quorumNote =
    winner === "hold" &&
    (tally.buy === 1 || tally.sell === 1) &&
    tally.buy < 2 &&
    tally.sell < 2
      ? " No 2-model consensus for a trade — holding."
      : protectiveNote;
  const reasoning = `[${votes.length}-model vote — ${voteSummary}]${quorumNote} ${lead.reasoning}`;

  return {
    signal: winner,
    confidence,
    entryQuality: Math.round(average("entryQuality")),
    riskReward: Number(average("riskReward").toFixed(2)),
    stopLossPct: Number(average("stopLossPct").toFixed(2)),
    takeProfitPct: Number(average("takeProfitPct").toFixed(2)),
    regime,
    riskFlags,
    reasoning,
    votes,
    modelsResponded: votes.length,
  };
}

/**
 * Queries Claude, GPT, and Gemini in parallel with the same prompt and
 * combines their answers via combineVotes. If a model fails, the vote
 * proceeds with the remaining models; if all fail, the result is a
 * low-confidence hold.
 */
export async function getEnsembleSignal(
  prompt: string,
  opts?: CombineOptions,
  credentials?: UserAiCredentials,
): Promise<EnsembleResult> {
  const settled = await Promise.allSettled([
    askClaude(prompt, credentials),
    askGpt(prompt, credentials),
    askGemini(prompt, credentials),
  ]);
  const votes = settled
    .filter(
      (s): s is PromiseFulfilledResult<ModelVote> => s.status === "fulfilled",
    )
    .map((s) => s.value);
  return combineVotes(votes, opts);
}
