import { z } from "zod";

import { type Dictionary, messages } from "@/lib/i18n/messages";

import { formatDateTime } from "@/lib/format";
import {
  compilePattern,
  memberCustomFieldConstraintsSchema,
  pickConstraintsForType,
  validateFieldConstraints,
} from "@/lib/member-custom-field-constraints";
import type {
  CustomFieldValue,
  MemberCustomField,
  MemberCustomFieldStage,
  MemberCustomFieldType,
  MemberCustomFieldDiscoveryMode,
  MemberCustomFieldVisibility,
  MemberCustomFieldArt9Condition,
} from "@/server/db/schema";

export const memberCustomFieldTypeOptions: Array<{
  value: MemberCustomFieldType;
  label: string;
}> = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Textarea" },
  { value: "boolean", label: "Boolean" },
  { value: "number", label: "Number" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "date", label: "Date" },
  { value: "select", label: "Select" },
  { value: "multi_select", label: "Multi-select" },
];

export const memberCustomFieldStageOptions: Array<{
  value: MemberCustomFieldStage;
  label: string;
}> = [
  { value: "registration", label: "Registration" },
  { value: "post_approval", label: "After approval" },
  { value: "optional", label: "Optional only" },
  { value: "admin_only", label: "Admin only" },
];

/**
 * Who may read a field's answers. The member always reaches their own, through
 * the portal and through their data export, so they are not an option here.
 */
export const memberCustomFieldVisibilityOptions: Array<{
  value: MemberCustomFieldVisibility;
  label: string;
  description: string;
}> = [
  {
    value: "member_managers",
    label: "Admins and group leaders",
    description:
      "Org admins, plus leaders whose groups cover the member. The right choice for anything a leader needs in order to run an activity.",
  },
  {
    value: "org_admins",
    label: "Org admins only",
    description:
      "Leaders see that the field exists and whether it was answered, but not the answer. For data a leader has no reason to read.",
  },
];

export const memberCustomFieldArt9ConditionOptions: Array<{
  value: MemberCustomFieldArt9Condition;
  label: string;
  description: string;
}> = [
  {
    value: "not_for_profit_body",
    label: "Art. 9(2)(d) — not-for-profit body",
    description:
      "The organization's own members, on condition the data is not disclosed outside it without consent. The same exemption the member register itself relies on.",
  },
  {
    value: "explicit_consent",
    label: "Art. 9(2)(a) — explicit consent",
    description:
      "A separate, deliberate consent to a stated purpose. Not the registration checkbox. Admin-only fields for now: Spoleek cannot yet capture per-field consent.",
  },
  {
    value: "vital_interests",
    label: "Art. 9(2)(c) — vital interests",
    description:
      "Protecting someone's life where they cannot give consent. Narrow: it covers the emergency, not routine record-keeping about it.",
  },
  {
    value: "health_care",
    label: "Art. 9(2)(h) — health or social care",
    description:
      "Preventive medicine, diagnosis, or care provided by or under the responsibility of a health professional bound by professional secrecy.",
  },
  {
    value: "legal_claims",
    label: "Art. 9(2)(f) — legal claims",
    description:
      "Establishing, exercising or defending legal claims. For data you hold because of a dispute, not data you collect routinely.",
  },
];

export const memberCustomFieldDiscoveryModeOptions: Array<{
  value: MemberCustomFieldDiscoveryMode;
  label: string;
}> = [
  { value: "visible", label: "Displayed by default" },
  { value: "available", label: "Hidden by default (Available in Columns)" },
  { value: "hidden", label: "Completely hidden" },
];

