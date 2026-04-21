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
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { MemberCustomField } from "@/server/db/schema";

export function MemberCustomFieldInput({
  field,
  value,
  error,
  onChange,
}: {
  field: MemberCustomField;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
}) {
  const sharedDescription = field.description ? (
    <FieldDescription>{field.description}</FieldDescription>
  ) : null;

  const requiredMarker = field.required ? (
    <span className="text-destructive">*</span>
  ) : null;

  const labelContent = (
    <>
      {field.label}
      {requiredMarker}
    </>
  );

  if (field.type === "textarea") {
    return (
      <Field data-invalid={Boolean(error)}>
        <FieldLabel htmlFor={`custom-field-${field.key}`}>
          {labelContent}
        </FieldLabel>
        <FieldContent>
          <Textarea
            id={`custom-field-${field.key}`}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
            aria-invalid={Boolean(error)}
          />
          {sharedDescription}
          {error ? <FieldError>{error}</FieldError> : null}
        </FieldContent>
      </Field>
    );
  }

  if (field.type === "boolean") {
    return (
      <Field orientation="horizontal" data-invalid={Boolean(error)}>
        <FieldLabel htmlFor={`custom-field-${field.key}`}>
          {labelContent}
        </FieldLabel>
        <FieldContent className="items-end">
          <Checkbox
            id={`custom-field-${field.key}`}
            checked={value === true}
            onCheckedChange={(checked) => onChange(Boolean(checked))}
            aria-invalid={Boolean(error)}
          />
          {sharedDescription}
          {error ? <FieldError>{error}</FieldError> : null}
        </FieldContent>
      </Field>
    );
  }

  if (field.type === "select") {
    return (
      <Field data-invalid={Boolean(error)}>
        <FieldLabel>{labelContent}</FieldLabel>
        <FieldContent>
          <Select
            value={typeof value === "string" ? value : ""}
            onValueChange={onChange}
          >
            <SelectTrigger
              className="h-11 w-full px-4"
              aria-invalid={Boolean(error)}
            >
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {field.options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {sharedDescription}
          {error ? <FieldError>{error}</FieldError> : null}
        </FieldContent>
      </Field>
    );
  }

  if (field.type === "multi_select") {
    const selectedValues = Array.isArray(value) ? value.map(String) : [];

    return (
      <Field data-invalid={Boolean(error)}>
        <FieldContent>
          <FieldSet>
            <FieldLegend>{labelContent}</FieldLegend>
            {sharedDescription}
            {field.options.map((option) => {
              const checked = selectedValues.includes(option);

              return (
                <Field key={option} orientation="horizontal">
                  <FieldLabel htmlFor={`custom-field-${field.key}-${option}`}>
                    {option}
                  </FieldLabel>
                  <Checkbox
                    id={`custom-field-${field.key}-${option}`}
                    checked={checked}
                    onCheckedChange={(nextChecked) => {
                      const nextValues = nextChecked
                        ? [...selectedValues, option]
                        : selectedValues.filter(
                            (selected) => selected !== option,
                          );

                      onChange(nextValues);
                    }}
                  />
                </Field>
              );
            })}
          </FieldSet>
          {error ? <FieldError>{error}</FieldError> : null}
        </FieldContent>
      </Field>
    );
  }

  const inputType =
    field.type === "number"
      ? "number"
      : field.type === "email"
        ? "email"
        : field.type === "phone"
          ? "tel"
          : field.type === "date"
            ? "date"
            : "text";

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={`custom-field-${field.key}`}>
        {labelContent}
      </FieldLabel>
      <FieldContent>
        <Input
          id={`custom-field-${field.key}`}
          type={inputType}
          value={
            typeof value === "string" || typeof value === "number"
              ? String(value)
              : ""
          }
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
        />
        {sharedDescription}
        {error ? <FieldError>{error}</FieldError> : null}
      </FieldContent>
    </Field>
  );
}
