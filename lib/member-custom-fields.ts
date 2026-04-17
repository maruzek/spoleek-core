import { z } from "zod";

import { formatDateTime } from "@/lib/format";
import type {
  MemberCustomField,
  MemberCustomFieldStage,
  MemberCustomFieldType,
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
    stage: z.enum(["registration", "post_approval", "optional"]),
    required: z.boolean(),
    isActive: z.boolean(),
    sortOrder: z.number().int().min(0).default(0),
    options: z.array(z.string().trim().min(1)).default([]),
  })
  .superRefine((value, ctx) => {
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

export type CustomFieldValueRecord = {
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueDate: Date | null;
  valueJson: string[] | null;
};

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
  field: Pick<MemberCustomField, "type" | "required" | "label" | "key">,
  rawValue: unknown,
): {
  normalized: CustomFieldValueRecord;
  publicValue: string | boolean | number | string[] | null;
  error: string | null;
} {
  const label = field.label;

  if (field.type === "boolean") {
    const boolValue = rawValue === true || rawValue === "true" || rawValue === "on";

    if (field.required && !boolValue) {
      return {
        normalized: emptyNormalizedValue(),
        publicValue: null,
        error: `${label} is required.`,
      };
    }

    return {
      normalized: {
        ...emptyNormalizedValue(),
        valueBoolean: boolValue,
      },
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
        normalized: emptyNormalizedValue(),
        publicValue: null,
        error: `${label} is required.`,
      };
    }

    return {
      normalized: {
        ...emptyNormalizedValue(),
        valueJson: values,
      },
      publicValue: values,
      error: null,
    };
  }

  const textValue =
    typeof rawValue === "string" ? rawValue.trim() : rawValue == null ? "" : String(rawValue).trim();

  if (field.required && textValue.length === 0) {
    return {
      normalized: emptyNormalizedValue(),
      publicValue: null,
      error: `${label} is required.`,
    };
  }

  if (textValue.length === 0) {
    return {
      normalized: emptyNormalizedValue(),
      publicValue: null,
      error: null,
    };
  }

  if (field.type === "number") {
    const numberValue = Number(textValue);

    if (!Number.isFinite(numberValue)) {
      return {
        normalized: emptyNormalizedValue(),
        publicValue: null,
        error: `${label} must be a valid number.`,
      };
    }

    return {
      normalized: {
        ...emptyNormalizedValue(),
        valueNumber: numberValue,
      },
      publicValue: numberValue,
      error: null,
    };
  }

  if (field.type === "email") {
    const result = z.email().safeParse(textValue);

    if (!result.success) {
      return {
        normalized: emptyNormalizedValue(),
        publicValue: null,
        error: `${label} must be a valid email address.`,
      };
    }
  }

  if (field.type === "date") {
    const dateValue = new Date(textValue);

    if (Number.isNaN(dateValue.getTime())) {
      return {
        normalized: emptyNormalizedValue(),
        publicValue: null,
        error: `${label} must be a valid date.`,
      };
    }

    return {
      normalized: {
        ...emptyNormalizedValue(),
        valueDate: dateValue,
      },
      publicValue: textValue,
      error: null,
    };
  }

  return {
    normalized: {
      ...emptyNormalizedValue(),
      valueText: textValue,
    },
    publicValue: textValue,
    error: null,
  };
}

export function extractAnswerValue(answer: {
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueDate: Date | null;
  valueJson: string[] | null;
}) {
  if (answer.valueBoolean !== null) {
    return answer.valueBoolean;
  }

  if (answer.valueNumber !== null) {
    return answer.valueNumber;
  }

  if (answer.valueDate !== null) {
    return answer.valueDate.toISOString().slice(0, 10);
  }

  if (answer.valueJson !== null) {
    return answer.valueJson;
  }

  return answer.valueText;
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

function emptyNormalizedValue(): CustomFieldValueRecord {
  return {
    valueText: null,
    valueNumber: null,
    valueBoolean: null,
    valueDate: null,
    valueJson: null,
  };
}
