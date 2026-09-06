"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { ExternalLinkIcon, PlusIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { PolicyEditor } from "@/components/app/policy-editor";
import { PolicyPublishDialog } from "@/components/app/policy-publish-dialog";
import { PolicyDocumentCreateDialog } from "@/components/app/policy-document-create-dialog";
import { formatDateTime } from "@/lib/format";
import {
  discardPolicyDraftAction,
  savePolicyDraftAction,
  setPolicyDocumentActiveAction,
} from "@/server/actions/policies";
import type { PolicyDocumentRow } from "@/server/queries/policies";

/**
 * The Legal tab.
 *
 * One card per document. Each shows what is in force, who has acknowledged it,
 * the full version history, and the working draft — the four things an admin
 * needs before deciding to publish.
 */
export function LegalSettingsCard({ documents }: { documents: PolicyDocumentRow[] }) {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-prose text-sm text-muted-foreground">
          Published versions are immutable: editing one starts a new draft, so the
          text a member accepted stays readable for as long as the record does.
        </p>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <PlusIcon data-icon="inline-start" aria-hidden="true" />
          New document
        </Button>
      </div>

      {documents.length === 0 ? (
        <Empty>
          <EmptyTitle>No legal documents yet</EmptyTitle>
          <EmptyDescription>
            Add the terms members accept and the privacy notice they are shown.
          </EmptyDescription>
        </Empty>
      ) : (
        documents.map((row) => <PolicyDocumentCard key={row.document.id} row={row} />)
      )}

      <PolicyDocumentCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function PolicyDocumentCard({ row }: { row: PolicyDocumentRow }) {
  const { document, versions, current, draft, audience } = row;
  const router = useRouter();
  const [publishOpen, setPublishOpen] = useState(false);
  const [body, setBody] = useState(draft?.bodyHtml ?? current?.bodyHtml ?? "");
  const [dirty, setDirty] = useState(false);

  const saveDraft = useAction(savePolicyDraftAction, {
    onSuccess() {
      toast.success("Draft saved.");
      setDirty(false);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not save the draft.");
    },
  });

  const discardDraft = useAction(discardPolicyDraftAction, {
    onSuccess() {
      toast.success("Draft discarded.");
      setBody(current?.bodyHtml ?? "");
      setDirty(false);
      router.refresh();
    },
  });

  const setActive = useAction(setPolicyDocumentActiveAction, {
    onSuccess() {
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not update the document.");
    },
  });

  // The next label is the admin's choice, but starting from something sensible
  // beats starting from an empty box.
  const suggestedVersion = current?.version
    ? nextVersionLabel(current.version)
    : "1.0";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{document.title}</CardTitle>
          <Badge variant="outline">/legal/{document.slug}</Badge>
          <Badge variant={document.requiresAcceptance ? "default" : "secondary"}>
            {document.requiresAcceptance ? "Accepted" : "Acknowledged"}
          </Badge>
          {!document.isActive ? <Badge variant="outline">Retired</Badge> : null}
          {draft ? <Badge variant="secondary">Draft open</Badge> : null}
        </div>
        <CardDescription>
          {current ? (
            <>
              Version <strong>{current.version}</strong> in force since{" "}
              {current.effectiveFrom ? formatDateTime(current.effectiveFrom) : "—"}.{" "}
              {audience.onCurrent} of {audience.total} members have acknowledged it
              {audience.neverShown > 0
                ? `; ${audience.neverShown} have never been shown this document`
                : ""}
              .
            </>
          ) : (
            "Never published. Members are not asked for this document until a version is in force."
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {draft ? "Draft" : "Editing"}
            </p>
            {current ? (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/legal/${document.slug}`} target="_blank">
                  View public page
                  <ExternalLinkIcon data-icon="inline-end" aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
          </div>

          <PolicyEditor
            initialHtml={body}
            onChange={(html) => {
              setBody(html);
              setDirty(true);
            }}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saveDraft.isPending || !dirty}
              onClick={() =>
                saveDraft.execute({ documentId: document.id, bodyHtml: body })
              }
            >
              {saveDraft.isPending ? "Saving…" : "Save draft"}
            </Button>
            <Button
              type="button"
              disabled={body.trim() === "" || body === "<p></p>"}
              onClick={() => setPublishOpen(true)}
            >
              Publish…
            </Button>
            {draft ? (
              <Button
                type="button"
                variant="ghost"
                disabled={discardDraft.isPending}
                onClick={() => discardDraft.execute({ documentId: document.id })}
              >
                Discard draft
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto"
              disabled={setActive.isPending}
              onClick={() =>
                setActive.execute({
                  documentId: document.id,
                  isActive: !document.isActive,
                })
              }
            >
              {document.isActive ? "Retire document" : "Reactivate"}
            </Button>
          </div>
        </div>

        {versions.length > 0 ? (
          <>
            <Separator />
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Version history
              </p>
              <ul className="flex flex-col gap-1 text-sm">
                {versions.map((version) => (
                  <li
                    key={version.id}
                    className="flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                  >
                    <Link
                      href={`/legal/${document.slug}/v/${version.version}`}
                      target="_blank"
                      className="font-medium underline underline-offset-2"
                    >
                      {version.version}
                    </Link>
                    <Badge variant={version.status === "published" ? "default" : "outline"}>
                      {version.status === "published" ? "In force" : "Superseded"}
                    </Badge>
                    {!version.isMaterialChange ? (
                      <Badge variant="outline">Non-material</Badge>
                    ) : null}
                    <span className="text-muted-foreground">
                      {version.publishedAt ? formatDateTime(version.publishedAt) : "—"}
                    </span>
                    {version.summaryOfChanges ? (
                      <span className="w-full text-xs text-muted-foreground">
                        {version.summaryOfChanges}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}
      </CardContent>

      <PolicyPublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        documentId={document.id}
        documentTitle={document.title}
        audience={audience}
        suggestedVersion={suggestedVersion}
        bodyHtml={body}
        reachable={row.reachable}
      />
    </Card>
  );
}

/**
 * Bumps a trailing integer: "1.0" -> "1.1", "2026-09" -> "2026-10" is NOT
 * attempted. Only a plain numeric tail is safe to increment; anything else is
 * handed back unchanged for the admin to overwrite.
 */
function nextVersionLabel(current: string): string {
  const match = current.match(/^(.*?)(\d+)$/);

  if (!match) {
    return current;
  }

  return `${match[1]}${Number(match[2]) + 1}`;
}
