"use client";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export type RadioChoiceOption<TValue extends string> = {
  value: TValue;
  title: string;
  description?: string;
  disabled?: boolean;
};

/**
 * The selectable card list used across group/category forms: a full-width
 * label with a title, a description, and the radio itself on the trailing edge.
 */
export function RadioChoiceGroup<TValue extends string>({
  idPrefix,
  value,
  onValueChange,
  options,
  className = "max-w-2xl",
  invalid,
}: {
  idPrefix: string;
  value: TValue | "";
  onValueChange: (value: TValue) => void;
  options: RadioChoiceOption<TValue>[];
  className?: string;
  invalid?: boolean;
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onValueChange(next as TValue)}
      className={className}
      aria-invalid={invalid}
    >
      {options.map((option) => {
        const id = `${idPrefix}-${option.value}`;

        return (
          <FieldLabel key={option.value} htmlFor={id}>
            <Field orientation="horizontal" data-disabled={option.disabled}>
              <FieldContent>
                <FieldTitle>{option.title}</FieldTitle>
                {option.description ? (
                  <FieldDescription>{option.description}</FieldDescription>
                ) : null}
              </FieldContent>
              <RadioGroupItem
                value={option.value}
                id={id}
                disabled={option.disabled}
              />
            </Field>
          </FieldLabel>
        );
      })}
    </RadioGroup>
  );
}
