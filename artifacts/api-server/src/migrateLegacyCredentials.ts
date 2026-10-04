import { pool } from "@workspace/db";
import { migrateLegacyCredentials } from "./lib/credentialMigration";

try {
  await migrateLegacyCredentials();
  console.info("Legacy credentials are encrypted.");
} catch {
  console.error(
    "Legacy credential migration failed; credentials were not logged.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
