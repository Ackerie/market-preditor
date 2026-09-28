import type { Signal } from "./aiEnsemble";

export type TradeStrategy = "longterm" | "daytrade";

export interface TradeRiskInput {
  signal: Signal;
  confidence: number;
  entryQuality: number;
  riskReward: number;
  stopLossPct: number;
  takeProfitPct: number;
  riskFlags: string[];
  assetType: string;
  strategy: TradeStrategy;
  hasPosition: boolean;
}

export interface TradeRiskAssessment {
  allowed: boolean;
  reasons: string[];
  riskScore: number;
}

const HARD_RISK_FLAGS = new Set([
  "illiquid",
  "wide_spread",
  "market_closed",
  "major_news",
  "broker_unavailable",
  "data_stale",
]);

/**
 * Deterministic safety gate for AI recommendations. Models may recommend a
 * trade, but they cannot override minimum quality, reward, or data-safety
 * requirements here.
 */
export function assessTradeRisk(input: TradeRiskInput): TradeRiskAssessment {
  const reasons: string[] = [];
  const isBuy = input.signal === "buy";
  const isSell = input.signal === "sell";
  const isLeveraged =
    input.assetType === "futures" || input.assetType === "commodity";
  const minRiskReward = input.strategy === "daytrade" ? 1.5 : 1.75;
  const minEntryQuality = input.strategy === "daytrade" ? 65 : 60;
  const maxStopLoss = input.strategy === "daytrade" ? 5 : 12;

  if (input.signal === "hold") {
    reasons.push("AI consensus is hold");
  }
  if (isBuy && input.entryQuality < minEntryQuality) {
    reasons.push(`entry quality is below ${minEntryQuality}`);
  }
  if (isBuy && input.riskReward < minRiskReward) {
    reasons.push(`risk/reward is below ${minRiskReward.toFixed(2)}`);
  }
  if (isBuy && input.stopLossPct <= 0) {
    reasons.push("stop-loss distance is missing");
  }
  if (isBuy && input.stopLossPct > maxStopLoss) {
    reasons.push(`stop-loss is wider than ${maxStopLoss}%`);
  }
  if (isBuy && input.takeProfitPct <= 0) {
    reasons.push("take-profit target is missing");
  }
  if (isLeveraged && input.confidence < 65) {
    reasons.push("leveraged asset requires at least 65% confidence");
  }
  for (const flag of input.riskFlags) {
    if (HARD_RISK_FLAGS.has(flag)) reasons.push(`risk flag: ${flag}`);
  }
  if (isSell && !input.hasPosition) {
    reasons.push("no bot position is available to exit");
  }

  const riskScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        input.confidence * 0.45 +
          input.entryQuality * 0.25 +
          Math.min(input.riskReward / 3, 1) * 30,
      ),
    ),
  );

  return { allowed: reasons.length === 0, reasons, riskScore };
}
