"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { createColumnHelper } from "@tanstack/react-table";
import { PencilIcon, PlusIcon } from "lucide-react";

import { getMemberDisplayName } from "@/lib/member-custom-fields";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import { formatDateTime } from "@/lib/format";
import { MemberEditSheet } from "./member-edit-sheet";
import { MemberSheet } from "./member-sheet";
import {
  approveMemberAction,
  createShadowMemberAction,
  updateMemberAction,
} from "@/server/actions/member-admin";
import type { MemberCustomField, TenantMember } from "@/server/db/schema";

type MemberRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  role: "member" | "leader" | "org_admin";
  status: "invited" | "pending" | "active" | "archived";
  userId: string | null;
  createdAt: Date;
  linkedUserName: string | null;
};

const columnHelper = createColumnHelper<MemberRow>();

type MemberEditorData = {
  member: TenantMember;
  customFieldAnswers: Record<string, unknown>;
};

export function MemberAdmin({
  members,
  customFields,
  selectedMember,
}: {
  members: MemberRow[];
  customFields: MemberCustomField[];
  selectedMember: MemberEditorData | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sheetOpen, setSheetOpen] = useState(false);

  const updateSearchParam = (memberId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());

    if (memberId) {
      params.set("edit", memberId);
    } else {
      params.delete("edit");
    }

    const nextUrl = params.toString().length > 0 ? `${pathname}?${params}` : pathname;
    router.replace(nextUrl, { scroll: false });
  };

  const createAction = useAction(createShadowMemberAction, {
    onSuccess() {
      setSheetOpen(false);
      router.refresh();
    },
  });
  const approveAction = useAction(approveMemberAction, {
    onSuccess() {
      router.refresh();
    },
  });
  const updateAction = useAction(updateMemberAction, {
    onSuccess() {
      updateSearchParam(null);
      router.refresh();
    },
  });

  const columns = [
    columnHelper.display({
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      }),
    columnHelper.accessor(
      (member) =>
        [member.firstName, member.lastName, member.email ?? ""]
          .filter(Boolean)
          .join(" "),
      {
        header: "Member",
        id: "member",
        cell: ({ row }) => {
          const member = row.original;
          return (
            <div className="flex flex-col gap-1">
              <span className="font-medium text-foreground">
                {getMemberDisplayName(member)}
              </span>
              <span className="text-sm text-muted-foreground line-clamp-1">
                {member.email || "No email yet"}
              </span>
            </div>
          );
        },
      },
    ),
    columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => (
          <Badge
            variant={
              info.getValue() === "active"
                ? "default"
                : info.getValue() === "pending"
                ? "secondary"
                : "outline"
            }
            className="capitalize"
          >
            {info.getValue()}
          </Badge>
        ),
    }),
    columnHelper.accessor("role", {
        header: "Role",
        cell: (info) => (
          <span className="capitalize text-muted-foreground">
            {info.getValue().replace("_", " ")}
          </span>
        ),
    }),
    columnHelper.accessor("userId", {
        header: "Link",
        cell: ({ row }) => {
          const member = row.original;
          return (
            <span className="text-muted-foreground">
              {member.userId ? member.linkedUserName || "Linked" : "Shadow profile"}
            </span>
          );
        },
    }),
    columnHelper.accessor("createdAt", {
        header: "Created",
        cell: (info) => (
          <span className="text-muted-foreground">
            {formatDateTime(info.getValue())}
          </span>
        ),
    }),
    columnHelper.display({
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const member = row.original;
          return (
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => updateSearchParam(member.id)}
              >
                <PencilIcon data-icon="inline-start" />
                Edit
              </Button>
              {member.status === "pending" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  onClick={() =>
                    approveAction.execute({
                      memberId: member.id,
                      role: member.role,
                    })
                  }
                  disabled={approveAction.isPending}
                >
                  Approve
                </Button>
              ) : null}
            </div>
          );
        },
    }),
  ];

  return (
    <div className="flex flex-col gap-8">
      <DataTable
        data={members}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        columns={columns as any}
        searchKey="member"
        searchPlaceholder="Search members..."
        emptyStateTitle="No members found"
        emptyStateDescription="Create members or invite them via the portal."
        toolbarActions={() => (
          <Button onClick={() => setSheetOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            New Member
          </Button>
        )}
      />

      <MemberSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        isPending={createAction.isPending}
        serverError={createAction.result.serverError}
        validationErrors={createAction.result.validationErrors}
        onSubmit={async (value) => {
          await createAction.executeAsync(value);
        }}
      />

      {selectedMember ? (
        <MemberEditSheet
          key={selectedMember.member.id}
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              updateSearchParam(null);
            }
          }}
          member={selectedMember.member}
          customFields={customFields}
          customFieldAnswers={selectedMember.customFieldAnswers}
          isPending={updateAction.isPending}
          serverError={updateAction.result.serverError}
          validationErrors={updateAction.result.validationErrors}
          customFieldErrors={updateAction.result.data?.customFieldErrors}
          onSubmit={async (value) => {
            await updateAction.executeAsync(value);
          }}
        />
      ) : null}
    </div>
  );
}
