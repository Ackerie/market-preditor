import { listBrokers, type BrokerAdapter } from "./brokers";
import type { ResolvedConnection } from "./brokers/types";

// Re-exported for existing consumers; implementations live with their adapters.
export { assetForAlpacaSymbol, assetForOandaInstrument } from "./brokers";

export type BrokerName = string;

export interface BrokerRoute {
  broker: BrokerName;
  /** The symbol/instrument the broker expects. */
  brokerSymbol: string;
  /** Asset type used for order parameters (tif etc.). */
  effectiveAssetType: string;
  /** Human note when the tradable instrument differs from the listed one (e.g. futures -> spot/CFD). */
  note?: string;
}

export interface ConnectedBrokerRoute extends BrokerRoute {
  adapter: BrokerAdapter;
  connection: ResolvedConnection;
}

/**
 * Decide which real broker executes a given internal symbol by asking each
 * registered broker adapter in registration order — the first adapter that
 * can trade the instrument wins. Today:
 * - stocks & crypto -> Alpaca
 * - forex & commodities -> OANDA (CFDs)
 * - index futures -> OANDA index CFDs
 * - crypto perpetuals -> Alpaca spot crypto on the underlying
 * - single-stock futures -> Alpaca stock on the underlying
 */
export function resolveBrokerRoute(
  symbol: string,
  assetType: string,
): BrokerRoute | null {
  for (const adapter of listBrokers()) {
    const route = adapter.routeSymbol(symbol, assetType);
    if (route) {
      return {
        broker: adapter.id,
        brokerSymbol: route.brokerSymbol,
        effectiveAssetType: route.effectiveAssetType,
        ...(route.note ? { note: route.note } : {}),
      };
    }
  }
  return null;
}

export async function resolveConnectedBrokerRoute(
  userId: string,
  symbol: string,
  assetType: string,
): Promise<ConnectedBrokerRoute | null> {
  for (const adapter of listBrokers()) {
    const route = adapter.routeSymbol(symbol, assetType);
    if (!route) continue;
    const connection = await adapter.getConnection(userId);
    if (!connection) continue;
    return {
      broker: adapter.id,
      brokerSymbol: route.brokerSymbol,
      effectiveAssetType: route.effectiveAssetType,
      ...(route.note ? { note: route.note } : {}),
      adapter,
      connection,
    };
  }
  return null;
}
