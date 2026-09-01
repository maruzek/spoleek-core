"use client";

import { useCallback, useState } from "react";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import {
  Link2Icon,
  Link2OffIcon,
  Loader2Icon,
  RefreshCwIcon,
  Settings2Icon,
} from "lucide-react";
import { toast } from "sonner";

import {
  defaultWorkspaceLinkSettings,
  describeLinkHealth,
  workspaceLinkDirectionOptions,
  type WorkspaceLinkPlanRow,
  type WorkspaceLinkSettings,
} from "@/lib/workspace-group-links";
import { formatDateTime } from "@/lib/format";
import {
  WorkspaceGroupPicker,
  WorkspaceLinkSettingsFields,
} from "@/components/app/workspace-link-fields";
import { WorkspaceLinkPreviewTable } from "@/components/app/workspace-link-preview-table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  FieldTitle,
} from "@/components/ui/field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import { Switch } from "@/components/ui/switch";
import {
  createGroupWorkspaceLinkAction,
  deleteGroupWorkspaceLinkAction,
  previewGroupWorkspaceLinkAction,
  syncGroupWorkspaceLinkAction,
  updateGroupWorkspaceLinkAction,
} from "@/server/actions/workspace-group-links";
import type { GroupWorkspaceLinkRow } from "@/server/queries/workspace-group-links";

type GroupWorkspaceLinksCardProps = {
  groupId: string;
  links: GroupWorkspaceLinkRow[];
  workspaceConnected: boolean;
  canManage: boolean;
};

type PreviewResult = NonNullable<
  Awaited<ReturnType<typeof previewGroupWorkspaceLinkAction>>["data"]
>;

