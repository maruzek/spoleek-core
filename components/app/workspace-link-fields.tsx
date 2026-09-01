"use client";

import { useCallback, useRef, useState } from "react";

import { useAction } from "next-safe-action/hooks";
import { Loader2Icon, SearchIcon } from "lucide-react";

import {
  workspaceGroupRoleOptions,
  workspaceLinkDirectionOptions,
  workspaceLinkRemovalPolicyOptions,
  type WorkspaceLinkSettings,
} from "@/lib/workspace-group-links";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { searchWorkspaceGroupsAction } from "@/server/actions/workspace";
import type { WorkspaceGroup } from "@/server/lib/workspace/client";

export function withGroupName(template: string, groupEmail: string | null) {
  return template.replaceAll("{group}", groupEmail ?? "the Google group");
}

/**
 * Google's Directory API only does prefix search, so an empty box returns a
 * near-arbitrary slice of the domain's groups. The copy says so rather than
 * letting the admin conclude their group does not exist.
 */
export function WorkspaceGroupPicker({
  id = "workspace-group-picker",
  value,
  onValueChange,
  disabled,
}: {
  id?: string;
  value: string | null;
  onValueChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WorkspaceGroup[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchGroups = useAction(searchWorkspaceGroupsAction);

  const runSearch = useCallback(
    (next: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (next.trim().length === 0) {
        setResults([]);
        setHasSearched(false);
        return;
      }
      debounceRef.current = setTimeout(async () => {
        const result = await searchGroups.executeAsync({ query: next });
        setResults(result?.data ?? []);
        setHasSearched(true);
      }, 300);
    },
    [searchGroups],
  );

  return (
    <Field>
      <FieldLabel htmlFor={id}>Google group</FieldLabel>
      <FieldContent className="min-w-0">
        <Combobox
          value={value}
          onValueChange={onValueChange}
          filter={() => true}
          disabled={disabled}
        >
          <ComboboxInput
            id={id}
            placeholder="Start typing a group address, e.g. board"
            showClear={Boolean(value)}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              runSearch(event.target.value);
            }}
          />
          <ComboboxContent>
            <ComboboxList>
              {query.trim().length === 0 ? (
                <div className="flex items-center justify-center gap-2 px-3 py-6 text-center text-muted-foreground text-sm">
                  <SearchIcon className="size-4 shrink-0" />
                  Type to search your Google groups
                </div>
              ) : searchGroups.isPending || !hasSearched ? (
                <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-sm">
                  <Loader2Icon className="size-4 animate-spin" />
                  Searching…
                </div>
              ) : results.length === 0 ? (
                // Base UI derives its own empty state from an `items` prop we
                // do not use, so the message is driven by the results instead.
                <div className="px-3 py-6 text-center text-muted-foreground text-sm">
                  No group starts with “{query.trim()}”.
                </div>
              ) : (
                results.map((group) => (
                  <ComboboxItem key={group.id} value={group.email}>
                    <span className="font-medium">{group.name}</span>
                    <span className="ml-1 text-muted-foreground text-xs">
                      {group.email}
                    </span>
                  </ComboboxItem>
                ))
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <FieldDescription>
          Search matches the start of the address, so type the beginning of the
          group name rather than the domain.
        </FieldDescription>
      </FieldContent>
    </Field>
  );
}

/**
 * Every link setting, in one place, so creating a link and editing one later
 * offer exactly the same choices.
 */
export function WorkspaceLinkSettingsFields({
  value,
  onChange,
  groupEmail,
  showEnabled,
  isEnabled,
  onEnabledChange,
}: {
  value: WorkspaceLinkSettings;
  onChange: (next: WorkspaceLinkSettings) => void;
  groupEmail: string | null;
  showEnabled?: boolean;
  isEnabled?: boolean;
  onEnabledChange?: (next: boolean) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Field>
        <FieldLabel>Which system decides membership?</FieldLabel>
        <FieldContent className="min-w-0">
          <RadioGroup
            value={value.direction}
            onValueChange={(next) =>
              onChange({
                ...value,
                direction: next as WorkspaceLinkSettings["direction"],
              })
            }
            className="gap-3"
          >
            {workspaceLinkDirectionOptions.map((option) => (
              <label
                key={option.value}
                className="flex min-w-0 cursor-pointer items-start gap-3 rounded-md border p-3"
              >
                <RadioGroupItem value={option.value} className="mt-1 shrink-0" />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="font-medium text-sm">{option.label}</span>
                  <span className="break-words text-muted-foreground text-sm">
                    {withGroupName(option.description, groupEmail)}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </FieldContent>
      </Field>

      {value.direction === "push" ? (
        <>
          <Field>
            <FieldLabel>When someone leaves this group</FieldLabel>
            <FieldContent className="min-w-0">
              <RadioGroup
                value={value.removalPolicy}
                onValueChange={(next) =>
                  onChange({
                    ...value,
                    removalPolicy: next as WorkspaceLinkSettings["removalPolicy"],
                  })
                }
                className="gap-3"
              >
                {workspaceLinkRemovalPolicyOptions.map((option) => (
                  <label
                    key={option.value}
                    className="flex min-w-0 cursor-pointer items-start gap-3 rounded-md border p-3"
                  >
                    <RadioGroupItem
                      value={option.value}
                      className="mt-1 shrink-0"
                    />
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="font-medium text-sm">{option.label}</span>
                      <span className="break-words text-muted-foreground text-sm">
                        {option.description}
                      </span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </FieldContent>
          </Field>

          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <Field className="min-w-0">
              <FieldLabel htmlFor="link-member-role">
                Google role for members
              </FieldLabel>
              <FieldContent className="min-w-0">
                <Select
                  value={value.memberRole}
                  onValueChange={(next) =>
                    onChange({
                      ...value,
                      memberRole: next as WorkspaceLinkSettings["memberRole"],
                    })
                  }
                >
                  <SelectTrigger id="link-member-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaceGroupRoleOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>

            <Field className="min-w-0">
              <FieldLabel htmlFor="link-admin-role">
                Google role for group admins
              </FieldLabel>
              <FieldContent className="min-w-0">
                <Select
                  value={value.adminRole}
                  onValueChange={(next) =>
                    onChange({
                      ...value,
                      adminRole: next as WorkspaceLinkSettings["adminRole"],
                    })
                  }
                >
                  <SelectTrigger id="link-admin-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaceGroupRoleOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription className="break-words">
                  Lets group admins moderate their own list without a Workspace
                  admin.
                </FieldDescription>
              </FieldContent>
            </Field>
          </div>

          <Field orientation="horizontal" className="min-w-0">
            <FieldContent className="min-w-0">
              <FieldTitle>Include members without a Workspace account</FieldTitle>
              <FieldDescription className="break-words">
                Adds their personal address instead, so the list is complete.
                Their private email becomes visible to the Google group.
              </FieldDescription>
            </FieldContent>
            <Switch
              className="shrink-0"
              checked={value.includeExternal}
              onCheckedChange={(checked) =>
                onChange({ ...value, includeExternal: checked })
              }
            />
          </Field>
        </>
      ) : null}

      {showEnabled ? (
        <Field orientation="horizontal" className="min-w-0">
          <FieldContent className="min-w-0">
            <FieldTitle>Link active</FieldTitle>
            <FieldDescription className="break-words">
              Pausing stops all syncing without losing what Spoleek already
              added.
            </FieldDescription>
          </FieldContent>
          <Switch
            className="shrink-0"
            checked={isEnabled ?? true}
            onCheckedChange={(checked) => onEnabledChange?.(checked)}
          />
        </Field>
      ) : null}
    </div>
  );
}
