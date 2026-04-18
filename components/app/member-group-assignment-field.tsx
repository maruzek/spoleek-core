"use client";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export type MemberManageableGroupCategory = {
  id: string;
  name: string;
  selectionMode: "single" | "multiple";
  selectionRequired: boolean;
  groups: Array<{
    id: string;
    name: string;
    description: string | null;
  }>;
};

function getCategorySelection(groupIds: string[], groupIdsInCategory: string[]) {
  const selected = new Set(groupIds);
  return groupIdsInCategory.filter((groupId) => selected.has(groupId));
}

export function MemberGroupAssignmentField({
  categories,
  groupIds,
  error,
  description,
  onChange,
}: {
  categories: MemberManageableGroupCategory[];
  groupIds: string[];
  error?: string;
  description: string;
  onChange: (value: string[]) => void;
}) {
  if (categories.length === 0) {
    return null;
  }

  const invalid = Boolean(error);

  return (
    <FieldSet>
      <FieldLegend>Group assignments</FieldLegend>
      <FieldDescription>{description}</FieldDescription>

      {categories.map((category) => {
        const categoryGroupIds = category.groups.map((group) => group.id);
        const selectedGroupIds = getCategorySelection(groupIds, categoryGroupIds);

        if (category.selectionMode === "single") {
          const selectedValue = selectedGroupIds[0] ?? "none";

          return (
            <FieldSet key={category.id}>
              <FieldLegend variant="label">{category.name}</FieldLegend>
              <RadioGroup
                value={selectedValue}
                onValueChange={(value) => {
                  const withoutCategory = groupIds.filter(
                    (groupId) => !categoryGroupIds.includes(groupId),
                  );

                  onChange(value === "none" ? withoutCategory : [...withoutCategory, value]);
                }}
                aria-invalid={invalid}
              >
                {!category.selectionRequired ? (
                  <FieldLabel htmlFor={`${category.id}-none`}>
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>No group</FieldTitle>
                        <FieldDescription>Leave this category unassigned.</FieldDescription>
                      </FieldContent>
                      <RadioGroupItem value="none" id={`${category.id}-none`} />
                    </Field>
                  </FieldLabel>
                ) : null}

                {category.groups.map((group) => (
                  <FieldLabel key={group.id} htmlFor={`${category.id}-${group.id}`}>
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>{group.name}</FieldTitle>
                        {group.description ? (
                          <FieldDescription>{group.description}</FieldDescription>
                        ) : null}
                      </FieldContent>
                      <RadioGroupItem value={group.id} id={`${category.id}-${group.id}`} />
                    </Field>
                  </FieldLabel>
                ))}
              </RadioGroup>
            </FieldSet>
          );
        }

        return (
          <FieldSet key={category.id}>
            <FieldLegend variant="label">{category.name}</FieldLegend>

            <div className="flex flex-col gap-2">
              {category.groups.map((group) => {
                const checked = groupIds.includes(group.id);

                return (
                  <FieldLabel key={group.id} htmlFor={`${category.id}-${group.id}`}>
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>{group.name}</FieldTitle>
                        {group.description ? (
                          <FieldDescription>{group.description}</FieldDescription>
                        ) : null}
                      </FieldContent>
                      <Checkbox
                        id={`${category.id}-${group.id}`}
                        checked={checked}
                        onCheckedChange={(nextChecked) => {
                          if (nextChecked) {
                            onChange([...new Set([...groupIds, group.id])]);
                            return;
                          }

                          onChange(groupIds.filter((groupId) => groupId !== group.id));
                        }}
                        aria-invalid={invalid}
                      />
                    </Field>
                  </FieldLabel>
                );
              })}
            </div>
          </FieldSet>
        );
      })}

      <FieldError errors={error ? [{ message: error }] : []} />
    </FieldSet>
  );
}
