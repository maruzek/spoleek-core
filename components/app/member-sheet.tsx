"use client";

import { useForm } from "@tanstack/react-form";

import {
  createMemberSchema,
  type CreateMemberValues,
} from "@/lib/member-admin";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export type ShadowMemberFormValues = CreateMemberValues;

export function MemberSheet({
  open,
  isPending,
  serverError,
  validationErrors,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  isPending: boolean;
  serverError?: string;
  validationErrors?: Partial<
    Record<keyof ShadowMemberFormValues, { _errors?: string[] }>
  >;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: ShadowMemberFormValues) => Promise<void>;
}) {
  const defaultValues: ShadowMemberFormValues = {
    firstName: "",
    lastName: "",
    email: "",
    role: "member",
    status: "active",
  };

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      const parsed = createMemberSchema.safeParse(value);

      if (!parsed.success) {
        return;
      }

      await onSubmit(parsed.data);
      form.reset();
    },
  });

  const getFieldError = (fieldName: keyof ShadowMemberFormValues): string[] =>
    validationErrors?.[fieldName]?._errors ?? [];
  const getClientFieldErrors = (errors: unknown) =>
    Array.isArray(errors)
      ? errors.filter(
          (message): message is string => typeof message === "string",
        )
      : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Create member or shadow profile</SheetTitle>
          <SheetDescription>
            Add a member record directly and optionally link it to an existing
            account when the email already belongs to a signed-in user.
          </SheetDescription>
        </SheetHeader>

        <form
          className="flex flex-1 flex-col overflow-hidden"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <FieldGroup>
              <div className="grid gap-5 md:grid-cols-2">
                <form.Field name="firstName">
                  {(formField) => (
                    <Field
                      data-invalid={
                        (formField.state.meta.isTouched ||
                          form.state.submissionAttempts > 0) &&
                        (formField.state.meta.errors.length > 0 ||
                          getFieldError("firstName").length > 0)
                      }
                    >
                      <FieldLabel htmlFor="field-first-name">
                        First name *
                      </FieldLabel>
                      <FieldContent>
                        <Input
                          id="field-first-name"
                          placeholder="Anna"
                          value={formField.state.value}
                          onBlur={formField.handleBlur}
                          onChange={(event) =>
                            formField.handleChange(event.target.value)
                          }
                          aria-invalid={
                            (formField.state.meta.isTouched ||
                              form.state.submissionAttempts > 0) &&
                            (formField.state.meta.errors.length > 0 ||
                              getFieldError("firstName").length > 0)
                          }
                        />
                        <FieldError
                          errors={[
                            ...getClientFieldErrors(
                              formField.state.meta.errors,
                            ).map((message) => ({ message })),
                            ...getFieldError("firstName").map((message) => ({
                              message,
                            })),
                          ]}
                        />
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>

                <form.Field name="lastName">
                  {(formField) => (
                    <Field
                      data-invalid={
                        (formField.state.meta.isTouched ||
                          form.state.submissionAttempts > 0) &&
                        (formField.state.meta.errors.length > 0 ||
                          getFieldError("lastName").length > 0)
                      }
                    >
                      <FieldLabel htmlFor="field-last-name">
                        Last name *
                      </FieldLabel>
                      <FieldContent>
                        <Input
                          id="field-last-name"
                          placeholder="Novak"
                          value={formField.state.value}
                          onBlur={formField.handleBlur}
                          onChange={(event) =>
                            formField.handleChange(event.target.value)
                          }
                          aria-invalid={
                            (formField.state.meta.isTouched ||
                              form.state.submissionAttempts > 0) &&
                            (formField.state.meta.errors.length > 0 ||
                              getFieldError("lastName").length > 0)
                          }
                        />
                        <FieldError
                          errors={[
                            ...getClientFieldErrors(
                              formField.state.meta.errors,
                            ).map((message) => ({ message })),
                            ...getFieldError("lastName").map((message) => ({
                              message,
                            })),
                          ]}
                        />
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>

                <form.Field name="email">
                  {(formField) => (
                    <Field
                      data-invalid={
                        (formField.state.meta.isTouched ||
                          form.state.submissionAttempts > 0) &&
                        (formField.state.meta.errors.length > 0 ||
                          getFieldError("email").length > 0)
                      }
                    >
                      <FieldLabel htmlFor="field-email">Email</FieldLabel>
                      <FieldContent>
                        <Input
                          id="field-email"
                          type="email"
                          placeholder="anna@example.com"
                          value={formField.state.value}
                          onBlur={formField.handleBlur}
                          onChange={(event) =>
                            formField.handleChange(event.target.value)
                          }
                          aria-invalid={
                            (formField.state.meta.isTouched ||
                              form.state.submissionAttempts > 0) &&
                            (formField.state.meta.errors.length > 0 ||
                              getFieldError("email").length > 0)
                          }
                        />
                        <FieldError
                          errors={[
                            ...getClientFieldErrors(
                              formField.state.meta.errors,
                            ).map((message) => ({ message })),
                            ...getFieldError("email").map((message) => ({
                              message,
                            })),
                          ]}
                        />
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>

                <form.Field name="role">
                  {(formField) => (
                    <Field>
                      <FieldLabel>Role</FieldLabel>
                      <FieldContent>
                        <Select
                          value={formField.state.value}
                          onValueChange={(value) =>
                            formField.handleChange(
                              value as ShadowMemberFormValues["role"],
                            )
                          }
                        >
                          <SelectTrigger className="h-11 w-full px-4">
                            <SelectValue placeholder="Choose role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="member">Member</SelectItem>
                              <SelectItem value="leader">Leader</SelectItem>
                              <SelectItem value="org_admin">
                                Org admin
                              </SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>

                <form.Field name="status">
                  {(formField) => (
                    <Field>
                      <FieldLabel>Status</FieldLabel>
                      <FieldContent>
                        <Select
                          value={formField.state.value}
                          onValueChange={(value) =>
                            formField.handleChange(
                              value as ShadowMemberFormValues["status"],
                            )
                          }
                        >
                          <SelectTrigger className="h-11 w-full px-4">
                            <SelectValue placeholder="Choose status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="invited">Invited</SelectItem>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="archived">Archived</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>
              </div>

              {serverError ? (
                <div className="mt-4 rounded-2xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {serverError}
                </div>
              ) : null}
            </FieldGroup>
          </div>

          <SheetFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating..." : "Create profile"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
