/**
 * IBAN utilities: validation, MOD-97 checksum, and Czech local format conversion.
 * Czech local format: [prefix-]accountNumber/bankCode (e.g. 19-2000145399/0800)
 */

function mod97(numStr: string): number {
  let remainder = 0;
  for (const char of numStr) {
    remainder = (remainder * 10 + parseInt(char, 10)) % 97;
  }
  return remainder;
}

function lettersToDigits(str: string): string {
  return str
    .toUpperCase()
    .split("")
    .map((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 65 && code <= 90 ? String(code - 55) : ch;
    })
    .join("");
}

function validateIbanChecksum(iban: string): boolean {
  const normalized = iban.replace(/\s/g, "").toUpperCase();
  // Move first 4 chars to end, convert letters to digits, check MOD-97 = 1
  const rearranged = normalized.slice(4) + normalized.slice(0, 4);
  return mod97(lettersToDigits(rearranged)) === 1;
}

const CZECH_LOCAL_RE = /^(\d{1,6}-)?(\d{2,10})\/(\d{4})$/;
const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/;

function czechLocalToIban(input: string): string {
  const m = CZECH_LOCAL_RE.exec(input.trim().replace(/\s/g, ""));
  if (!m) throw new Error("Invalid Czech bank account format. Expected prefix-account/bankCode.");

  const prefix = (m[1] ? m[1].replace("-", "") : "0").padStart(6, "0");
  const account = m[2].padStart(10, "0");
  const bankCode = m[3];

  if (prefix.length > 6) throw new Error("Account prefix too long (max 6 digits).");
  if (account.length > 10) throw new Error("Account number too long (max 10 digits).");

  const bban = bankCode + prefix + account;
  // Calculate check digits: move "CZ00" to end, convert, MOD-97
  const checkInput = lettersToDigits(bban + "CZ00");
  const checkDigit = String(98 - mod97(checkInput)).padStart(2, "0");

  return `CZ${checkDigit}${bban}`;
}

/**
 * Accepts either a Czech local format (prefix-account/bankCode) or an IBAN string.
 * Returns a normalized uppercase IBAN (no spaces).
 * Throws a user-facing error string if the input is invalid.
 */
export function parseBankAccount(input: string): string {
  const trimmed = input.trim().replace(/\s/g, "");

  if (CZECH_LOCAL_RE.test(trimmed)) {
    const iban = czechLocalToIban(trimmed);
    if (!validateIbanChecksum(iban)) {
      throw new Error("Could not convert Czech account to IBAN — check the account number.");
    }
    return iban;
  }

  const upper = trimmed.toUpperCase();
  if (!IBAN_RE.test(upper)) {
    throw new Error(
      "Enter a valid IBAN (e.g. CZ6508000000192000145399) or Czech format (e.g. 19-2000145399/0800).",
    );
  }
  if (!validateIbanChecksum(upper)) {
    throw new Error("Invalid IBAN — checksum does not match.");
  }
  return upper;
}

export function formatIban(iban: string): string {
  return iban.replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim();
}
