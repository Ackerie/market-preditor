import { eq } from "drizzle-orm";
import { db, brokerConnectionsTable, oandaConnectionsTable, type BrokerConnection, type OandaConnection } from "@workspace/db";
import { decryptCredential } from "./credentialCrypto";

export async function getAlpacaConnection(userId: string): Promise<BrokerConnection | undefined> {
  const [conn] = await db
    .select()
    .from(brokerConnectionsTable)
    .where(eq(brokerConnectionsTable.userId, userId));
  if (!conn) return undefined;
  return {
    ...conn,
    apiKey: decryptCredential(conn.apiKey),
    apiSecret: decryptCredential(conn.apiSecret),
  };
}

export async function getOandaConnection(userId: string): Promise<OandaConnection | undefined> {
  const [conn] = await db
    .select()
    .from(oandaConnectionsTable)
    .where(eq(oandaConnectionsTable.userId, userId));
  if (!conn) return undefined;
  return {
    ...conn,
    apiToken: decryptCredential(conn.apiToken),
  };
}
