/**
 * Broker plug-in framework.
 *
 * To add a new broker:
 *   1. Create `<name>Adapter.ts` in this directory implementing BrokerAdapter
 *      (see types.ts — one file covers routing, credentials, auto-trade
 *      budget, order placement, portfolio, and history).
 *   2. Register it below with registerBroker(). Registration order matters:
 *      symbol routing asks each adapter in order and the first match wins.
 *   3. Store its per-user connection/credentials in its own table (or a
 *      shared one), always encrypted via credentialCrypto.
 * Everything else — the auto-trader, manual trades, portfolio, and trade
 * history — picks the new broker up automatically.
 */
import { registerBroker } from "./registry";
import { alpacaAdapter } from "./alpacaAdapter";
import { oandaAdapter } from "./oandaAdapter";
import { krakenAdapter } from "./krakenAdapter";

registerBroker(alpacaAdapter);
registerBroker(oandaAdapter);
registerBroker(krakenAdapter);

export { getBroker, listBrokers } from "./registry";
export { assetForAlpacaSymbol } from "./alpacaAdapter";
export { assetForOandaInstrument } from "./oandaAdapter";
export { krakenAdapter } from "./krakenAdapter";
export type {
  BrokerAdapter,
  BrokerCredentials,
  SymbolRoute,
  Tradeability,
  AutoTradeAccount,
  PlaceOrderResult,
  NormalizedHolding,
  NormalizedTrade,
  MarketBar,
  MarketQuote,
} from "./types";
