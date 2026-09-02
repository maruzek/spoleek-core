"use client";

import {
  dateDirectionOptions,
  getDateMode,
  textFormatOptions,
  typeSupportsConstraints,
  type MemberCustomFieldConstraints,
} from "@/lib/member-custom-field-constraints";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { FieldHint } from "@/components/ui/field-hint";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SwitchChoiceField } from "@/components/app/switch-choice-field";
import type { MemberCustomFieldType } from "@/server/db/schema";

/**
 * Admin editor for `member_custom_fields.constraints`. Only the keys that the
 * selected type understands are rendered; the save action strips the rest.
 */
const DATE_GROUP_HINT =
  "Age limits, a fixed range and a direction lock overlap, so only one applies. Filling any of them in locks the other two until it is cleared.";

export function MemberCustomFieldConstraintFields({
  type,
  value,
  errors,
  onChange,
}: {
  type: MemberCustomFieldType;
  value: MemberCustomFieldConstraints;
  errors: string[];
  onChange: (constraints: MemberCustomFieldConstraints) => void;
}) {
  if (!typeSupportsConstraints(type)) {
    return null;
  }

  const patch = (next: Partial<MemberCustomFieldConstraints>) => {
    onChange({ ...value, ...next });
  };

  // Whichever group is filled in first wins; the other two lock until it clears.
  const activeDateMode = getDateMode(value);
  const isGroupLocked = (group: "age" | "range" | "direction") =>
    activeDateMode !== "none" && activeDateMode !== group;

  return (
    <FieldSet>
      <FieldLegend>
        Validation
        <FieldHint>
          Answers that break these rules are rejected on the join form and in
          the admin editor. Leave a limit empty to skip it.
        </FieldHint>
      </FieldLegend>

      {type === "date" ? (
        <>
          <div className="grid gap-5 md:grid-cols-2">
            <NumberLimitField
              id="constraint-min-age"
              label="Minimum age"
              description={`Inclusive: someone turning this age on the day they submit still qualifies. ${DATE_GROUP_HINT}`}
              value={value.minAge}
              min={0}
              max={150}
              disabled={isGroupLocked("age")}
              onChange={(minAge) => patch({ minAge })}
            />
            <NumberLimitField
              id="constraint-max-age"
              label="Maximum age"
              description={`Inclusive: this age is still allowed, up to and including the day before the next birthday. ${DATE_GROUP_HINT}`}
              value={value.maxAge}
              min={0}
              max={150}
              disabled={isGroupLocked("age")}
              onChange={(maxAge) => patch({ maxAge })}
            />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <Field data-disabled={isGroupLocked("range") || undefined}>
              <FieldLabel htmlFor="constraint-not-before">
                Earliest allowed date
                <FieldHint>
                  Inclusive: this day itself is allowed. {DATE_GROUP_HINT}
                </FieldHint>
              </FieldLabel>
              <FieldContent>
                <Input
                  id="constraint-not-before"
                  type="date"
                  value={value.notBefore ?? ""}
                  disabled={isGroupLocked("range")}
                  onChange={(event) =>
                    patch({ notBefore: event.target.value || undefined })
                  }
                />
              </FieldContent>
            </Field>
            <Field data-disabled={isGroupLocked("range") || undefined}>
              <FieldLabel htmlFor="constraint-not-after">
                Latest allowed date
                <FieldHint>
                  Inclusive: this day itself is allowed. {DATE_GROUP_HINT}
                </FieldHint>
              </FieldLabel>
              <FieldContent>
                <Input
                  id="constraint-not-after"
                  type="date"
                  value={value.notAfter ?? ""}
                  disabled={isGroupLocked("range")}
                  onChange={(event) =>
                    patch({ notAfter: event.target.value || undefined })
                  }
                />
              </FieldContent>
            </Field>
          </div>

          <Field data-disabled={isGroupLocked("direction") || undefined}>
            <FieldLabel>
              Allowed direction
              <FieldHint>
                Relative to the moment the answer is submitted; today counts as
                allowed either way. {DATE_GROUP_HINT}
              </FieldHint>
            </FieldLabel>
            <FieldContent>
              <Select
                value={value.direction ?? "any"}
                disabled={isGroupLocked("direction")}
                onValueChange={(direction) =>
                  patch({
                    direction:
                      direction === "any"
                        ? undefined
                        : (direction as MemberCustomFieldConstraints["direction"]),
                  })
                }
              >
                <SelectTrigger className="h-11 w-full px-4">
                  <SelectValue placeholder="Any date" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {dateDirectionOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
        </>
      ) : null}

      {type === "number" ? (
        <>
          <div className="grid gap-5 md:grid-cols-2">
            <NumberLimitField
              id="constraint-min"
              label="Minimum value"
              value={value.min}
              onChange={(min) => patch({ min })}
            />
            <NumberLimitField
              id="constraint-max"
              label="Maximum value"
              value={value.max}
              onChange={(max) => patch({ max })}
            />
          </div>

          <SwitchChoiceField
            id="constraint-integer-only"
            title="Whole numbers only"
            description="Reject answers with a decimal part."
            checked={value.integerOnly ?? false}
            onCheckedChange={(integerOnly) => patch({ integerOnly })}
          />
        </>
      ) : null}

      {type === "text" || type === "textarea" ? (
        <>
          <div className="grid gap-5 md:grid-cols-2">
            <NumberLimitField
              id="constraint-min-length"
              label="Minimum length"
              value={value.minLength}
              min={0}
              onChange={(minLength) => patch({ minLength })}
            />
            <NumberLimitField
              id="constraint-max-length"
              label="Maximum length"
              value={value.maxLength}
              min={1}
              onChange={(maxLength) => patch({ maxLength })}
            />
          </div>

          <Field>
            <FieldLabel>Expected format</FieldLabel>
            <FieldContent>
              <Select
                value={value.format ?? "any"}
                onValueChange={(format) =>
                  patch({
                    format: format as MemberCustomFieldConstraints["format"],
                  })
                }
              >
                <SelectTrigger className="h-11 w-full px-4">
                  <SelectValue placeholder="Any characters" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {textFormatOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>

          {value.format === "custom" ? (
            <>
              <Field>
                <FieldLabel htmlFor="constraint-pattern">
                  Pattern
                  <FieldHint>
                    A JavaScript regular expression. Anchors are added
                    automatically, so the whole answer must match.
                  </FieldHint>
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="constraint-pattern"
                    value={value.pattern ?? ""}
                    placeholder="[A-Z]{2}\d{6}"
                    spellCheck={false}
                    onChange={(event) =>
                      patch({ pattern: event.target.value || undefined })
                    }
                  />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="constraint-pattern-message">
                  Format hint
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="constraint-pattern-message"
                    value={value.patternMessage ?? ""}
                    placeholder="must be two letters followed by six digits."
                    onChange={(event) =>
                      patch({ patternMessage: event.target.value || undefined })
                    }
                  />
                </FieldContent>
              </Field>
            </>
          ) : null}
        </>
      ) : null}

      {type === "multi_select" ? (
        <div className="grid gap-5 md:grid-cols-2">
          <NumberLimitField
            id="constraint-min-selected"
            label="Minimum selected"
            value={value.minSelected}
            min={0}
            onChange={(minSelected) => patch({ minSelected })}
          />
          <NumberLimitField
            id="constraint-max-selected"
            label="Maximum selected"
            value={value.maxSelected}
            min={1}
            onChange={(maxSelected) => patch({ maxSelected })}
          />
        </div>
      ) : null}

      {errors.length > 0 ? (
        <FieldError errors={errors.map((message) => ({ message }))} />
      ) : null}
    </FieldSet>
  );
}

/** A number input where "empty" means "no limit", not zero. */
function NumberLimitField({
  id,
  label,
  description,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  value: number | undefined;
  min?: number;
  max?: number;
  disabled?: boolean;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <Field data-disabled={disabled || undefined}>
      <FieldLabel htmlFor={id}>
        {label}
        {description ? <FieldHint>{description}</FieldHint> : null}
      </FieldLabel>
      <FieldContent>
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          disabled={disabled}
          placeholder="No limit"
          value={value ?? ""}
          onChange={(event) => {
            const next = event.target.value;
            onChange(next === "" ? undefined : Number(next));
          }}
        />
      </FieldContent>
    </Field>
  );
}
