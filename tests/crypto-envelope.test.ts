import { afterEach, describe, expect, it, vi } from "vitest";
import { createCipheriv, createHash, randomBytes } from "node:crypto";

/**
 * The envelope exists so `APP_ENCRYPTION_KEY` can be rotated at all. Before it,
 * ciphertext carried no record of which key sealed it, so changing the key
 * turned every stored secret into unreadable bytes with no way to notice in
 * advance.
 *
 * These tests own the process environment, so each one re-imports the module
 * after setting the keys it wants — `lib/env.ts` caches its parse.
 */
const KEY_A = "test-encryption-key-a-at-least-32-chars-long";
const KEY_B = "test-encryption-key-b-at-least-32-chars-long";

const originalKey = process.env.APP_ENCRYPTION_KEY;
const originalPrevious = process.env.APP_ENCRYPTION_KEY_PREVIOUS;

async function loadCrypto({ key, previous }: { key: string; previous?: string }) {
  process.env.APP_ENCRYPTION_KEY = key;

  if (previous) {
    process.env.APP_ENCRYPTION_KEY_PREVIOUS = previous;
  } else {
    delete process.env.APP_ENCRYPTION_KEY_PREVIOUS;
  }

  // `lib/env.ts` caches its parsed result and `lib/crypto.ts` reads through it,
  // so both have to come back fresh for a new key to take effect.
  vi.resetModules();

  return import("@/lib/crypto");
}

/** The pre-versioning format: bare base64 of iv | tag | ciphertext. */
function sealLegacy(plaintext: string, passphrase: string) {
  const material = createHash("sha256").update(passphrase, "utf8").digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", material, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

afterEach(() => {
  process.env.APP_ENCRYPTION_KEY = originalKey;

  if (originalPrevious === undefined) {
    delete process.env.APP_ENCRYPTION_KEY_PREVIOUS;
  } else {
    process.env.APP_ENCRYPTION_KEY_PREVIOUS = originalPrevious;
  }
});

describe("the encryption envelope", () => {
  it("round-trips a secret and stamps the format and key id", async () => {
    const { encryptSecret, decryptSecret, isSealedWithCurrentKey } = await loadCrypto({
      key: KEY_A,
    });

    const sealed = encryptSecret("a-workspace-refresh-token");

    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed.split(".")).toHaveLength(3);
    expect(decryptSecret(sealed)).toBe("a-workspace-refresh-token");
    expect(isSealedWithCurrentKey(sealed)).toBe(true);
  });

  it("gives different keys different ids, and the same key a stable one", async () => {
    const keyIdOf = (payload: string) => payload.split(".")[1];

    // Sealed while each key is the live one: `lib/env.ts` parses on first use,
    // so a module held across a key change would read the new value.
    const a = await loadCrypto({ key: KEY_A });
    const firstUnderA = keyIdOf(a.encryptSecret("x"));
    const secondUnderA = keyIdOf(a.encryptSecret("y"));

    const b = await loadCrypto({ key: KEY_B });
    const underB = keyIdOf(b.encryptSecret("x"));

    expect(firstUnderA).toBe(secondUnderA);
    expect(firstUnderA).not.toBe(underB);
  });

  it("reads a payload sealed with the outgoing key during a rotation", async () => {
    const before = await loadCrypto({ key: KEY_A });
    const sealed = before.encryptSecret("survives-the-rotation");

    const after = await loadCrypto({ key: KEY_B, previous: KEY_A });

    expect(after.decryptSecret(sealed)).toBe("survives-the-rotation");
    // ...and says it still needs moving, which is what makes the rotation
    // something you can finish rather than hope about.
    expect(after.isSealedWithCurrentKey(sealed)).toBe(false);

    const moved = after.reencryptSecret(sealed);

    expect(after.isSealedWithCurrentKey(moved)).toBe(true);
    expect(after.decryptSecret(moved)).toBe("survives-the-rotation");
  });

  it("refuses a payload whose key is not configured, instead of failing vaguely", async () => {
    const before = await loadCrypto({ key: KEY_A });
    const sealed = before.encryptSecret("orphaned");

    const after = await loadCrypto({ key: KEY_B });

    expect(() => after.decryptSecret(sealed)).toThrow(/APP_ENCRYPTION_KEY_PREVIOUS/);
  });

  it("still reads payloads written before versioning", async () => {
    const { decryptSecret, isSealedWithCurrentKey } = await loadCrypto({ key: KEY_A });
    const legacy = sealLegacy("written-before-the-envelope", KEY_A);

    expect(decryptSecret(legacy)).toBe("written-before-the-envelope");
    // Unversioned, so it is never "current" — a rotation sweep picks it up.
    expect(isSealedWithCurrentKey(legacy)).toBe(false);
  });
});
