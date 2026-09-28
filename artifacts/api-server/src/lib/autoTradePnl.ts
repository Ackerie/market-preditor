export interface PnlEventRow {
  broker: string;
  symbol: string;
  side: string;
  notionalUsd: string;
  quantity: string | null;
  fillPrice: string | null;
}

export interface PnlPosition {
  symbol: string;
  broker: string;
  realizedPnlUsd: number | null;
  buysUsd: number;
  sellsUsd: number;
  openQty: number;
  avgCostUsd: number | null;
  trades: number;
}

export interface PnlSummary {
  totalRealizedPnlUsd: number | null;
  totalBuysUsd: number;
  totalSellsUsd: number;
  netCashFlowUsd: number;
  executedTrades: number;
  positions: PnlPosition[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Average-cost realized P&L per broker+symbol from executed auto-trade
 * events, in chronological order. A position's realizedPnlUsd is null
 * when ANY of its events lacks fill data (legacy rows) — a partial
 * figure would be misleading.
 */
export function computeAutoTradePnl(rows: PnlEventRow[]): PnlSummary {
  type Pos = {
    symbol: string; broker: string;
    buysUsd: number; sellsUsd: number; trades: number;
    openQty: number; costBasisUsd: number;
    realizedPnlUsd: number; missingFillData: boolean;
  };
  const positions = new Map<string, Pos>();

  for (const e of rows) {
    const key = `${e.broker}:${e.symbol}`;
    let p = positions.get(key);
    if (!p) {
      p = { symbol: e.symbol, broker: e.broker, buysUsd: 0, sellsUsd: 0, trades: 0, openQty: 0, costBasisUsd: 0, realizedPnlUsd: 0, missingFillData: false };
      positions.set(key, p);
    }
    const notional = parseFloat(e.notionalUsd);
    const qty = e.quantity != null ? parseFloat(e.quantity) : NaN;
    const price = e.fillPrice != null ? parseFloat(e.fillPrice) : NaN;
    p.trades++;
    if (e.side === "buy") p.buysUsd += notional; else p.sellsUsd += notional;

    if (Number.isFinite(qty) && qty > 0) {
      const usd = Number.isFinite(price) && price > 0 ? qty * price : notional;
      if (e.side === "buy") {
        p.openQty += qty;
        p.costBasisUsd += usd;
      } else {
        const matchedQty = Math.min(qty, p.openQty);
        if (matchedQty > 0 && p.openQty > 0) {
          const avgCost = p.costBasisUsd / p.openQty;
          const proceedsPerUnit = usd / qty;
          p.realizedPnlUsd += matchedQty * (proceedsPerUnit - avgCost);
          p.costBasisUsd -= matchedQty * avgCost;
          p.openQty -= matchedQty;
        }
      }
    } else {
      p.missingFillData = true;
    }
  }

  const list: PnlPosition[] = [...positions.values()].map((p) => ({
    symbol: p.symbol,
    broker: p.broker,
    realizedPnlUsd: p.missingFillData ? null : round2(p.realizedPnlUsd),
    buysUsd: round2(p.buysUsd),
    sellsUsd: round2(p.sellsUsd),
    openQty: p.missingFillData ? 0 : Math.round(p.openQty * 1e8) / 1e8,
    avgCostUsd: !p.missingFillData && p.openQty > 0 ? round2(p.costBasisUsd / p.openQty) : null,
    trades: p.trades,
  })).sort((a, b) => (b.realizedPnlUsd ?? 0) - (a.realizedPnlUsd ?? 0));

  const withPnl = list.filter((p) => p.realizedPnlUsd != null);
  const totalBuysUsd = list.reduce((s, p) => s + p.buysUsd, 0);
  const totalSellsUsd = list.reduce((s, p) => s + p.sellsUsd, 0);

  return {
    totalRealizedPnlUsd: withPnl.length > 0 ? round2(withPnl.reduce((s, p) => s + (p.realizedPnlUsd ?? 0), 0)) : null,
    totalBuysUsd: round2(totalBuysUsd),
    totalSellsUsd: round2(totalSellsUsd),
    netCashFlowUsd: round2(totalSellsUsd - totalBuysUsd),
    executedTrades: rows.length,
    positions: list,
  };
}
