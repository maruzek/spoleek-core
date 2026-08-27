/**
 * Phone utilities: E.164 normalization and validation.
 *
 * Google Workspace rejects a `recoveryPhone` that is not strictly E.164
 * (`+` followed by 1-15 digits, no spaces or punctuation), so every phone we
 * send to the Directory API goes through `normalizeToE164` first and is
 * validated with `isE164` before any account is created.
 */

/** E.164: `+`, a non-zero country digit, then up to 14 more digits. */
export const E164_RE = /^\+[1-9]\d{1,14}$/;

export function isE164(value: string): boolean {
  return E164_RE.test(value);
}

/**
 * Country (ISO 3166-1 alpha-2) → international dial code, used to complete a
 * number written in local form. Kept deliberately small: the organization's
 * own country plus its neighbours, which is what shows up in member CSVs.
 */
export const DIAL_CODE_BY_COUNTRY: Record<string, string> = {
  CZ: "420",
  SK: "421",
  PL: "48",
  DE: "49",
  AT: "43",
  HU: "36",
  SI: "386",
  HR: "385",
  IT: "39",
  FR: "33",
  ES: "34",
  NL: "31",
  BE: "32",
  CH: "41",
  DK: "45",
  SE: "46",
  NO: "47",
  FI: "358",
  IE: "353",
  PT: "351",
  RO: "40",
  BG: "359",
  UA: "380",
  GB: "44",
  US: "1",
  CA: "1",
};

/** The default country used when an organization has none configured. */
export const DEFAULT_PHONE_COUNTRY = "CZ";

export function dialCodeForCountry(
  countryCode: string | null | undefined,
): string | null {
  if (!countryCode) return null;
  return DIAL_CODE_BY_COUNTRY[countryCode.trim().toUpperCase()] ?? null;
}

/** Strip everything a human might type as separators, keeping `+` and digits. */
function stripFormatting(input: string): string {
  return (
    input
      // `\s` covers the non-breaking and narrow spaces that spreadsheet
      // exports leave behind, not just the ASCII one.
      .replace(/\s/g, "")
      .replace(/[()./]/g, "")
      // ASCII hyphen plus the Unicode dash block.
      .replace(/[-\u2010-\u2015]/g, "")
  );
}

/**
 * Best-effort conversion of a human-written phone number to E.164.
 *
 * Handles the shapes that actually appear in imported CSVs:
 *   `+420 777 123 456` → `+420777123456`
 *   `00420777123456`   → `+420777123456`
 *   `777 123 456`      → `+420777123456` (via `defaultCountry`)
 *   `0777 123 456`     → `+420777123456` (leading national trunk `0` dropped)
 *
 * Returns the cleaned input unchanged when it cannot be completed — callers
 * validate with `isE164` and surface the value so an admin sees exactly what
 * would be sent rather than a silent rewrite.
 */
export function normalizeToE164(
  input: string,
  defaultCountry?: string | null,
): string {
  const cleaned = stripFormatting(input);
  if (!cleaned) return "";

  // International prefix in its other common spelling.
  const withPlus = cleaned.startsWith("00")
    ? `+${cleaned.slice(2)}`
    : cleaned;

  if (withPlus.startsWith("+")) {
    // A `+` already claims a country code; only formatting was ever in doubt.
    return `+${withPlus.slice(1).replace(/\D/g, "")}`;
  }

  const digits = withPlus.replace(/\D/g, "");
  if (!digits) return cleaned;

  const dialCode = dialCodeForCountry(defaultCountry);
  if (!dialCode) return cleaned;

  // A number already carrying its country code but written without `+`
  // (common when a spreadsheet ate the plus) must not get it a second time.
  if (digits.startsWith(dialCode) && digits.length > dialCode.length) {
    return `+${digits}`;
  }

  // National trunk prefix: a leading 0 is not part of the subscriber number.
  const national = digits.replace(/^0+/, "");
  if (!national) return cleaned;

  return `+${dialCode}${national}`;
}

/**
 * Normalize and validate in one step.
 *
 * `value` is always the normalized form, so a caller can write it straight
 * back into a form field regardless of whether it ended up valid.
 */
export function normalizePhoneField(
  input: string,
  defaultCountry?: string | null,
): { value: string; valid: boolean } {
  const value = normalizeToE164(input, defaultCountry);
  return { value, valid: value === "" || isE164(value) };
}

export const E164_HINT = "Use international format, e.g. +420777123456.";
