"use client";

import { useForm } from "@tanstack/react-form";
import { z } from "zod";

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
import { Textarea } from "@/components/ui/textarea";

export const shadowMemberFormSchema = z.object({
  fullName: z.string().min(1, "Name is required"),
  email: z.string().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  role: z.enum(["member", "leader", "org_admin"]).default("member"),
});

export type ShadowMemberFormValues = z.infer<typeof shadowMemberFormSchema>;

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
  validationErrors?: any;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: ShadowMemberFormValues) => Promise<void>;
}) {
  const form = useForm({
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      notes: "",
      role: "member" as "member" | "leader" | "org_admin",
    },
    onSubmit: async ({ value }) => {
      const parsed = shadowMemberFormSchema.safeParse(value);

      if (!parsed.success) {
        return;
      }

      await onSubmit(parsed.data);
      form.reset();
    },
  });

  // Extract zod-like field errors from next-safe-action validationErrors shape if it is returned
  const getFieldError = (fieldName: keyof ShadowMemberFormValues): string[] => {
    if (!validationErrors || typeof validationErrors !== "object") return [];
    const field = validationErrors[fieldName];
    if (field && typeof field === "object" && "_errors" in field) {
      return (field as any)._errors || [];
    }
    return [];
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Create member or shadow profile</SheetTitle>
          <SheetDescription>
            Add a new member directly or create a shadow profile to later link
            with a registered user.
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
                <form.Field name="fullName">
                  {(formField) => (
                    <Field
                      data-invalid={
                        (formField.state.meta.isTouched ||
                          form.state.submissionAttempts > 0) &&
                        (formField.state.meta.errors.length > 0 ||
                          getFieldError("fullName").length > 0)
                      }
                    >
                      <FieldLabel htmlFor="field-fullname">Member name *</FieldLabel>
                      <FieldContent>
                        <Input
                          id="field-fullname"
                          placeholder="Anna Novak"
                          value={formField.state.value}
                          onBlur={formField.handleBlur}
                          onChange={(event) => formField.handleChange(event.target.value)}
                          aria-invalid={
                            (formField.state.meta.isTouched ||
                              form.state.submissionAttempts > 0) &&
                            (formField.state.meta.errors.length > 0 ||
                              getFieldError("fullName").length > 0)
                          }
                        />
                        <FieldError
                          errors={[
                            ...((formField.state.meta.errors as unknown as string[]) ?? []).map((message) => ({ message })),
                            ...getFieldError("fullName").map((message) => ({ message })),
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
                          onChange={(event) => formField.handleChange(event.target.value)}
                          aria-invalid={
                            (formField.state.meta.isTouched ||
                              form.state.submissionAttempts > 0) &&
                            (formField.state.meta.errors.length > 0 ||
                              getFieldError("email").length > 0)
                          }
                        />
                        <FieldError
                          errors={[
                            ...((formField.state.meta.errors as unknown as string[]) ?? []).map((message) => ({ message })),
                            ...getFieldError("email").map((message) => ({ message })),
                          ]}
                        />
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>

                <form.Field name="phone">
                  {(formField) => (
                    <Field>
                      <FieldLabel htmlFor="field-phone">Phone</FieldLabel>
                      <FieldContent>
                        <Input
                          id="field-phone"
                          placeholder="+420..."
                          value={formField.state.value}
                          onBlur={formField.handleBlur}
                          onChange={(event) => formField.handleChange(event.target.value)}
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
                            formField.handleChange(value as "member" | "leader" | "org_admin")
                          }
                        >
                          <SelectTrigger className="h-11 w-full rounded-2xl px-4">
                            <SelectValue placeholder="Choose role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="member">Member</SelectItem>
                              <SelectItem value="leader">Leader</SelectItem>
                              <SelectItem value="org_admin">Org admin</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>
              </div>

              <form.Field name="notes">
                {(formField) => (
                  <Field>
                    <FieldLabel htmlFor="field-notes">Notes</FieldLabel>
                    <FieldContent>
                      <Textarea
                        id="field-notes"
                        placeholder="Optional admin note"
                        value={formField.state.value}
                        onBlur={formField.handleBlur}
                        onChange={(event) => formField.handleChange(event.target.value)}
                      />
                    </FieldContent>
                  </Field>
                )}
              </form.Field>

              {serverError ? (
                <div className="rounded-2xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive mt-4">
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
