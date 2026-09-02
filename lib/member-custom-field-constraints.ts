import { addDays, differenceInYears, isValid, parseISO, subYears } from "date-fns";
import { z } from "zod";

import type {
  MemberCustomField,
  MemberCustomFieldType,
} from "@/server/db/schema";

/**
 * Admin-defined validation rules stored on `member_custom_fields.constraints`.
 *
 * Every key is optional and every field type only reads the subset that applies
 * to it — `memberCustomFieldConstraintsSchema` plus `assertConstraintsMatchType`
 * keep stray keys out at save time.
 */
export const textFormatOptions = [
  { value: "any", label: "Any characters" },
  { value: "letters", label: "Letters only" },
  { value: "alphanumeric", label: "Letters and numbers" },
  { value: "digits", label: "Digits only" },
  { value: "custom", label: "Custom pattern (regex)" },
] as const;

export type TextFormat = (typeof textFormatOptions)[number]["value"];

/**
 * Date rules are mutually exclusive rather than intersecting. Age limits,
 * absolute bounds and a direction lock overlap heavily — `direction: "future"`
 * combined with any `minAge` yields an empty window that rejects every date
 * with no way for the admin to see why — so exactly one group applies at a
 * time. The active group is derived from whichever keys carry a value; there is
 * no separate mode flag to keep in sync.
 */
export type DateMode = "none" | "age" | "range" | "direction";

/** Which keys belong to each date rule group. */
export const DATE_MODE_KEYS: Record<DateMode, ReadonlyArray<string>> = {
  none: [],
  age: ["minAge", "maxAge"],
  range: ["notBefore", "notAfter"],
  direction: ["direction"],
};

export const dateDirectionOptions = [
  { value: "any", label: "Any date" },
  { value: "past", label: "Past dates only" },
  { value: "future", label: "Future dates only" },
] as const;

export type DateDirection = (typeof dateDirectionOptions)[number]["value"];

/** Custom patterns run server-side on public submissions, so both sides are bounded. */
export const MAX_PATTERN_LENGTH = 200;
export const DEFAULT_PATTERN_MAX_LENGTH = 512;

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the YYYY-MM-DD format.");

export const memberCustomFieldConstraintsSchema = z
  .object({
    // date
    minAge: z.number().int().min(0).max(150).optional(),
    maxAge: z.number().int().min(0).max(150).optional(),
    notBefore: isoDateSchema.optional(),
    notAfter: isoDateSchema.optional(),
    direction: z.enum(["any", "past", "future"]).optional(),
    // number
    min: z.number().optional(),
    max: z.number().optional(),
    integerOnly: z.boolean().optional(),
    // text / textarea
    minLength: z.number().int().min(0).max(10_000).optional(),
    maxLength: z.number().int().min(1).max(10_000).optional(),
    format: z.enum(["any", "letters", "alphanumeric", "digits", "custom"]).optional(),
    pattern: z.string().trim().max(MAX_PATTERN_LENGTH).optional(),
    patternMessage: z.string().trim().max(200).optional(),
    // multi_select
    minSelected: z.number().int().min(0).max(1_000).optional(),
    maxSelected: z.number().int().min(1).max(1_000).optional(),
  })
  .strict();

export type MemberCustomFieldConstraints = z.infer<
  typeof memberCustomFieldConstraintsSchema
>;

const CONSTRAINT_KEYS_BY_TYPE: Record<
  MemberCustomFieldType,
  ReadonlyArray<keyof MemberCustomFieldConstraints>
> = {
  text: ["minLength", "maxLength", "format", "pattern", "patternMessage"],
  textarea: ["minLength", "maxLength", "format", "pattern", "patternMessage"],
  boolean: [],
  number: ["min", "max", "integerOnly"],
  email: [],
  phone: [],
  date: ["minAge", "maxAge", "notBefore", "notAfter", "direction"],
  select: [],
  multi_select: ["minSelected", "maxSelected"],
};

export function getConstraintKeysForType(type: MemberCustomFieldType) {
  return CONSTRAINT_KEYS_BY_TYPE[type];
}

