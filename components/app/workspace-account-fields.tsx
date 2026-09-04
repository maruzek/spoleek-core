"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircleIcon, CheckCircle2Icon, Loader2Icon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { normalizeToE164 } from "@/lib/phone";
import { checkWorkspaceEmailAvailabilityAction } from "@/server/actions/member-admin";
import { getWorkspaceFieldFormatError } from "@/server/lib/workspace/field-catalog";
import type {
  FieldSource,
  WorkspaceFieldDefinition,
  WorkspaceFieldValues,
  WorkspaceProvisionFieldConfig,
} from "@/server/lib/workspace/field-catalog";

/**
 * One provisioning field as the admin sees it: the org's configuration for it
 * plus the catalog metadata needed to render an input.
 */
export type EnabledProvisionField = WorkspaceProvisionFieldConfig &
  Pick<WorkspaceFieldDefinition, "label" | "type" | "placeholder" | "description"> & {
    source?: FieldSource;
  };

export type AvailabilityState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available" }
  | { status: "taken"; existingFullName: string | null }
  | { status: "error"; message: string }
  | { status: "module_off" }
  | { status: "not_connected" };

export const WORKSPACE_EMAIL_PATTERN = /^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

export function isEmptyValue(value: string | boolean | undefined): boolean {
  return value === undefined || (typeof value === "string" && value.trim() === "");
}

/**
 * Why an auto-filled field came back empty. A configured source that resolves
 * to nothing used to render as an ordinary blank input, which reads as "the
 * auto-fill is broken" — it usually means the member simply has no value yet
 * (a custom field only collected after approval, for instance).
 */
export function describeEmptySource(source: FieldSource | undefined): string | null {
  if (!source || source.type === "manual") return null;
  if (source.type === "member_field") {
    return "This member has no value in their profile — enter it manually.";
  }
  if (source.type === "member_custom_field") {
    return `This member has not answered the "${source.customFieldKey}" field yet — enter it manually.`;
  }
  if (source.type === "group_category") {
    return "This member is not in a group of the configured category — enter it manually.";
  }
  return "No org unit is assigned to this member's group — enter it manually.";
}

