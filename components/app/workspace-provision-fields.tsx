"use client";

import type { ReactNode } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  MEMBER_FIELD_OPTIONS,
  WORKSPACE_FIELD_CATALOG,
  type FieldSource,
  type WorkspaceProvisionFieldConfig,
} from "@/server/lib/workspace/field-catalog";

/**
 * Builds a full config row set from whatever is persisted, so callers can seed
 * state from a partial list (a fresh org has none at all).
 */
export function toProvisionFieldState(
  saved: WorkspaceProvisionFieldConfig[],
): WorkspaceProvisionFieldConfig[] {
  return WORKSPACE_FIELD_CATALOG.map((def) => {
    const existing = saved.find((field) => field.fieldKey === def.key);
    return existing ?? { fieldKey: def.key, enabled: false, required: false };
  });
}

export function WorkspaceProvisionFields({
  fields,
  onFieldsChange,
  customFields,
  groupCategories,
  description = "These fields are filled in automatically when a member's Workspace account is created — during approval, import, or manual creation.",
  footnote,
}: {
  fields: WorkspaceProvisionFieldConfig[];
  onFieldsChange: (
    updater: (prev: WorkspaceProvisionFieldConfig[]) => WorkspaceProvisionFieldConfig[],
  ) => void;
  customFields: { key: string; label: string }[];
  groupCategories: { id: string; name: string }[];
  description?: string;
  /** Rendered under the table — used in first-run setup to set expectations. */
  footnote?: ReactNode;
}) {
  const updateFieldSource = (fieldKey: string, source: FieldSource) => {
    onFieldsChange((prev) =>
      prev.map((f) => (f.fieldKey === fieldKey ? { ...f, source } : f)),
    );
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-col gap-1">
        <Label>Provisioning fields</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto] gap-px bg-border text-xs font-medium text-muted-foreground">
          <div className="bg-muted/60 px-3 py-2">Field</div>
          <div className="bg-muted/60 px-3 py-2 text-center">Enabled</div>
          <div className="bg-muted/60 px-3 py-2 text-center">Required</div>
        </div>
        <div className="divide-y">
          {WORKSPACE_FIELD_CATALOG.map((def) => {
            const fieldConfig = fields.find((f) => f.fieldKey === def.key);
            const enabled = fieldConfig?.enabled ?? false;
            const required = fieldConfig?.required ?? false;
            const source = fieldConfig?.source ?? { type: "manual" as const };

            return (
              <div key={def.key} className="flex flex-col">
                <div className="grid grid-cols-[1fr_auto_auto] items-center gap-px">
                  <div className="bg-background px-3 py-2.5">
                    <p className="text-sm font-medium">{def.label}</p>
                    {def.description ? (
                      <p className="text-[11px] text-muted-foreground">
                        {def.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-center bg-background px-3 py-2.5">
                    <Switch
                      checked={enabled}
                      onCheckedChange={(checked) => {
                        onFieldsChange((prev) =>
                          prev.map((f) =>
                            f.fieldKey === def.key
                              ? {
                                  ...f,
                                  enabled: checked,
                                  required: checked ? f.required : false,
                                }
                              : f,
                          ),
                        );
                      }}
                      aria-label={`Enable ${def.label}`}
                    />
                  </div>
                  <div className="flex items-center justify-center bg-background px-3 py-2.5">
                    <Checkbox
                      checked={required}
                      disabled={!enabled}
                      onCheckedChange={(checked) => {
                        onFieldsChange((prev) =>
                          prev.map((f) =>
                            f.fieldKey === def.key
                              ? { ...f, required: Boolean(checked) }
                              : f,
                          ),
                        );
                      }}
                      aria-label={`Require ${def.label}`}
                    />
                  </div>
                </div>

                {enabled && def.type !== "boolean" ? (
                  <div className="border-t bg-muted/20 px-3 py-2.5">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Auto-fill source
                    </p>
                    <div className="flex flex-wrap items-start gap-2">
                      {/* Source type selector */}
                      <select
                        className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        value={source.type}
                        onChange={(e) => {
                          const t = e.target.value as FieldSource["type"];
                          if (t === "manual") updateFieldSource(def.key, { type: "manual" });
                          else if (t === "member_field") updateFieldSource(def.key, { type: "member_field", memberFieldKey: "email" });
                          else if (t === "org_unit_auto") updateFieldSource(def.key, { type: "org_unit_auto" });
                          else if (t === "member_custom_field") updateFieldSource(def.key, { type: "member_custom_field", customFieldKey: "" });
                          else if (t === "group_category") updateFieldSource(def.key, { type: "group_category", categoryId: "", formatTemplate: "{name}" });
                        }}
                      >
                        <option value="manual">Manual — entered at provision time</option>
                        <option value="member_field">From member profile field</option>
                        {def.key === "orgUnitPath" ? (
                          <option value="org_unit_auto">Auto — from org unit category</option>
                        ) : null}
                        {customFields.length > 0 ? (
                          <option value="member_custom_field">From member custom field</option>
                        ) : null}
                        {groupCategories.length > 0 ? (
                          <option value="group_category">From group category (with template)</option>
                        ) : null}
                      </select>

                      {/* Member profile field picker */}
                      {source.type === "member_field" ? (
                        <select
                          className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          value={source.memberFieldKey}
                          onChange={(e) =>
                            updateFieldSource(def.key, {
                              type: "member_field",
                              memberFieldKey: e.target.value as typeof source.memberFieldKey,
                            })
                          }
                        >
                          {MEMBER_FIELD_OPTIONS.map((mf) => (
                            <option key={mf.key} value={mf.key}>
                              {mf.label}
                            </option>
                          ))}
                        </select>
                      ) : null}

                      {/* Member custom field picker */}
                      {source.type === "member_custom_field" ? (
                        <select
                          className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          value={source.customFieldKey}
                          onChange={(e) =>
                            updateFieldSource(def.key, {
                              type: "member_custom_field",
                              customFieldKey: e.target.value,
                            })
                          }
                        >
                          <option value="">— select field —</option>
                          {customFields.map((cf) => (
                            <option key={cf.key} value={cf.key}>
                              {cf.label}
                            </option>
                          ))}
                        </select>
                      ) : null}

                      {/* Group category picker + format template */}
                      {source.type === "group_category" ? (
                        <>
                          <select
                            className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                            value={source.categoryId}
                            onChange={(e) =>
                              updateFieldSource(def.key, {
                                type: "group_category",
                                categoryId: e.target.value,
                                formatTemplate: source.formatTemplate,
                              })
                            }
                          >
                            <option value="">— select category —</option>
                            {groupCategories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          <div className="flex flex-col gap-1">
                            <Input
                              className="h-8 w-48 text-xs"
                              placeholder="{name}"
                              value={source.formatTemplate}
                              onChange={(e) =>
                                updateFieldSource(def.key, {
                                  type: "group_category",
                                  categoryId: source.categoryId,
                                  formatTemplate: e.target.value,
                                })
                              }
                            />
                            <p className="text-[10px] text-muted-foreground">
                              <code>{"{name}"}</code> = group name
                            </p>
                          </div>
                        </>
                      ) : null}

                      {source.type === "org_unit_auto" ? (
                        <p className="flex items-center text-[11px] text-muted-foreground">
                          Uses the <code className="mx-1">{"{name}"}</code> org unit path from the member&apos;s group in the org unit category.
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {footnote ? (
        <p className="text-xs text-muted-foreground">{footnote}</p>
      ) : null}
    </div>
  );
}
