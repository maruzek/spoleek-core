"use client";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type RegistrationGroupOption = {
  id: string;
  name: string;
  description: string | null;
};

export type RegistrationGroupCategoryInput = {
  id: string;
  name: string;
  description: string | null;
  selectionRequired: boolean;
  groups: RegistrationGroupOption[];
};

export function RegistrationGroupInput({
  category,
  value,
  error,
  onChange,
}: {
  category: RegistrationGroupCategoryInput;
  value: string | null | undefined;
  error?: string;
  onChange: (value: string | null) => void;
}) {
  const hasGroups = category.groups.length > 0;

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={`registration-group-${category.id}`}>
        {category.name}
      </FieldLabel>
      <FieldContent>
        <Select
          name={`registration-group-${category.id}`}
          value={typeof value === "string" ? value : ""}
          onValueChange={(nextValue) =>
            onChange(nextValue.length > 0 ? nextValue : null)
          }
          disabled={!hasGroups}
        >
          <SelectTrigger
            id={`registration-group-${category.id}`}
            className="h-11 w-full px-4"
            aria-invalid={Boolean(error)}
          >
            <SelectValue
              placeholder={
                hasGroups ? "Select a group…" : "No groups available"
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {category.groups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {/* <FieldDescription>
          {category.description ??
            (category.selectionRequired
              ? "Choose the group that should receive your application."
              : "Optionally choose the group that best matches where you belong.")}
        </FieldDescription> */}
        {error ? <FieldError>{error}</FieldError> : null}
      </FieldContent>
    </Field>
  );
}
