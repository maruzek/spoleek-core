"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { publishPolicyVersionAction } from "@/server/actions/policies";

type Audience = {
  total: number;
  onCurrent: number;
  neverShown: number;
  behindCurrent: number;
};

/**
 * The publish dialog.
 *
 * Its job is to make the consequence visible *before* the write. Publishing a
 * material version means every member is stopped at the portal until they act,
 * so the count of who that is belongs on screen next to the button, not in a
 * toast afterwards.
 */
export function PolicyPublishDialog({
  open,
  onOpenChange,
  documentId,
  documentTitle,
  audience,
  suggestedVersion,
  bodyHtml,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentTitle: string;
  audience: Audience;
  suggestedVersion: string;
  /** The editor's current content, published without a draft round trip. */
  bodyHtml: string;
}) {
  const router = useRouter();
  const [version, setVersion] = useState(suggestedVersion);
  const [summary, setSummary] = useState("");
  const [isMaterialChange, setIsMaterialChange] = useState(true);
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toISOString().slice(0, 10),
  );

  const publish = useAction(publishPolicyVersionAction, {
    onSuccess() {
      toast.success(`${documentTitle} ${version} published.`);
      onOpenChange(false);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not publish this version.");
    },
  });

  const validationErrors = publish.result.validationErrors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Publish {documentTitle}</DialogTitle>
          <DialogDescription>
            A published version can never be edited. Further changes start a new
            draft, so the text people have already accepted stays intact.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field data-invalid={Boolean(validationErrors?.version)}>
            <FieldLabel htmlFor="policy-version">Version label</FieldLabel>
            <FieldContent>
              <Input
                id="policy-version"
                value={version}
                autoComplete="off"
                onChange={(event) => setVersion(event.target.value)}
              />
              <FieldDescription>
                Appears in the public archived URL and in every acknowledgement
                record. Something like <code>2.0</code> or <code>2026-09</code>.
              </FieldDescription>
              {validationErrors?.version ? (
                <FieldError>Use letters, digits, dots, dashes or underscores.</FieldError>
              ) : null}
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="policy-effective-from">In force from</FieldLabel>
            <FieldContent>
              <DatePicker
                id="policy-effective-from"
                value={effectiveFrom}
                onChange={setEffectiveFrom}
              />
              <FieldDescription>
                A future date publishes ahead of a deadline: the current version
                stays in force until then.
              </FieldDescription>
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="policy-summary">What changed</FieldLabel>
            <FieldContent>
              <Textarea
                id="policy-summary"
                rows={3}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder="Named the new hosting provider and the email service as processors."
              />
              <FieldDescription>
                Shown to members when they are asked to accept, and in the
                notification email. Plain language beats legal language here.
              </FieldDescription>
            </FieldContent>
          </Field>

          <Field orientation="horizontal">
            <Checkbox
              id="policy-material"
              checked={isMaterialChange}
              onCheckedChange={(checked) => setIsMaterialChange(checked === true)}
            />
            <FieldContent>
              <FieldLabel htmlFor="policy-material">
                Material change — members must act before using the portal
              </FieldLabel>
              <FieldDescription>
                Leave this on unless the edit is cosmetic. Turning it off keeps
                everyone&rsquo;s existing acknowledgement standing, which is
                right for a typo and wrong for anything that alters what they
                agreed to.
              </FieldDescription>
            </FieldContent>
          </Field>
        </FieldGroup>

        {isMaterialChange ? (
          <Alert>
            <AlertTitle>
              All {audience.total} members will be asked to accept this version
            </AlertTitle>
            <AlertDescription>
              Nobody has acknowledged {version.trim() || "this version"} yet.
              {audience.onCurrent > 0
                ? ` The ${audience.onCurrent} who accepted the version in force are asked again, because the change is material.`
                : ""}
              {audience.neverShown > 0
                ? ` ${audience.neverShown} have never been shown this document at all — imported or admin-created members.`
                : ""}{" "}
              Everyone is stopped at the portal until they respond.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <AlertTitle>
              {audience.neverShown === 0
                ? "Nobody will be asked to act"
                : `${audience.neverShown} of ${audience.total} members will be asked to act`}
            </AlertTitle>
            <AlertDescription>
              The new text goes live immediately and the {audience.onCurrent}{" "}
              existing acknowledgements stay valid.
              {audience.neverShown > 0
                ? ` Only the ${audience.neverShown} who have never been shown this document are prompted.`
                : ""}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={publish.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={publish.isPending || version.trim() === ""}
            onClick={() =>
              publish.execute({
                documentId,
                version: version.trim(),
                summaryOfChanges: summary.trim(),
                isMaterialChange,
                effectiveFrom: new Date(effectiveFrom),
                bodyHtml,
              })
            }
          >
            {publish.isPending ? "Publishing…" : "Publish version"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
