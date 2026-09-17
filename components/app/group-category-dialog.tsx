"use client";

import { LayersIcon, PencilIcon } from "lucide-react";

import { FormDialog } from "@/components/app/form-dialog";
import {
  GroupCategoryForm,
  type GroupCategoryValidationErrors,
} from "@/components/app/group-category-form";
import type { GroupCategoryFormValues } from "@/lib/groups";

const FORM_ID = "group-category-form";

export function GroupCategoryDialog({
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
  const editing = Boolean(category?.id);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={editing ? <PencilIcon /> : <LayersIcon />}
      title={editing ? `Edit ${category?.name ?? "category"}` : "New category"}
      description={
        editing
          ? undefined
          : "A layer of the organisation — regions, sections, committees — with its own groups and membership rules."
      }
      formId={FORM_ID}
      isPending={isPending}
      submitLabel={editing ? "Save category" : "Create category"}
    >
      <GroupCategoryForm
        key={category?.id ?? "new"}
        id={FORM_ID}
        hideFooter
        category={category}
        isPending={isPending}
        validationErrors={validationErrors}
        onSubmit={onSubmit}
      />
    </FormDialog>
  );
}
