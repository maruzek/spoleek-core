"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { ExternalLinkIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";

import { describeLinkHealth, workspaceLinkDirectionOptions } from "@/lib/workspace-group-links";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { syncGroupWorkspaceLinkAction } from "@/server/actions/workspace-group-links";
import type { GroupWorkspaceLinkRow } from "@/server/queries/workspace-group-links";

/**
 * The org-wide view of every group link. It lives under its own Groups tab
 * rather than inside Workspace: connection state and provisioning are set up
 * once, while link health is checked repeatedly and often by someone else.
 */
export function GroupLinksSettingsCard({
  links,
  workspaceConnected,
}: {
  links: GroupWorkspaceLinkRow[];
  workspaceConnected: boolean;
}) {
  const router = useRouter();

  const syncLink = useAction(syncGroupWorkspaceLinkAction, {
    onSuccess() {
      toast.success("Sync queued.");
      router.refresh();
    },
    onError({ error }) {
      if (error.serverError) toast.error(error.serverError);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Linked Google groups</CardTitle>
        <CardDescription>
          Every group that syncs its membership to Google Workspace, and whether
          it is keeping up. Links are created in each group&apos;s own settings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!workspaceConnected ? (
          <p className="text-sm text-muted-foreground">
            Connect Google Workspace to link groups.
          </p>
        ) : links.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No groups are linked yet. Open a group and use{" "}
            <span className="font-medium">Link a Google group</span> in its
            settings.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Group</TableHead>
                  <TableHead>Google group</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead>Last synced</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((link) => {
                  const health = describeLinkHealth(link);
                  const direction = workspaceLinkDirectionOptions.find(
                    (option) => option.value === link.direction,
                  );

                  return (
                    <TableRow key={link.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{link.groupName}</span>
                          <span className="text-muted-foreground text-sm">
                            {link.categoryName}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {link.workspaceGroupEmail}
                      </TableCell>
                      <TableCell className="text-sm">
                        {direction?.label}
                      </TableCell>
                      <TableCell>
                        <Status variant={health.variant}>
                          <StatusIndicator />
                          <StatusLabel>{health.label}</StatusLabel>
                        </Status>
                        {link.lastSyncError ? (
                          <p className="mt-1 max-w-xs text-destructive text-xs">
                            {link.lastSyncError}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {link.lastSyncedAt
                          ? formatDateTime(link.lastSyncedAt)
                          : "Never"}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={syncLink.isPending}
                            onClick={() =>
                              syncLink.execute({ linkId: link.id, apply: true })
                            }
                          >
                            {syncLink.isPending ? (
                              <Loader2Icon
                                data-icon="inline-start"
                                className="animate-spin"
                              />
                            ) : (
                              <RefreshCwIcon data-icon="inline-start" />
                            )}
                            Sync
                          </Button>
                          <Button asChild size="sm" variant="ghost">
                            <Link
                              href={`/admin/groups/${link.categoryId}/${link.groupId}?tab=settings`}
                            >
                              <ExternalLinkIcon data-icon="inline-start" />
                              Open
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
