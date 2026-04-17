"use client";

import { useId, useMemo, useState } from "react";
import { BanIcon, SearchIcon, UsersIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { getMemberDisplayName } from "@/lib/member-custom-fields";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";

type MemberOption = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  status: string;
};

function getInitials(member: MemberOption) {
  return [member.firstName, member.lastName]
    .map((part) => part.trim().charAt(0).toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join("");
}

export function MemberAssignmentSheet({
  open,
  title,
  description,
  members,
  isPending,
  onOpenChange,
  onSubmit,
  selectionMode = "single",
  submitLabel,
}: {
  open: boolean;
  title: string;
  description: string;
  members: MemberOption[];
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (memberIds: string[]) => Promise<void>;
  selectionMode?: "single" | "multiple";
  submitLabel?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <MemberAssignmentDialogBody
          title={title}
          description={description}
          members={members}
          isPending={isPending}
          onOpenChange={onOpenChange}
          onSubmit={onSubmit}
          selectionMode={selectionMode}
          submitLabel={submitLabel}
        />
      ) : null}
    </Dialog>
  );
}

function MemberAssignmentDialogBody({
  title,
  description,
  members,
  isPending,
  onOpenChange,
  onSubmit,
  selectionMode,
  submitLabel,
}: {
  title: string;
  description: string;
  members: MemberOption[];
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (memberIds: string[]) => Promise<void>;
  selectionMode: "single" | "multiple";
  submitLabel?: string;
}) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const activeMembers = useMemo(
    () => members.filter((member) => member.status === "active"),
    [members],
  );

  const filteredMembers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const selectedIds = new Set(selectedMemberIds);

    const matchingMembers = normalizedQuery
      ? activeMembers.filter((member) => {
          const haystack = [
            member.firstName,
            member.lastName,
            getMemberDisplayName(member),
            member.email ?? "",
          ]
            .join(" ")
            .toLowerCase();

          return haystack.includes(normalizedQuery);
        })
      : activeMembers;

    return [...matchingMembers].sort((left, right) => {
      const leftSelected = selectedIds.has(left.id) ? 0 : 1;
      const rightSelected = selectedIds.has(right.id) ? 0 : 1;

      if (leftSelected !== rightSelected) {
        return leftSelected - rightSelected;
      }

      return getMemberDisplayName(left).localeCompare(
        getMemberDisplayName(right),
      );
    });
  }, [activeMembers, query, selectedMemberIds]);

  const selectedMembers = useMemo(() => {
    const selectedIds = new Set(selectedMemberIds);
    return activeMembers.filter((member) => selectedIds.has(member.id));
  }, [activeMembers, selectedMemberIds]);

  const submitButtonLabel =
    submitLabel ??
    (selectionMode === "multiple"
      ? `Add ${selectedMemberIds.length} member${selectedMemberIds.length === 1 ? "" : "s"}`
      : "Confirm");

  const hasSelection = selectedMemberIds.length > 0;
  const invalid = hasSubmitted && !hasSelection;

  return (
    <DialogContent
      className="max-w-3xl gap-0 overflow-hidden overscroll-contain p-0 sm:max-w-3xl"
      showCloseButton
    >
      <DialogHeader className="border-b bg-muted/30 px-6 pt-6 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="max-w-2xl">
              {description}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <form
        className="flex flex-col"
        onSubmit={async (event) => {
          event.preventDefault();
          event.stopPropagation();
          setHasSubmitted(true);

          if (!hasSelection) {
            return;
          }

          await onSubmit(selectedMemberIds);
        }}
      >
        <div className="flex flex-col gap-4 px-6 pt-5 pb-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={searchId}>Search members</FieldLabel>
              <FieldContent>
                <InputGroup className="h-11 rounded-xl border-input/60 bg-background shadow-xs">
                  <InputGroupAddon align="inline-start">
                    <SearchIcon aria-hidden="true" />
                  </InputGroupAddon>
                  <InputGroupInput
                    id={searchId}
                    name="member-search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Type a name or email…"
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>
                      {filteredMembers.length} result
                      {filteredMembers.length === 1 ? "" : "s"}
                    </InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
                <FieldDescription>
                  Start typing any part of a member&apos;s name or personal
                  email to narrow the list.
                </FieldDescription>
              </FieldContent>
            </Field>
          </FieldGroup>

          <div className="flex flex-wrap items-center gap-2">
            {selectionMode === "multiple" && filteredMembers.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const mergedIds = new Set(selectedMemberIds);

                  for (const member of filteredMembers) {
                    mergedIds.add(member.id);
                  }

                  setSelectedMemberIds(Array.from(mergedIds));
                }}
              >
                <UsersIcon data-icon="inline-start" aria-hidden="true" />
                Select all results
              </Button>
            ) : null}
            {selectedMemberIds.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setSelectedMemberIds([])}
              >
                <BanIcon data-icon="inline-start" aria-hidden="true" />
                Clear selection
              </Button>
            ) : null}
          </div>
        </div>

        <div className="px-6 pb-6">
          <Field data-invalid={invalid}>
            <FieldContent className="gap-3">
              <ScrollArea className="h-[24rem] rounded-2xl border bg-background shadow-xs">
                <div className="flex flex-col gap-2 p-2">
                  {filteredMembers.length > 0 ? (
                    filteredMembers.map((member) => {
                      const checked = selectedMemberIds.includes(member.id);

                      return (
                        <label
                          key={member.id}
                          htmlFor={`member-assignment-${member.id}`}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition-colors",
                            checked
                              ? "border-primary/45 bg-primary/6 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-primary)_18%,transparent)]"
                              : "border-transparent hover:border-border hover:bg-muted/60",
                          )}
                        >
                          <Checkbox
                            id={`member-assignment-${member.id}`}
                            checked={checked}
                            onCheckedChange={() => {
                              setHasSubmitted(false);

                              if (selectionMode === "single") {
                                setSelectedMemberIds(
                                  checked ? [] : [member.id],
                                );
                                return;
                              }

                              setSelectedMemberIds((current) =>
                                checked
                                  ? current.filter((id) => id !== member.id)
                                  : [...current, member.id],
                              );
                            }}
                            aria-label={`Select ${getMemberDisplayName(member)}`}
                          />
                          <Avatar size="lg">
                            <AvatarFallback>
                              {getInitials(member)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <span className="font-medium text-foreground">
                              {getMemberDisplayName(member)}
                            </span>
                            <span className="truncate text-sm text-muted-foreground">
                              {member.email ?? "No personal email"}
                            </span>
                          </div>
                        </label>
                      );
                    })
                  ) : (
                    <div className="flex h-[20rem] flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/30 px-6 text-center">
                      <div className="flex size-12 items-center justify-center rounded-full border bg-background">
                        <SearchIcon
                          className="text-muted-foreground"
                          aria-hidden="true"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <p className="font-medium text-foreground">
                          No active members match this search
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Try a different name fragment or email address.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
              {invalid ? (
                <FieldError
                  errors={[
                    {
                      message: "Select at least one member before continuing.",
                    },
                  ]}
                />
              ) : null}
            </FieldContent>
          </Field>
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-3 px-8 py-4 pb-8">
          <div className="min-w-0 flex-1 text-sm font-medium text-muted-foreground">
            {hasSelection
              ? `${selectedMemberIds.length} member${selectedMemberIds.length === 1 ? "" : "s"} ready to add`
              : "Choose active members to continue"}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isPending || activeMembers.length === 0 || !hasSelection
              }
            >
              {isPending ? "Saving…" : submitButtonLabel}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
