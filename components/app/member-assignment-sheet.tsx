"use client";

import { useForm } from "@tanstack/react-form";

import { getMemberDisplayName } from "@/lib/member-custom-fields";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type MemberOption = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  status: string;
};

export function MemberAssignmentSheet({
  open,
  title,
  description,
  members,
  isPending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description: string;
  members: MemberOption[];
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (memberId: string) => Promise<void>;
}) {
  const form = useForm({
    defaultValues: {
      memberId: "",
    },
    onSubmit: async ({ value }) => {
      if (!value.memberId) {
        return;
      }

      await onSubmit(value.memberId);
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
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
              <form.Field name="memberId">
                {(formField) => (
                  <Field data-invalid={form.state.submissionAttempts > 0 && !formField.state.value}>
                    <FieldLabel>Select member</FieldLabel>
                    <FieldContent>
                      <Select value={formField.state.value} onValueChange={formField.handleChange}>
                        <SelectTrigger className="h-11 w-full rounded-2xl px-4">
                          <SelectValue placeholder="Choose a member" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {members.map((member) => (
                              <SelectItem key={member.id} value={member.id}>
                                {[getMemberDisplayName(member), member.email ?? "No email", member.status]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FieldDescription>
                        Only members from this organization are listed here.
                      </FieldDescription>
                      {form.state.submissionAttempts > 0 && !formField.state.value ? (
                        <FieldError errors={[{ message: "Choose a member before continuing." }]} />
                      ) : null}
                    </FieldContent>
                  </Field>
                )}
              </form.Field>
            </FieldGroup>
          </div>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || members.length === 0}>
              {isPending ? "Saving..." : "Confirm"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
