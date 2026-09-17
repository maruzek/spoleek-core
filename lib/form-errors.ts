import type { ZodError } from "zod";

/**
 * Zod issues → `{ field: [messages] }`, keyed by the first path segment.
 *
 * For forms that validate the whole value on submit and need to hand each
 * message back to the field it belongs to. Cross-field rules added with
 * `superRefine` land on the path they name, so a rule about the registration
 * label shows up under that input rather than vanishing.
 */
export function flattenSchemaErrors<TField extends string>(
  error: ZodError,
): Partial<Record<TField, string[]>> {
  const out: Partial<Record<TField, string[]>> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key !== "string") continue;
    (out[key as TField] ??= []).push(issue.message);
  }
  return out;
}