export function typeSupportsConstraints(type: MemberCustomFieldType) {
  return CONSTRAINT_KEYS_BY_TYPE[type].length > 0;
}

/**
 * Drops every key the given field type does not understand, and — for date
 * fields — every key outside the selected date mode. Applied on both write and
 * read, so switching a field's type or date mode can never leave a stale rule
 * quietly in force.
 */
export function pickConstraintsForType(
  type: MemberCustomFieldType,
  constraints: MemberCustomFieldConstraints,
): MemberCustomFieldConstraints {
  const allowed = new Set<string>(CONSTRAINT_KEYS_BY_TYPE[type]);

  if (type === "date") {
    const mode = getDateMode(constraints);

    for (const key of Object.values(DATE_MODE_KEYS).flat()) {
      if (!DATE_MODE_KEYS[mode].includes(key)) {
        allowed.delete(key);
      }
    }
  }

  return Object.fromEntries(
    Object.entries(constraints).filter(
      ([key, value]) => allowed.has(key) && value !== undefined && value !== "",
    ),
  );
}

/**
 * The active date rule group, derived from whichever keys carry a value. The
 * first group to be filled in wins, and clearing it releases the others.
 */
export function getDateMode(constraints: MemberCustomFieldConstraints): DateMode {
  if (constraints.minAge !== undefined || constraints.maxAge !== undefined) {
    return "age";
  }

  if (constraints.notBefore || constraints.notAfter) {
    return "range";
  }

  if (constraints.direction && constraints.direction !== "any") {
    return "direction";
  }

  return "none";
}

/**
 * Compiles the effective pattern for a text-ish field, or `null` when the field
 * accepts anything. Presets are Unicode-aware so non-ASCII names still pass.
 */
