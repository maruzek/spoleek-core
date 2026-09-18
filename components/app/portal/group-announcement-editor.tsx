"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { PencilIcon } from "lucide-react";

import { PolicyEditor } from "@/components/app/policy-editor";
import { useDictionary } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { updateGroupAnnouncementAction } from "@/server/actions/group-page";

/**
 * The leader's notice board editor: the policy editor in a dialog. An empty
 * document clears the board — there is no separate "delete", so the way to
 * take a note down is the way it went up.
 */
export function GroupAnnouncementEditor({
  groupId,
  initialHtml,
  variant = "dialog",
}: {
  groupId: string;
  initialHtml: string;
  /** `inline` renders the editor and its save button without the dialog — the admin tab uses it. */
  variant?: "dialog" | "inline";
}) {
  const t = useDictionary().portalGroupPage;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [html, setHtml] = useState(initialHtml);

  const save = useAction(updateGroupAnnouncementAction, {
    onSuccess({ data }) {
      toast.success(data?.cleared ? t.announcementCleared : t.announcementSaved);
      setOpen(false);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? t.failed);
    },
  });

  const editor = (
    <PolicyEditor
      // Remount on open so a cancelled edit does not linger in the next one.
      key={open ? "open" : "closed"}
      initialHtml={initialHtml}
      onChange={setHtml}
      className="min-h-48"
    />
  );
  const saveButton = (
    <Button type="button" onClick={() => save.execute({ groupId, html })} disabled={save.isPending}>
      {save.isPending ? <Spinner data-icon="inline-start" /> : null}
      {save.isPending ? t.saving : t.save}
    </Button>
  );

  if (variant === "inline") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t.announcementEditorDescription}</p>
        {editor}
        <div className="flex justify-end">{saveButton}</div>
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setHtml(initialHtml);
      }}
    >
      <Button variant="ghost" size="sm" className="-mr-2 text-muted-foreground" onClick={() => setOpen(true)}>
        <PencilIcon data-icon="inline-start" />
        {t.edit}
      </Button>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.announcement}</DialogTitle>
          <DialogDescription>{t.announcementEditorDescription}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto px-1">{editor}</div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>
            {t.cancel}
          </Button>
          {saveButton}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