/** Debounced "is this address free in Workspace?" probe. */
export function useWorkspaceEmailAvailability({
  email,
  memberId,
  enabled = true,
}: {
  email: string;
  memberId: string;
  enabled?: boolean;
}): AvailabilityState {
  const [availability, setAvailability] = useState<AvailabilityState>({
    status: "idle",
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkTokenRef = useRef(0);

  useEffect(() => {
    const trimmed = email.trim().toLowerCase();

    if (!enabled || !WORKSPACE_EMAIL_PATTERN.test(trimmed)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAvailability({ status: "idle" });
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    setAvailability({ status: "checking" });
    const token = ++checkTokenRef.current;

    debounceRef.current = setTimeout(async () => {
      const result = await checkWorkspaceEmailAvailabilityAction({
        memberId,
        primaryEmail: trimmed,
      });
      if (token !== checkTokenRef.current) return;
      const data = result?.data;
      if (!data) {
        setAvailability({
          status: "error",
          message: result?.serverError ?? "Failed to check availability.",
        });
        return;
      }
      if (data.status === "available") setAvailability({ status: "available" });
      else if (data.status === "taken")
        setAvailability({
          status: "taken",
          existingFullName: data.existingFullName,
        });
      else if (data.status === "module_off")
        setAvailability({ status: "module_off" });
      else if (data.status === "not_connected")
        setAvailability({ status: "not_connected" });
      else
        setAvailability({
          status: "error",
          message: data.message ?? "Unknown error",
        });
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [email, memberId, enabled]);

  return availability;
}

/** Format errors keyed by field, plus whether a required field is still blank. */
export function useProvisionFieldState(
  provisionFields: EnabledProvisionField[],
  values: WorkspaceFieldValues,
) {
  const fieldErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    for (const field of provisionFields) {
      const error = getWorkspaceFieldFormatError(
        field.fieldKey,
        values[field.fieldKey],
      );
      if (error) errors[field.fieldKey] = error;
    }
    return errors;
  }, [provisionFields, values]);

  const requiredFieldsMissing = useMemo(() => {
    for (const field of provisionFields) {
      if (!field.required) continue;
      if (field.type === "boolean") continue;
      const value = values[field.fieldKey];
      if (!value || (typeof value === "string" && value.trim() === "")) {
        return true;
      }
    }
    return false;
  }, [provisionFields, values]);

  return { fieldErrors, requiredFieldsMissing };
}

export function ProvisionFieldInput({
  field,
  value,
  error,
  sourceEmpty,
  defaultPhoneCountry,
  onChange,
}: {
  field: EnabledProvisionField;
  value: string | boolean | undefined;
  error?: string;
  /** An auto-fill source is configured but produced no value. */
  sourceEmpty?: boolean;
  defaultPhoneCountry?: string;
  onChange: (value: string | boolean) => void;
}) {
  const labelSuffix = field.required ? " *" : "";
  const hasSource = Boolean(field.source && field.source.type !== "manual");
  const isAutoFilled = hasSource && !isEmptyValue(value);
  const emptySourceHint =
    hasSource && sourceEmpty ? describeEmptySource(field.source) : null;

  if (field.type === "boolean") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
        <div className="flex flex-col gap-0.5">
          <Label className="text-sm">{field.label}</Label>
          {field.description ? (
            <p className="text-[11px] text-muted-foreground">
              {field.description}
            </p>
          ) : null}
        </div>
        <Switch
          checked={typeof value === "boolean" ? value : false}
          onCheckedChange={onChange}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Label>
          {field.label}
          {labelSuffix}
        </Label>
        {isAutoFilled ? (
          <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            auto
          </span>
        ) : emptySourceHint ? (
          <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            no data
          </span>
        ) : null}
      </div>
      <Input
        type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
        onBlur={
          field.type === "phone"
            ? (event) => {
                // Rewrite to E.164 once the admin is done typing, so the
                // value on screen is the value Google gets.
                const normalized = normalizeToE164(
                  event.target.value,
                  defaultPhoneCountry,
                );
                if (normalized !== event.target.value) onChange(normalized);
              }
            : undefined
        }
        placeholder={field.placeholder}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={Boolean(error) || (field.required && isEmptyValue(value))}
      />
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : emptySourceHint ? (
        <p className="text-[11px] text-muted-foreground">{emptySourceHint}</p>
      ) : field.description ? (
        <p className="text-[11px] text-muted-foreground">{field.description}</p>
      ) : null}
    </div>
  );
}

export function AvailabilityBadge({ state }: { state: AvailabilityState }) {
  if (state.status === "idle") {
    return (
      <p className="text-xs text-muted-foreground">
        Tokens: <code>{"{first}"}</code>, <code>{"{last}"}</code>,{" "}
        <code>{"{initial}"}</code>. Configurable in Settings → Google
        Workspace.
      </p>
    );
  }
  if (state.status === "checking") {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2Icon className="size-3 animate-spin" />
        Checking availability in Workspace…
      </p>
    );
  }
  if (state.status === "available") {
    return (
      <p className="flex items-center gap-2 text-xs text-emerald-600">
        <CheckCircle2Icon className="size-3" />
        Available — this email is not in use.
      </p>
    );
  }
  if (state.status === "taken") {
    return (
      <p className="flex items-center gap-2 text-xs text-destructive">
        <AlertCircleIcon className="size-3" />
        Already in use
        {state.existingFullName ? ` by ${state.existingFullName}` : ""}.
        Pick a different address.
      </p>
    );
  }
  if (state.status === "module_off" || state.status === "not_connected") {
    return (
      <p className="flex items-center gap-2 text-xs text-destructive">
        <AlertCircleIcon className="size-3" />
        Workspace module is not connected. Reconnect it in Settings.
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 text-xs text-destructive">
      <AlertCircleIcon className="size-3" />
      {state.message}
    </p>
  );
}
