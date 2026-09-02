"use client";

import {
  getDateConstraintBounds,
  pickConstraintsForType,
} from "@/lib/member-custom-field-constraints";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
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
  const constraints = pickConstraintsForType(field.type, field.constraints ?? {});

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
    const textValue = typeof value === "string" ? value : "";

    return (
      <Field data-invalid={Boolean(error)}>
        <FieldLabel htmlFor={`custom-field-${field.key}`}>
          {labelContent}
        </FieldLabel>
        <FieldContent>
          <Textarea
            id={`custom-field-${field.key}`}
            value={textValue}
            maxLength={constraints.maxLength}
            onChange={(event) => onChange(event.target.value)}
            aria-invalid={Boolean(error)}
          />
          {sharedDescription}
          {constraints.maxLength ? (
            <FieldDescription>
              {textValue.length} / {constraints.maxLength} characters
            </FieldDescription>
          ) : null}
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
    const selectionHint = describeSelectionLimits(
      constraints.minSelected,
      constraints.maxSelected,
    );

    return (
      <Field data-invalid={Boolean(error)}>
        <FieldContent>
          <FieldSet>
            <FieldLegend>{labelContent}</FieldLegend>
            {sharedDescription}
            {selectionHint ? (
              <FieldDescription>{selectionHint}</FieldDescription>
            ) : null}
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

  if (field.type === "date") {
    const bounds = getDateConstraintBounds(constraints);

    return (
      <Field data-invalid={Boolean(error)}>
        <FieldLabel htmlFor={`custom-field-${field.key}`}>
          {labelContent}
        </FieldLabel>
        <FieldContent>
          <DatePicker
            id={`custom-field-${field.key}`}
            value={typeof value === "string" ? value : ""}
            onChange={onChange}
            required={field.required}
            aria-invalid={Boolean(error)}
            startMonth={bounds.min}
            endMonth={bounds.max}
            disabledDates={[
              ...(bounds.min ? [{ before: bounds.min }] : []),
              ...(bounds.max ? [{ after: bounds.max }] : []),
            ]}
          />
          {sharedDescription}
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
          min={field.type === "number" ? constraints.min : undefined}
          max={field.type === "number" ? constraints.max : undefined}
          step={
            field.type === "number" && constraints.integerOnly ? 1 : undefined
          }
          minLength={constraints.minLength}
          maxLength={constraints.maxLength}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
        />
        {sharedDescription}
        {error ? <FieldError>{error}</FieldError> : null}
      </FieldContent>
    </Field>
  );
}

/** "Select 2 to 3 options." — omitted entirely when neither limit is set. */
function describeSelectionLimits(min?: number, max?: number) {
  if (min !== undefined && max !== undefined) {
    return min === max
      ? `Select exactly ${min}.`
      : `Select between ${min} and ${max}.`;
  }

  if (min !== undefined) {
    return `Select at least ${min}.`;
  }

  if (max !== undefined) {
    return `Select up to ${max}.`;
  }

  return null;
}
