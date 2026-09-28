import type { BrokerAdapter } from "./types";

/**
 * Broker registry. Adapters are registered once at startup (brokers/index.ts)
 * in priority order — symbol routing asks each adapter in registration order
 * and the first one that can trade the instrument wins.
 */
const adapters = new Map<string, BrokerAdapter>();

export function registerBroker(adapter: BrokerAdapter): void {
  if (adapters.has(adapter.id)) {
    throw new Error(`Broker adapter "${adapter.id}" is already registered`);
  }
  adapters.set(adapter.id, adapter);
}

export function getBroker(id: string): BrokerAdapter | undefined {
  return adapters.get(id);
}

export function listBrokers(): BrokerAdapter[] {
  return [...adapters.values()];
}