export function getTextPattern(constraints: MemberCustomFieldConstraints): {
  regex: RegExp;
  message: string | null;
} | null {
  switch (constraints.format) {
    case "letters":
      return {
        regex: /^[\p{L}\s'-]+$/u,
        message: "may only contain letters.",
      };
    case "alphanumeric":
      return {
        regex: /^[\p{L}\p{N}\s'-]+$/u,
        message: "may only contain letters and numbers.",
      };
    case "digits":
      return { regex: /^\d+$/u, message: "may only contain digits." };
    case "custom": {
      if (!constraints.pattern) {
        return null;
      }

      const compiled = compilePattern(constraints.pattern);

      return compiled
        ? { regex: compiled, message: constraints.patternMessage ?? null }
        : null;
    }
    default:
      return null;
  }
}

/** Anchors and compiles an admin-supplied pattern. Returns null if it is invalid. */
export function compilePattern(pattern: string): RegExp | null {
  const trimmed = pattern.trim();

  if (!trimmed || trimmed.length > MAX_PATTERN_LENGTH) {
    return null;
  }

  const anchored = `${trimmed.startsWith("^") ? "" : "^"}${trimmed}${
    trimmed.endsWith("$") ? "" : "$"
  }`;

  try {
    return new RegExp(anchored, "u");
  } catch {
    return null;
  }
}

/**
 * Turns date constraints into the concrete window a picker can enforce.
 *
 * Age is intentionally resolved against `now` on every call rather than stored
 * as a cut-off date: "18+" means something different each year.
 */
export function getDateConstraintBounds(
  constraints: MemberCustomFieldConstraints,
  now = new Date(),
): { min?: Date; max?: Date } {
  let min: Date | undefined;
  let max: Date | undefined;

  const tighten = (next: Date, bound: "min" | "max") => {
    if (bound === "min") {
      min = !min || next > min ? next : min;
      return;
    }

    max = !max || next < max ? next : max;
  };

  if (constraints.minAge !== undefined) {
    // Must already have had the birthday, so anything later is too young.
    tighten(subYears(now, constraints.minAge), "max");
  }

  if (constraints.maxAge !== undefined) {
    // The day after turning `maxAge + 1` is out; the day before is still in.
    tighten(addDays(subYears(now, constraints.maxAge + 1), 1), "min");
  }

  if (constraints.notBefore) {
    const parsed = parseISO(constraints.notBefore);

    if (isValid(parsed)) {
      tighten(parsed, "min");
    }
  }

  if (constraints.notAfter) {
    const parsed = parseISO(constraints.notAfter);

    if (isValid(parsed)) {
      tighten(parsed, "max");
    }
  }

  if (constraints.direction === "past") {
    tighten(now, "max");
  }

  if (constraints.direction === "future") {
    tighten(now, "min");
  }

  return { min, max };
}

export type ConstraintCheckValue =
  | { kind: "text"; value: string }
  | { kind: "number"; value: number }
  | { kind: "date"; value: Date }
  | { kind: "multi_select"; value: string[] };

/**
 * The authoritative check. Runs on every write path, including the public join
 * form, so client-side widget bounds are only ever a convenience.
 *
 * Returns a user-facing message, or null when the value satisfies the field.
 */
export function validateFieldConstraints(
  field: Pick<MemberCustomField, "type" | "label" | "constraints">,
  input: ConstraintCheckValue,
): string | null {
  const constraints = pickConstraintsForType(field.type, field.constraints ?? {});
  const label = field.label;

  if (input.kind === "number") {
    if (constraints.integerOnly && !Number.isInteger(input.value)) {
      return `${label} must be a whole number.`;
    }

    if (constraints.min !== undefined && input.value < constraints.min) {
      return `${label} must be at least ${constraints.min}.`;
    }

    if (constraints.max !== undefined && input.value > constraints.max) {
      return `${label} must be at most ${constraints.max}.`;
    }

    return null;
  }

  if (input.kind === "multi_select") {
    const count = input.value.length;

    if (constraints.minSelected !== undefined && count < constraints.minSelected) {
      return `${label} needs at least ${constraints.minSelected} ${plural(
        constraints.minSelected,
        "option",
      )} selected.`;
    }

    if (constraints.maxSelected !== undefined && count > constraints.maxSelected) {
      return `${label} allows at most ${constraints.maxSelected} ${plural(
        constraints.maxSelected,
        "option",
      )}.`;
    }

    return null;
  }

  if (input.kind === "date") {
    const age = differenceInYears(new Date(), input.value);

    if (constraints.minAge !== undefined && age < constraints.minAge) {
      return `${label} requires an age of at least ${constraints.minAge}.`;
    }

    if (constraints.maxAge !== undefined && age > constraints.maxAge) {
      return `${label} requires an age of at most ${constraints.maxAge}.`;
    }

    const { min, max } = getDateConstraintBounds(constraints);

    if (min && startOfDayValue(input.value) < startOfDayValue(min)) {
      return `${label} must not be earlier than ${formatIsoDay(min)}.`;
    }

    if (max && startOfDayValue(input.value) > startOfDayValue(max)) {
      return `${label} must not be later than ${formatIsoDay(max)}.`;
    }

    return null;
  }

  const text = input.value;
  // Length is checked before the pattern so no unbounded input reaches the matcher.
  const effectiveMaxLength =
    constraints.maxLength ??
    (constraints.format === "custom" ? DEFAULT_PATTERN_MAX_LENGTH : undefined);

  if (constraints.minLength !== undefined && text.length < constraints.minLength) {
    return `${label} must be at least ${constraints.minLength} ${plural(
      constraints.minLength,
      "character",
    )}.`;
  }

  if (effectiveMaxLength !== undefined && text.length > effectiveMaxLength) {
    return `${label} must be at most ${effectiveMaxLength} ${plural(
      effectiveMaxLength,
      "character",
    )}.`;
  }

  const pattern = getTextPattern(constraints);

  if (pattern && !pattern.regex.test(text)) {
    return pattern.message
      ? `${label}: ${pattern.message}`
      : `${label} is not in the expected format.`;
  }

  return null;
}

function plural(count: number, word: string) {
  return count === 1 ? word : `${word}s`;
}

function startOfDayValue(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

function formatIsoDay(date: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}
