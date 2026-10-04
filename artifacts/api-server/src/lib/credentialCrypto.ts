import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

const secret = process.env.SESSION_SECRET;
if (!secret) {
  throw new Error("SESSION_SECRET must be set to encrypt broker credentials");
}
const key = scryptSync(secret, "nexustrade-broker-credentials-v1", 32);

const PREFIX = "enc:v1:";

export function encryptCredential(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptCredential(stored: string): string {
  if (!stored.startsWith(PREFIX)) {
    throw new Error("Refusing to use an unencrypted stored credential");
  }
  const [ivB64, tagB64, dataB64] = stored.slice(PREFIX.length).split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted credential");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function isEncryptedCredential(stored: string): boolean {
  return stored.startsWith(PREFIX);
}