export function GroupWorkspaceLinksCard({
  groupId,
  links,
  workspaceConnected,
  canManage,
}: GroupWorkspaceLinksCardProps) {
  const router = useRouter();

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [settingsLink, setSettingsLink] = useState<GroupWorkspaceLinkRow | null>(
    null,
  );
  const [unlinkTarget, setUnlinkTarget] = useState<GroupWorkspaceLinkRow | null>(
    null,
  );
  const [removeMembershipsOnUnlink, setRemoveMembershipsOnUnlink] =
    useState(false);
  const [syncResult, setSyncResult] = useState<{
    email: string;
    rows: WorkspaceLinkPlanRow[];
  } | null>(null);

  const syncLink = useAction(syncGroupWorkspaceLinkAction, {
    onSuccess({ data, input }) {
      if (!data?.success) return;
      const link = links.find((entry) => entry.id === input.linkId);
      setSyncResult({
        email: link?.workspaceGroupEmail ?? "",
        rows: data.rows,
      });
      router.refresh();
    },
    onError({ error }) {
      if (error.serverError) toast.error(error.serverError);
    },
  });

  const deleteLink = useAction(deleteGroupWorkspaceLinkAction, {
    onSuccess() {
      toast.success("Link removed.");
      setUnlinkTarget(null);
      setRemoveMembershipsOnUnlink(false);
      router.refresh();
    },
    onError({ error }) {
      if (error.serverError) toast.error(error.serverError);
    },
  });

  if (!workspaceConnected) {
    return null;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Linked Google groups</CardTitle>
          <CardDescription>
            Keep a Google group&apos;s membership in step with this group. Nothing
            is changed in Google until you confirm a preview.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {links.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              This group is not linked to a Google group yet.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {links.map((link) => {
                const health = describeLinkHealth(link);
                const directionLabel = workspaceLinkDirectionOptions.find(
                  (option) => option.value === link.direction,
                )?.label;

                return (
                  <Item key={link.id} variant="outline">
                    <ItemContent>
                      <ItemTitle className="line-clamp-none flex flex-wrap items-center gap-2">
                        <span className="font-mono">
                          {link.workspaceGroupEmail}
                        </span>
                        <Status variant={health.variant} className="font-sans">
                          <StatusIndicator />
                          <StatusLabel>{health.label}</StatusLabel>
                        </Status>
                      </ItemTitle>
                      <ItemDescription>
                        {directionLabel}
                        {link.lastSyncedAt
                          ? ` · Last synced ${formatDateTime(link.lastSyncedAt)}`
                          : " · Never synced"}
                        {link.lastSyncError ? ` · ${link.lastSyncError}` : ""}
                      </ItemDescription>
                    </ItemContent>
                    {canManage ? (
                      <ItemActions>
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
                          Sync now
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setSettingsLink(link)}
                        >
                          <Settings2Icon data-icon="inline-start" />
                          Settings
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setUnlinkTarget(link)}
                        >
                          <Link2OffIcon data-icon="inline-start" />
                          Unlink
                        </Button>
                      </ItemActions>
                    ) : null}
                  </Item>
                );
              })}
            </div>
          )}

          {canManage ? (
            <div>
              <Button type="button" onClick={() => setLinkDialogOpen(true)}>
                <Link2Icon data-icon="inline-start" />
                Link a Google group
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <LinkDialog
        groupId={groupId}
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        onLinked={() => {
          setLinkDialogOpen(false);
          router.refresh();
        }}
      />

      <LinkSettingsDialog
        link={settingsLink}
        onOpenChange={(open) => !open && setSettingsLink(null)}
        onSaved={() => {
          setSettingsLink(null);
          router.refresh();
        }}
      />

      <Dialog
        open={syncResult != null}
        onOpenChange={(open) => !open && setSyncResult(null)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sync queued</DialogTitle>
            <DialogDescription className="break-words">
              What this sync does to{" "}
              <span className="font-mono">{syncResult?.email}</span>.
            </DialogDescription>
          </DialogHeader>
          <WorkspaceLinkPreviewTable
            rows={syncResult?.rows ?? []}
            emptyLabel="Already in sync — nothing to change."
          />
          <DialogFooter>
            <Button type="button" onClick={() => setSyncResult(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={unlinkTarget != null}
        onOpenChange={(open) => {
          if (!open) {
            setUnlinkTarget(null);
            setRemoveMembershipsOnUnlink(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink this Google group?</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              {unlinkTarget
                ? `Spoleek will stop syncing ${unlinkTarget.workspaceGroupEmail}. It added ${unlinkTarget.ownedCount} member${unlinkTarget.ownedCount === 1 ? "" : "s"} to that group.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {unlinkTarget && unlinkTarget.ownedCount > 0 ? (
            <Field orientation="horizontal" className="min-w-0">
              <FieldContent className="min-w-0">
                <FieldTitle>
                  Also remove those {unlinkTarget.ownedCount} membership
                  {unlinkTarget.ownedCount === 1 ? "" : "s"}
                </FieldTitle>
                <FieldDescription className="break-words">
                  Only memberships Spoleek created are touched. Anyone added in
                  the Google Admin console stays.
                </FieldDescription>
              </FieldContent>
              <Switch
                className="shrink-0"
                checked={removeMembershipsOnUnlink}
                onCheckedChange={setRemoveMembershipsOnUnlink}
              />
            </Field>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20"
              onClick={() => {
                if (!unlinkTarget) return;
                deleteLink.execute({
                  linkId: unlinkTarget.id,
                  removeMemberships: removeMembershipsOnUnlink,
                });
              }}
            >
              Unlink
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Linking is two steps on purpose: the admin sees the exact rows the same
 * reconciler will act on before anything reaches Google.
 */
function LinkDialog({
  groupId,
  open,
  onOpenChange,
  onLinked,
}: {
  groupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [settings, setSettings] = useState<WorkspaceLinkSettings>(
    defaultWorkspaceLinkSettings,
  );
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  const previewLink = useAction(previewGroupWorkspaceLinkAction, {
    onSuccess({ data }) {
      if (data) setPreview(data);
    },
    onError({ error }) {
      if (error.serverError) toast.error(error.serverError);
    },
  });
  const createLink = useAction(createGroupWorkspaceLinkAction, {
    onSuccess({ data }) {
      if (!data?.success) return;
      toast.success(
        data.queued > 0
          ? `Linked — ${data.queued} change${data.queued === 1 ? "" : "s"} queued.`
          : "Linked.",
      );
      reset();
      onLinked();
    },
    onError({ error }) {
      if (error.serverError) toast.error(error.serverError);
    },
  });

  const reset = useCallback(() => {
    setSelected(null);
    setSettings(defaultWorkspaceLinkSettings);
    setPreview(null);
  }, []);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Link a Google group</DialogTitle>
          <DialogDescription>
            Search for the Google group, choose how it should be kept in step,
            then review every change before it happens.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] min-w-0 flex-col gap-6 overflow-y-auto overflow-x-hidden px-1">
          <WorkspaceGroupPicker
            id="link-dialog-group"
            value={selected}
            onValueChange={(value) => {
              setSelected(value);
              setPreview(null);
            }}
          />

          <WorkspaceLinkSettingsFields
            value={settings}
            onChange={(next) => {
              setSettings(next);
              setPreview(null);
            }}
            groupEmail={selected}
          />

          {preview ? (
            <div className="flex min-w-0 flex-col gap-2">
              <p className="font-medium text-sm">
                Adds {preview.addCount} · Removes {preview.removeCount} · Adopts{" "}
                {preview.adoptCount} · Leaves alone {preview.driftCount}
              </p>
              <WorkspaceLinkPreviewTable rows={preview.rows} />
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={!selected || previewLink.isPending}
            onClick={() => {
              if (!selected) return;
              previewLink.execute({
                groupId,
                workspaceGroupKey: selected,
                ...settings,
              });
            }}
          >
            {previewLink.isPending ? (
              <Loader2Icon data-icon="inline-start" className="animate-spin" />
            ) : null}
            Preview changes
          </Button>
          <Button
            type="button"
            disabled={!selected || !preview || createLink.isPending}
            onClick={() => {
              if (!selected) return;
              createLink.execute({
                groupId,
                workspaceGroupKey: selected,
                ...settings,
              });
            }}
          >
            {createLink.isPending ? (
              <Loader2Icon data-icon="inline-start" className="animate-spin" />
            ) : null}
            Link and sync
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkSettingsDialog({
  link,
  onOpenChange,
  onSaved,
}: {
  link: GroupWorkspaceLinkRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [draftId, setDraftId] = useState<string | null>(link?.id ?? null);
  const [settings, setSettings] = useState<WorkspaceLinkSettings>(
    defaultWorkspaceLinkSettings,
  );
  const [isEnabled, setIsEnabled] = useState(true);

  // Reload the draft whenever a different link is opened.
  if (link && link.id !== draftId) {
    setDraftId(link.id);
    setSettings({
      direction: link.direction,
      memberRole: link.memberRole,
      adminRole: link.adminRole,
      removalPolicy: link.removalPolicy,
      includeExternal: link.includeExternal,
    });
    setIsEnabled(link.isEnabled);
  }

  const updateLink = useAction(updateGroupWorkspaceLinkAction, {
    onSuccess() {
      toast.success("Link settings saved.");
      onSaved();
    },
    onError({ error }) {
      if (error.serverError) toast.error(error.serverError);
    },
  });

  if (!link) return null;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="break-all font-mono text-base">
            {link.workspaceGroupEmail}
          </DialogTitle>
          <DialogDescription>
            How this Google group is kept in step with the Spoleek group.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] min-w-0 flex-col gap-6 overflow-y-auto overflow-x-hidden px-1">
          <WorkspaceLinkSettingsFields
            value={settings}
            onChange={setSettings}
            groupEmail={link.workspaceGroupEmail}
            showEnabled
            isEnabled={isEnabled}
            onEnabledChange={setIsEnabled}
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={updateLink.isPending}
            onClick={() =>
              updateLink.execute({
                linkId: link.id,
                ...settings,
                isEnabled,
              })
            }
          >
            {updateLink.isPending ? (
              <Loader2Icon data-icon="inline-start" className="animate-spin" />
            ) : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
