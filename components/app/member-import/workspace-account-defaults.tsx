"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { EnabledProvisionField } from "@/components/app/member-approve-workspace-dialog";

export type TriState = boolean | "indeterminate";

/**
 * Bulk switches for the yes/no account settings.
 *
 * Only boolean fields appear here. Everything else a new account needs —
 * email, recovery phone, org unit — differs per person, so a single value for
 * all of them would be wrong by construction. These do not: an import almost
 * always wants the same answer for every account it creates.
 *
 * Setting one writes through to every row, and per-row overrides in the
 * expanded field editor still win afterwards; the control then shows mixed.
 */
export function WorkspaceAccountDefaults({
  fields,
  values,
  onChange,
}: {
  fields: EnabledProvisionField[];
  values: Record<string, TriState>;
  onChange: (fieldKey: string, value: boolean) => void;
}) {
  if (fields.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-muted/30 px-3 py-2">
      <span className="text-xs font-medium text-muted-foreground">
        Apply to all new accounts
      </span>
      {fields.map((field) => {
        const value = values[field.fieldKey] ?? false;
        return (
          <Label
            key={field.fieldKey}
            className="flex cursor-pointer items-center gap-2 text-xs font-normal"
          >
            <Checkbox
              checked={value}
              onCheckedChange={(checked) =>
                onChange(field.fieldKey, checked === true)
              }
            />
            {field.label}
            {value === "indeterminate" && (
              <span className="text-[10px] text-muted-foreground">(mixed)</span>
            )}
          </Label>
        );
      })}
    </div>
  );
}
