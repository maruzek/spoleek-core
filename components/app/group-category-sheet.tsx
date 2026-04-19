"use client";

import type { GroupCategoryFormValues } from "@/lib/groups";
import type { MembershipManagementMode } from "@/server/db/schema";
import { GroupCategoryForm, type GroupCategoryValidationErrors } from "@/components/app/group-category-form";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export function GroupCategorySheet({
  open,
  category,
  isPending,
  validationErrors,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  category?: Partial<GroupCategoryFormValues> | null;
  isPending: boolean;
  validationErrors?: GroupCategoryValidationErrors;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: GroupCategoryFormValues) => Promise<void>;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{category?.id ? "Edit category" : "Create category"}</SheetTitle>
          <SheetDescription>
            Define the top-level wrapper that controls group rules, registration
            hooks, and future delegated-management structure.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <GroupCategoryForm
            key={category?.id ?? "new"}
            category={category}
            isPending={isPending}
            validationErrors={validationErrors}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
