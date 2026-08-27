"use client";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { EnabledProvisionField } from "@/components/app/member-approve-workspace-dialog";
import type { WorkspaceFieldValues } from "@/server/lib/workspace/field-catalog";

/**
 * The per-row Workspace provisioning fields shown when a row is expanded.
 * Values arrive pre-filled from auto-fill sources and stay overridable.
 */
export function WorkspaceRowFields({
  fields,
  values,
  onChange,
}: {
  fields: EnabledProvisionField[];
  values: WorkspaceFieldValues;
  onChange: (fieldKey: string, value: string | boolean) => void;
}) {
  const manualFields = fields.filter(
    (f) => !f.source || f.source.type === "manual",
  );

  return (
    <div className="border-t bg-muted/20 px-4 py-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {fields.map((field) => {
          const isAuto = field.source && field.source.type !== "manual";
          const val = values[field.fieldKey];

          return (
            <div key={field.fieldKey} className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <label
                  htmlFor={`ws-field-${field.fieldKey}`}
                  className="text-[11px] font-medium"
                >
                  {field.label}
                  {field.required ? " *" : ""}
                </label>
                {isAuto && val !== undefined && val !== "" ? (
                  <span className="rounded-sm bg-primary/10 px-1 py-0.5 text-[9px] font-medium text-primary">
                    auto
                  </span>
                ) : null}
              </div>
              {field.type === "boolean" ? (
                <Switch
                  id={`ws-field-${field.fieldKey}`}
                  checked={typeof val === "boolean" ? val : false}
                  onCheckedChange={(checked) =>
                    onChange(field.fieldKey, checked)
                  }
                />
              ) : (
                <Input
                  id={`ws-field-${field.fieldKey}`}
                  className={`h-7 ${field.required && !val ? "border-destructive" : ""}`}
                  type={
                    field.type === "email"
                      ? "email"
                      : field.type === "phone"
                        ? "tel"
                        : "text"
                  }
                  value={typeof val === "string" ? val : ""}
                  placeholder={field.placeholder}
                  onChange={(e) => onChange(field.fieldKey, e.target.value)}
                />
              )}
            </div>
          );
        })}
      </div>
      {manualFields.length === 0 && fields.length > 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          All values are auto-filled from member data. You can override them
          above.
        </p>
      ) : null}
    </div>
  );
}