export const memberCustomFieldSchema = z
  .object({
    id: z.string().uuid().optional(),
    label: z.string().trim().min(2, "Label is required."),
    key: z
      .string()
      .trim()
      .min(2, "Key is required.")
      .regex(
        /^[a-z0-9_]+$/,
        "Key can only contain lowercase letters, numbers, and underscores.",
      ),
    description: z.string().trim().optional(),
    type: z.enum([
      "text",
      "textarea",
      "boolean",
      "number",
      "email",
      "phone",
      "date",
      "select",
      "multi_select",
    ]),
    stage: z.enum(["registration", "post_approval", "optional", "admin_only"]),
    valueVisibility: z.enum(["member_managers", "org_admins"]).default("member_managers"),
    sensitivity: z.enum(["normal", "special_category"]).default("normal"),
    art9Condition: z
      .enum([
        "explicit_consent",
        "vital_interests",
        "not_for_profit_body",
        "legal_claims",
        "health_care",
      ])
      .nullish(),
    processingPurpose: z.string().trim().max(500).nullish(),
    retentionMonths: z.number().int().min(1).max(1200).nullable().default(null),
    discoveryMode: z.enum(["visible", "available", "hidden"]),
    required: z.boolean(),
    isActive: z.boolean(),
    isDateOfBirth: z.boolean().default(false),
    sortOrder: z.number().int().min(0).default(0),
    options: z.array(z.string().trim().min(1)).default([]),
    constraints: memberCustomFieldConstraintsSchema.default({}),
  })
  .superRefine((value, ctx) => {
    if (value.sensitivity === "special_category") {
      if (!value.art9Condition) {
        ctx.addIssue({
          code: "custom",
          path: ["art9Condition"],
          message:
            "Choose the Article 9(2) condition that lets the organization hold this.",
        });
      }

      if (!value.processingPurpose || value.processingPurpose.length < 10) {
        ctx.addIssue({
          code: "custom",
          path: ["processingPurpose"],
          message:
            "Say what this field is for. It is what the record of processing and any member asking will be answered with.",
        });
      }

      /**
       * The guard. Art. 9(2)(a) requires explicit consent to a *specified
       * purpose* — a separate, deliberate act, not the general registration
       * checkbox. Spoleek has no per-field consent mechanism yet, so a field
       * relying on consent cannot be put in front of a member: doing so would
       * collect special-category data with no valid condition behind it.
       *
       * Admin-only is allowed, because an admin recording an answer has
       * presumably taken consent on paper and can record it as such.
       *
       * Lift this once per-field explicit consent exists.
       */
      if (
        value.art9Condition === "explicit_consent" &&
        value.stage !== "admin_only"
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["stage"],
          message:
            "A field relying on explicit consent cannot be shown to members yet — Spoleek cannot capture per-field consent, and the registration checkbox does not count. Set it to Admin only, or choose a different Article 9(2) condition.",
        });
      }
    }

    if (value.sensitivity === "normal" && value.art9Condition) {
      ctx.addIssue({
        code: "custom",
        path: ["art9Condition"],
        message: "Only a special-category field needs an Article 9 condition.",
      });
    }

    if (value.isDateOfBirth && value.type !== "date") {
      ctx.addIssue({
        code: "custom",
        path: ["isDateOfBirth"],
        message: "Only a date field can hold the date of birth.",
      });
    }

    const needsOptions =
      value.type === "select" || value.type === "multi_select";

    if (needsOptions && value.options.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Add at least one option for select fields.",
      });
    }

    if (!needsOptions && value.options.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Options are only supported for select fields.",
      });
    }

    const constraints = pickConstraintsForType(value.type, value.constraints);

    const addConstraintIssue = (message: string) => {
      ctx.addIssue({ code: "custom", path: ["constraints"], message });
    };

    if (
      constraints.minAge !== undefined &&
      constraints.maxAge !== undefined &&
      constraints.minAge > constraints.maxAge
    ) {
      addConstraintIssue("Minimum age cannot be greater than maximum age.");
    }

    if (
      constraints.notBefore &&
      constraints.notAfter &&
      constraints.notBefore > constraints.notAfter
    ) {
      addConstraintIssue("Earliest date cannot be after the latest date.");
    }

    if (
      constraints.min !== undefined &&
      constraints.max !== undefined &&
      constraints.min > constraints.max
    ) {
      addConstraintIssue("Minimum value cannot be greater than maximum value.");
    }

    if (
      constraints.minLength !== undefined &&
      constraints.maxLength !== undefined &&
      constraints.minLength > constraints.maxLength
    ) {
      addConstraintIssue("Minimum length cannot be greater than maximum length.");
    }

    if (
      constraints.minSelected !== undefined &&
      constraints.maxSelected !== undefined &&
      constraints.minSelected > constraints.maxSelected
    ) {
      addConstraintIssue(
        "Minimum selected cannot be greater than maximum selected.",
      );
    }

    if (constraints.format === "custom") {
      if (!constraints.pattern) {
        addConstraintIssue("Add a pattern for the custom format.");
      } else if (!compilePattern(constraints.pattern)) {
        addConstraintIssue("That pattern is not a valid regular expression.");
      }
    }
  });

export const memberCustomFieldActiveSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

export const memberCustomFieldAnswersSchema = z.record(z.string(), z.unknown());

export type MemberCustomFieldFormValues = z.infer<typeof memberCustomFieldSchema>;
export type MemberCustomFieldAnswersInput = z.infer<
  typeof memberCustomFieldAnswersSchema
>;

export type MemberCustomFieldDisplayItem = {
  key: string;
  label: string;
  displayValue: string;
};

export function splitMemberName(fullName: string) {
  const trimmed = fullName.trim();

  if (!trimmed) {
    return {
      firstName: "",
      lastName: "",
    };
  }

  const parts = trimmed.split(/\s+/);

  if (parts.length === 1) {
    return {
      firstName: parts[0] ?? "",
      lastName: "",
    };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.slice(-1).join(" "),
  };
}

export function getMemberDisplayName(member: {
  firstName: string;
  lastName: string;
}) {
  return [member.firstName, member.lastName].filter(Boolean).join(" ").trim();
}

export function getFieldOptionList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function stringifyFieldOptions(options: string[]) {
  return options.join("\n");
}

