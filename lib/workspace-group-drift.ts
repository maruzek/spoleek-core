import { z } from "zod";

/**
 * Every drift decision takes a list, so one row and "do this to all of them"
 * are the same code path — the count is the only difference the admin sees.
 */
const driftIds = z
  .array(z.uuid())
  .min(1, "Pick at least one address.")
  .max(200);

export const adoptWorkspaceGroupDriftSchema = z.object({ driftIds });

export const removeWorkspaceGroupDriftSchema = z.object({ driftIds });

export const ignoreWorkspaceGroupDriftSchema = z.object({
  driftIds,
  /** False puts an ignored address back in the inbox. */
  ignored: z.boolean(),
});

/**
 * What each decision means, in the admin's terms. `{group}` is substituted with
 * the Google group address.
 */
export const workspaceDriftActionCopy = {
  adopt: {
    label: "Adopt",
    description:
      "Add them to this Spoleek group. Someone Spoleek does not know yet is created as a pending member for you to approve.",
  },
  remove: {
    label: "Remove",
    description: "Delete this address from {group}. Nothing changes in Spoleek.",
  },
  ignore: {
    label: "Ignore",
    description:
      "Leave the address alone and stop listing it. It stays in {group} and Spoleek never touches it.",
  },
} as const;

export function describeDriftMemberType(memberType: string) {
  const value = memberType.toUpperCase();
  if (value === "GROUP") return "Nested Google group";
  if (value === "CUSTOMER") return "Everyone in the domain";
  if (value === "EXTERNAL") return "External address";
  return null;
}

/** A nested group or a whole-domain entry cannot become a Spoleek member. */
export function canAdoptDrift(memberType: string) {
  const value = memberType.toUpperCase();
  return value !== "GROUP" && value !== "CUSTOMER";
}
