import { E164_HINT, isE164, normalizeToE164 } from "@/lib/phone";

export type WorkspaceFieldType = "string" | "boolean" | "email" | "phone";

export type WorkspaceFieldDefinition = {
  key: string;
  label: string;
  type: WorkspaceFieldType;
  placeholder?: string;
  description?: string;
  apiPath: string;
  validation?: {
    pattern?: string;
    patternMessage?: string;
    maxLength?: number;
  };
};

export type WorkspaceFieldValues = Record<string, string | boolean>;

export type FieldSource =
  | { type: "manual" }
  | { type: "member_field"; memberFieldKey: MemberFieldKey }
  | { type: "member_custom_field"; customFieldKey: string }
  | { type: "group_category"; categoryId: string; formatTemplate: string }
  | { type: "org_unit_auto" };

export const MEMBER_FIELD_OPTIONS = [
  { key: "email", label: "Personal email" },
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
] as const;

export type MemberFieldKey = (typeof MEMBER_FIELD_OPTIONS)[number]["key"];

export type WorkspaceProvisionFieldConfig = {
  fieldKey: string;
  enabled: boolean;
  required: boolean;
  source?: FieldSource;
};

export function applyFormatTemplate(template: string, groupName: string): string {
  return template.replace(/\{name\}/g, groupName);
}

export const WORKSPACE_FIELD_CATALOG: WorkspaceFieldDefinition[] = [
  {
    key: "orgUnitPath",
    label: "Org Unit Path",
    type: "string",
    placeholder: "/Staff/Engineering",
    description: "Google Workspace organizational unit path.",
    apiPath: "orgUnitPath",
    validation: { maxLength: 512 },
  },
  {
    key: "recoveryEmail",
    label: "Recovery Email",
    type: "email",
    placeholder: "user@personal.com",
    description: "Personal email for account recovery.",
    apiPath: "recoveryEmail",
  },
  {
    key: "secondaryEmail",
    label: "Secondary Email",
    type: "email",
    placeholder: "user@personal.com",
    description:
      "Additional non-primary address listed on the Workspace account.",
    apiPath: "emails[0].address",
  },
  {
    key: "recoveryPhone",
    label: "Recovery Phone",
    type: "phone",
    placeholder: "+420123456789",
    description: "Phone in E.164 format for account recovery.",
    apiPath: "recoveryPhone",
    validation: {
      pattern: "^\\+[1-9]\\d{1,14}$",
      patternMessage: "Must be E.164 format (e.g. +420123456789)",
    },
  },
  {
    key: "department",
    label: "Department",
    type: "string",
    placeholder: "Engineering",
    description: "Department within the organization.",
    apiPath: "organizations[0].department",
  },
  {
    key: "jobTitle",
    label: "Job Title",
    type: "string",
    placeholder: "Software Engineer",
    description: "The user's job title.",
    apiPath: "organizations[0].title",
  },
  {
    key: "costCenter",
    label: "Cost Center",
    type: "string",
    placeholder: "CC-100",
    description: "Cost center for accounting purposes.",
    apiPath: "organizations[0].costCenter",
  },
  {
    key: "employeeId",
    label: "Employee ID",
    type: "string",
    placeholder: "EMP-001",
    description: "External employee identifier.",
    apiPath: "externalIds[0].value",
  },
  {
    key: "phone",
    label: "Phone Number",
    type: "phone",
    placeholder: "+420123456789",
    description: "Primary phone number.",
    apiPath: "phones[0].value",
  },
  {
    key: "managerEmail",
    label: "Manager Email",
    type: "email",
    placeholder: "manager@domain.com",
    description: "Email address of the user's manager.",
    apiPath: "relations[0].value",
  },
  {
    key: "includeInGlobalAddressList",
    label: "Include in Global Address List",
    type: "boolean",
    description: "Whether the user appears in the Workspace GAL.",
    apiPath: "includeInGlobalAddressList",
  },
  {
    key: "changePasswordAtNextLogin",
    label: "Change Password at Next Login",
    type: "boolean",
    description: "Force the user to change their password on first sign-in.",
    apiPath: "changePasswordAtNextLogin",
  },
];

export const WORKSPACE_FIELD_MAP = new Map(
  WORKSPACE_FIELD_CATALOG.map((f) => [f.key, f]),
);

// --- API body builder ---

type ApiBody = Record<string, unknown>;

function setNestedPath(body: ApiBody, path: string, value: unknown): void {
  const segments = path.split(".");

  let current: Record<string, unknown> = body;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const isLast = i === segments.length - 1;

    const arrayMatch = seg.match(/^(.+)\[(\d+)]$/);
    if (arrayMatch) {
      const arrayKey = arrayMatch[1]!;
      const index = Number(arrayMatch[2]);

      if (!Array.isArray(current[arrayKey])) {
        current[arrayKey] = [];
      }
      const arr = current[arrayKey] as Record<string, unknown>[];
      if (!arr[index]) arr[index] = {};

      if (isLast) {
        arr[index] = value as Record<string, unknown>;
      } else {
        current = arr[index] as Record<string, unknown>;
      }
    } else if (isLast) {
      current[seg] = value;
    } else {
      if (typeof current[seg] !== "object" || current[seg] === null) {
        current[seg] = {};
      }
      current = current[seg] as Record<string, unknown>;
    }
  }
}