export function normalizeFieldInputValue(
  field: Pick<
    MemberCustomField,
    "type" | "required" | "label" | "key" | "constraints"
  >,
  rawValue: unknown,
  /** Omitted by admin/portal callers, which stay English for now. */
  dict: Dictionary = messages.en,
): {
  normalized: CustomFieldValue;
  publicValue: string | boolean | number | string[] | null;
  error: string | null;
} {
  const label = field.label;

  if (field.type === "boolean") {
    const boolValue = rawValue === true || rawValue === "true" || rawValue === "on";

    if (field.required && !boolValue) {
      return {
        normalized: null,
        publicValue: null,
        error: dict.validation.required(label),
      };
    }

    return {
      normalized: boolValue,
      publicValue: boolValue,
      error: null,
    };
  }

  if (field.type === "multi_select") {
    const values = Array.isArray(rawValue)
      ? rawValue.map(String).map((item) => item.trim()).filter(Boolean)
      : typeof rawValue === "string"
        ? rawValue.split(",").map((item) => item.trim()).filter(Boolean)
        : [];

    if (field.required && values.length === 0) {
      return {
        normalized: null,
        publicValue: null,
        error: dict.validation.required(label),
      };
    }

    const constraintError = validateFieldConstraints(
      field,
      { kind: "multi_select", value: values },
      dict,
    );

    if (constraintError) {
      return { normalized: null, publicValue: null, error: constraintError };
    }

    return {
      normalized: values.length > 0 ? values : null,
      publicValue: values,
      error: null,
    };
  }

  const textValue =
    typeof rawValue === "string" ? rawValue.trim() : rawValue == null ? "" : String(rawValue).trim();

  if (field.required && textValue.length === 0) {
    return {
      normalized: null,
      publicValue: null,
      error: dict.validation.required(label),
    };
  }

  if (textValue.length === 0) {
    return {
      normalized: null,
      publicValue: null,
      error: null,
    };
  }

  if (field.type === "number") {
    const numberValue = Number(textValue);

    if (!Number.isFinite(numberValue)) {
      return {
        normalized: null,
        publicValue: null,
        error: dict.validation.mustBeNumber(label),
      };
    }

    const constraintError = validateFieldConstraints(
      field,
      { kind: "number", value: numberValue },
      dict,
    );

    if (constraintError) {
      return { normalized: null, publicValue: null, error: constraintError };
    }

    return {
      normalized: numberValue,
      publicValue: numberValue,
      error: null,
    };
  }

  if (field.type === "email") {
    const result = z.email().safeParse(textValue);

    if (!result.success) {
      return {
        normalized: null,
        publicValue: null,
        error: dict.validation.mustBeEmail(label),
      };
    }
  }

  if (field.type === "date") {
    const dateValue = new Date(textValue);

    if (Number.isNaN(dateValue.getTime())) {
      return {
        normalized: null,
        publicValue: null,
        error: dict.validation.mustBeDate(label),
      };
    }

    const constraintError = validateFieldConstraints(
      field,
      { kind: "date", value: dateValue },
      dict,
    );

    if (constraintError) {
      return { normalized: null, publicValue: null, error: constraintError };
    }

    return {
      normalized: dateValue.toISOString(),
      publicValue: textValue,
      error: null,
    };
  }

  const constraintError = validateFieldConstraints(
    field,
    { kind: "text", value: textValue },
    dict,
  );

  if (constraintError) {
    return { normalized: null, publicValue: null, error: constraintError };
  }

  return {
    normalized: textValue,
    publicValue: textValue,
    error: null,
  };
}

export function extractAnswerValue(value: CustomFieldValue): string | number | boolean | string[] | null {
  if (value == null) {
    return null;
  }

  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(String);
  }

  return null;
}

export function formatMemberCustomFieldValue(
  field: Pick<MemberCustomField, "type">,
  value: unknown,
) {
  if (value == null) {
    return null;
  }

  if (field.type === "boolean") {
    return value === true ? "Yes" : value === false ? "No" : null;
  }

  if (field.type === "date") {
    const date =
      value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;

    if (!date || Number.isNaN(date.getTime())) {
      return null;
    }

    return formatDateTime(date).replace(/,?\s+\d{1,2}:\d{2}\s?[AP]M$/i, "");
  }

  if (Array.isArray(value)) {
    const items = value
      .map((item) => String(item).trim())
      .filter(Boolean);

    return items.length > 0 ? items.join(", ") : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }

  return String(value).trim() || null;
}

export function buildMemberCustomFieldDisplayItems(
  fields: Array<Pick<MemberCustomField, "key" | "label" | "type">>,
  answers: Record<string, unknown>,
) {
  return fields.reduce<MemberCustomFieldDisplayItem[]>((items, field) => {
    const displayValue = formatMemberCustomFieldValue(field, answers[field.key]);

    if (!displayValue) {
      return items;
    }

    items.push({
      key: field.key,
      label: field.label,
      displayValue,
    });

    return items;
  }, []);
}
