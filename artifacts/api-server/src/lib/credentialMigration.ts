import { eq } from "drizzle-orm";
import {
  aiCredentialsTable,
  brokerConnectionsTable,
  db,
  krakenConnectionsTable,
  krakenFuturesConnectionsTable,
  oandaConnectionsTable,
} from "@workspace/db";
import { encryptCredential, isEncryptedCredential } from "./credentialCrypto";

export async function migrateLegacyCredentials(): Promise<void> {
  const alpacaRows = await db
    .select({
      id: brokerConnectionsTable.id,
      apiKey: brokerConnectionsTable.apiKey,
      apiSecret: brokerConnectionsTable.apiSecret,
    })
    .from(brokerConnectionsTable);
  for (const row of alpacaRows) {
    const apiKey = isEncryptedCredential(row.apiKey)
      ? row.apiKey
      : encryptCredential(row.apiKey);
    const apiSecret = isEncryptedCredential(row.apiSecret)
      ? row.apiSecret
      : encryptCredential(row.apiSecret);
    if (apiKey !== row.apiKey || apiSecret !== row.apiSecret) {
      await db
        .update(brokerConnectionsTable)
        .set({ apiKey, apiSecret })
        .where(eq(brokerConnectionsTable.id, row.id));
    }
  }

  const oandaRows = await db
    .select({
      id: oandaConnectionsTable.id,
      apiToken: oandaConnectionsTable.apiToken,
    })
    .from(oandaConnectionsTable);
  for (const row of oandaRows) {
    if (!isEncryptedCredential(row.apiToken)) {
      await db
        .update(oandaConnectionsTable)
        .set({ apiToken: encryptCredential(row.apiToken) })
        .where(eq(oandaConnectionsTable.id, row.id));
    }
  }

  const krakenRows = await db.select().from(krakenConnectionsTable);
  for (const row of krakenRows) {
    const apiKey = isEncryptedCredential(row.apiKey)
      ? row.apiKey
      : encryptCredential(row.apiKey);
    const apiSecret = isEncryptedCredential(row.apiSecret)
      ? row.apiSecret
      : encryptCredential(row.apiSecret);
    if (apiKey !== row.apiKey || apiSecret !== row.apiSecret) {
      await db
        .update(krakenConnectionsTable)
        .set({ apiKey, apiSecret })
        .where(eq(krakenConnectionsTable.id, row.id));
    }
  }

  const krakenFuturesRows = await db
    .select()
    .from(krakenFuturesConnectionsTable);
  for (const row of krakenFuturesRows) {
    const apiKey = isEncryptedCredential(row.apiKey)
      ? row.apiKey
      : encryptCredential(row.apiKey);
    const apiSecret = isEncryptedCredential(row.apiSecret)
      ? row.apiSecret
      : encryptCredential(row.apiSecret);
    if (apiKey !== row.apiKey || apiSecret !== row.apiSecret) {
      await db
        .update(krakenFuturesConnectionsTable)
        .set({ apiKey, apiSecret })
        .where(eq(krakenFuturesConnectionsTable.id, row.id));
    }
  }

  const aiRows = await db
    .select({ id: aiCredentialsTable.id, apiKey: aiCredentialsTable.apiKey })
    .from(aiCredentialsTable);
  for (const row of aiRows) {
    if (!isEncryptedCredential(row.apiKey)) {
      await db
        .update(aiCredentialsTable)
        .set({ apiKey: encryptCredential(row.apiKey) })
        .where(eq(aiCredentialsTable.id, row.id));
    }
  }
}