export function buildGoogleApiExtraFields(
  extraFields: WorkspaceFieldValues,
): ApiBody {
  const body: ApiBody = {};

  for (const [key, value] of Object.entries(extraFields)) {
    const def = WORKSPACE_FIELD_MAP.get(key);
    if (!def) continue;

    if (typeof value === "string" && value.trim() === "") continue;

    if (def.apiPath === "externalIds[0].value") {
      setNestedPath(body, "externalIds[0]", {
        value,
        type: "organization",
      });
    } else if (def.apiPath === "relations[0].value") {
      setNestedPath(body, "relations[0]", {
        value,
        type: "manager",
      });
    } else if (def.apiPath === "emails[0].address") {
      // Google keeps the primary address in `primaryEmail`; anything in the
      // `emails` array is a secondary address. "home" is what the Admin
      // console renders as the user's personal/secondary email.
      setNestedPath(body, "emails[0]", {
        address: value,
        type: "home",
        primary: false,
      });
    } else if (def.apiPath === "phones[0].value") {
      setNestedPath(body, "phones[0]", {
        value,
        type: "work",
      });
    } else if (def.apiPath.startsWith("organizations[0].")) {
      const subKey = def.apiPath.split(".")[1]!;
      if (!Array.isArray(body.organizations)) {
        body.organizations = [{ type: "work", primary: true }];
      }
      const org = (body.organizations as Record<string, unknown>[])[0]!;
      org[subKey] = value;
    } else {
      setNestedPath(body, def.apiPath, value);
    }
  }

  return body;
}

// --- Normalization ---

/**
 * Bring raw values into the shape the Google Directory API expects.
 *
 * Phone-typed fields (Recovery Phone, Phone Number) must be strictly E.164 —
 * Google rejects anything else — so a number written the way people actually
 * write it is converted here, using `defaultCountry` to complete a number
 * given in local form. Anything that cannot be completed is left as-is and
 * caught by `validateWorkspaceFieldValues`.
 */
export function normalizeWorkspaceFieldValues(
  values: WorkspaceFieldValues,
  defaultCountry?: string | null,
): WorkspaceFieldValues {
  const normalized: WorkspaceFieldValues = {};

  for (const [key, value] of Object.entries(values)) {
    const def = WORKSPACE_FIELD_MAP.get(key);

    if (typeof value !== "string" || !def) {
      normalized[key] = value;
      continue;
    }

    if (def.type === "phone") {
      normalized[key] = normalizeToE164(value, defaultCountry);
    } else if (def.type === "email") {
      normalized[key] = value.trim().toLowerCase();
    } else {
      normalized[key] = value.trim();
    }
  }

  return normalized;
}

// --- Validation ---

/**
 * Format-check one value. Returns the error message, or null when the value is
 * acceptable (an empty value is "acceptable" here — required-ness is a
 * separate, config-driven concern handled by `validateWorkspaceFieldValues`).
 *
 * Shared by the server actions and the provisioning UIs so an admin sees the
 * same message inline that the server would have rejected the row with.
 */
export function getWorkspaceFieldFormatError(
  fieldKey: string,
  value: string | boolean | undefined,
): string | null {
  const def = WORKSPACE_FIELD_MAP.get(fieldKey);
  if (!def || typeof value !== "string" || value === "") return null;

  if (def.validation?.pattern) {
    if (!new RegExp(def.validation.pattern).test(value)) {
      return (
        def.validation.patternMessage ?? `${def.label} has an invalid format.`
      );
    }
  }

  if (def.validation?.maxLength && value.length > def.validation.maxLength) {
    return `${def.label} must be at most ${def.validation.maxLength} characters.`;
  }

  if (def.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
    return `${def.label} must be a valid email address.`;
  }

  // Google's Directory API only accepts E.164 phone numbers, so this is a
  // hard requirement of the type rather than a per-field pattern that an
  // admin could configure away.
  if (def.type === "phone" && !isE164(value)) {
    return `${def.label} must be in E.164 format. ${E164_HINT}`;
  }

  return null;
}

export function validateWorkspaceFieldValues(
  config: WorkspaceProvisionFieldConfig[],
  values: WorkspaceFieldValues,
): { valid: true } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  // Anything with a value gets format-checked, even when it is not in the
  // enabled config — a stray value still reaches Google and still has to be
  // valid there.
  const enabled = new Map(
    config.filter((f) => f.enabled).map((f) => [f.fieldKey, f]),
  );
  const fieldKeys = new Set([...enabled.keys(), ...Object.keys(values)]);

  for (const fieldKey of fieldKeys) {
    const field = enabled.get(fieldKey);
    const def = WORKSPACE_FIELD_MAP.get(fieldKey);
    if (!def) continue;

    const val = values[fieldKey];

    if (field?.required) {
      if (val === undefined || val === null || val === "") {
        errors[fieldKey] = `${def.label} is required.`;
        continue;
      }
    }

    if (val === undefined || val === null || val === "") continue;

    const formatError = getWorkspaceFieldFormatError(fieldKey, val);
    if (formatError) errors[fieldKey] = formatError;
  }

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true };
}
