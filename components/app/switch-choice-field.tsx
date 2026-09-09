"use client";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { FieldHint } from "@/components/ui/field-hint";
import { Switch } from "@/components/ui/switch";

export function SwitchChoiceField({
  id,
  title,
  description,
  hint,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  title: string;
  /** Shown under the title. Prefer `hint` unless the text drives the answer. */
  description?: string;
  /** Folded into an info icon beside the title. */
  hint?: React.ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <FieldLabel htmlFor={id}>
      <Field orientation="horizontal" data-disabled={disabled}>
        <FieldContent>
          <FieldTitle>
            {title}
            {hint ? (
              // The hint trigger sits inside the label, so a click on it would
              // otherwise flip the switch it is explaining.
              <span onClick={(event) => event.preventDefault()}>
                <FieldHint>{hint}</FieldHint>
              </span>
            ) : null}
          </FieldTitle>
          {description ? <FieldDescription>{description}</FieldDescription> : null}
        </FieldContent>
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
        />
      </Field>
    </FieldLabel>
  );
}
