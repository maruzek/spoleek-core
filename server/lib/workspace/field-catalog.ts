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

export type WorkspaceProvisionFieldConfig = {
  fieldKey: string;
  enabled: boolean;
  required: boolean;
};

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
        arr[index] = value;
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

// --- Validation ---

export function validateWorkspaceFieldValues(
  config: WorkspaceProvisionFieldConfig[],
  values: WorkspaceFieldValues,
): { valid: true } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  for (const field of config) {
    if (!field.enabled) continue;
    const def = WORKSPACE_FIELD_MAP.get(field.fieldKey);
    if (!def) continue;

    const val = values[field.fieldKey];

    if (field.required) {
      if (val === undefined || val === null || val === "") {
        errors[field.fieldKey] = `${def.label} is required.`;
        continue;
      }
    }

    if (val === undefined || val === null || val === "") continue;

    if (typeof val === "string" && def.validation?.pattern) {
      const re = new RegExp(def.validation.pattern);
      if (!re.test(val)) {
        errors[field.fieldKey] =
          def.validation.patternMessage ?? `${def.label} has an invalid format.`;
      }
    }

    if (
      typeof val === "string" &&
      def.validation?.maxLength &&
      val.length > def.validation.maxLength
    ) {
      errors[field.fieldKey] = `${def.label} must be at most ${def.validation.maxLength} characters.`;
    }

    if (def.type === "email" && typeof val === "string") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val)) {
        errors[field.fieldKey] = `${def.label} must be a valid email address.`;
      }
    }
  }

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true };
}
