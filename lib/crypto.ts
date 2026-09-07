import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { getServerEnv } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Envelope version. Bump only when the *format* changes — the key itself
 * rotates through `APP_ENCRYPTION_KEY_PREVIOUS` without a new version.
 */
const ENVELOPE_VERSION = "v1";
const ENVELOPE_SEPARATOR = ".";

/**
 * Versioned ciphertext: `v1.<keyId>.<base64(iv|tag|ciphertext)>`.
 *
 * The bare base64 this used to emit carried no way to tell which key sealed it,
 * so rotating `APP_ENCRYPTION_KEY` meant every stored secret became permanently
 * unreadable with no way to detect it beforehand. The key id makes rotation a
 * migration you can run and verify instead of a one-way door.
 *
 * Today the only encrypted value in the database is the Workspace refresh
 * token, which is exactly why the format is being fixed now: doing it once
 * member-held secrets exist means rewriting them all under load.
 *
 * Payloads written before versioning have no prefix and are read with the
 * current key, which is correct as long as the key has not changed — the only
 * situation the old format supported at all.
 */
type KeyEntry = { id: string; material: Buffer };

/**
 * Derived with a plain SHA-256 of the configured passphrase.
 *
 * Not a password KDF, and deliberately unchanged: `APP_ENCRYPTION_KEY` is a
 * high-entropy machine-generated secret from the environment, not a human
 * password, so stretching buys nothing here. Changing the derivation would also
 * silently invalidate every unversioned payload already stored. If the key ever
 * becomes something a person types, that is a `v2` envelope, not an edit here.
 */
function deriveKey(passphrase: string): KeyEntry {
  const material = createHash("sha256").update(passphrase, "utf8").digest();

  return {
    // Short, non-secret fingerprint. Long enough not to collide across the two
    // or three keys that are ever live at once, short enough to read in a row.
    id: createHash("sha256").update(material).digest("hex").slice(0, 12),
    material,
  };
}

function getCurrentKey(): KeyEntry {
  return deriveKey(getServerEnv().APP_ENCRYPTION_KEY);
}

/**
 * Every key a stored payload might have been sealed with: the current one
 * first, then the outgoing one while a rotation is in flight.
 */
function getCandidateKeys(): KeyEntry[] {
  const { APP_ENCRYPTION_KEY, APP_ENCRYPTION_KEY_PREVIOUS } = getServerEnv();
  const keys = [deriveKey(APP_ENCRYPTION_KEY)];

  if (APP_ENCRYPTION_KEY_PREVIOUS) {
    keys.push(deriveKey(APP_ENCRYPTION_KEY_PREVIOUS));
  }

  return keys;
}

function seal(plaintext: string, key: KeyEntry): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key.material, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const body = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");

  return [ENVELOPE_VERSION, key.id, body].join(ENVELOPE_SEPARATOR);
}

function open(body: string, key: KeyEntry): string {
  const buffer = Buffer.from(body, "base64");
  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key.material, iv);

  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

type Envelope = { keyId: string; body: string } | null;

/** Null for a payload written before versioning, which has no prefix. */
function parseEnvelope(payload: string): Envelope {
  const parts = payload.split(ENVELOPE_SEPARATOR);

  if (parts.length !== 3 || parts[0] !== ENVELOPE_VERSION) {
    return null;
  }

  return { keyId: parts[1]!, body: parts[2]! };
}

export function encryptSecret(plaintext: string): string {
  return seal(plaintext, getCurrentKey());
}

export function decryptSecret(payload: string): string {
  const envelope = parseEnvelope(payload);

  if (!envelope) {
    // Legacy, unversioned. GCM authenticates, so a wrong key throws rather
    // than returning plausible rubbish.
    return open(payload, getCurrentKey());
  }

  const key = getCandidateKeys().find((candidate) => candidate.id === envelope.keyId);

  if (!key) {
    throw new Error(
      `No configured key matches ciphertext key id ${envelope.keyId}. ` +
        "Set APP_ENCRYPTION_KEY_PREVIOUS to the outgoing key and re-encrypt.",
    );
  }

  return open(envelope.body, key);
}

/**
 * Whether a stored payload is already sealed with the key in use.
 *
 * A rotation is: set the new key, move the old one to
 * `APP_ENCRYPTION_KEY_PREVIOUS`, then re-encrypt everything this returns false
 * for. Without it there is no way to tell which rows still need moving, and
 * "did the rotation finish?" has no answer.
 */
export function isSealedWithCurrentKey(payload: string): boolean {
  const envelope = parseEnvelope(payload);

  if (!envelope) {
    return false;
  }

  const current = Buffer.from(getCurrentKey().id);
  const stored = Buffer.from(envelope.keyId);

  return current.length === stored.length && timingSafeEqual(current, stored);
}

/** Re-seals a payload under the current key. A no-op if it already is. */
export function reencryptSecret(payload: string): string {
  if (isSealedWithCurrentKey(payload)) {
    return payload;
  }

  return encryptSecret(decryptSecret(payload));
}

export function generateRandomPassword(length = 20) {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^*_+-";
  const bytes = randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += alphabet[bytes[i] % alphabet.length];
  }
  return result;
}
