"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { acknowledgePoliciesAction } from "@/server/actions/policies";

export type OutstandingPolicy = {
  versionId: string;
  documentId: string;
  title: string;
  version: string;
  summaryOfChanges: string;
  bodyHtml: string;
  /** True: an agreement to accept. False: a disclosure to confirm reading. */
  requiresAcceptance: boolean;
  /** No prior acknowledgement of this document at all. */
  firstTime: boolean;
};

/**
 * The portal gate's form.
 *
 * The wording is the whole point of the `requiresAcceptance` split: you accept
 * an agreement, and you confirm having read a disclosure. Asking somebody to
 * "agree to" a privacy notice misdescribes what a privacy notice is, even
 * though both block the portal identically.
 */
export function PolicyAcknowledgementForm({
  policies,
}: {
  policies: OutstandingPolicy[];
}) {
  const router = useRouter();
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const acknowledge = useAction(acknowledgePoliciesAction, {
    onSuccess() {
      toast.success("Thank you — recorded.");
      router.replace("/portal");
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not record your response.");
    },
  });

  const allChecked = policies.every((policy) => checked[policy.versionId]);

  return (
    <div className="flex flex-col gap-6">
      {policies.map((policy) => (
        <Card key={policy.versionId}>
          <CardHeader>
            <CardTitle>{policy.title}</CardTitle>
            <CardDescription>
              Version {policy.version}
              {policy.firstTime
                ? " · shown to you for the first time"
                : " · this replaces the version you previously agreed to"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {policy.summaryOfChanges ? (
              <Alert>
                <AlertTitle>What changed</AlertTitle>
                <AlertDescription>{policy.summaryOfChanges}</AlertDescription>
              </Alert>
            ) : null}

            {/* Scrolls inside its own box: the document can be long, and the
                confirmation control has to stay reachable without hunting. */}
            <div className="max-h-96 overflow-y-auto rounded-md border bg-muted/20 px-4 py-3">
              <div
                className="policy-prose"
                // Sanitized server-side at publish time; see
                // server/lib/policy-html.ts.
                dangerouslySetInnerHTML={{ __html: policy.bodyHtml }}
              />
            </div>

            <Field orientation="horizontal">
              <Checkbox
                id={`ack-${policy.versionId}`}
                checked={checked[policy.versionId] ?? false}
                onCheckedChange={(value) =>
                  setChecked((previous) => ({
                    ...previous,
                    [policy.versionId]: value === true,
                  }))
                }
              />
              <FieldContent>
                <FieldLabel htmlFor={`ack-${policy.versionId}`}>
                  {policy.requiresAcceptance
                    ? `I accept the ${policy.title.toLowerCase()}.`
                    : `I confirm I have read the ${policy.title.toLowerCase()}.`}
                </FieldLabel>
              </FieldContent>
            </Field>
          </CardContent>
        </Card>
      ))}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          disabled={!allChecked || acknowledge.isPending}
          onClick={() =>
            acknowledge.execute({
              policyVersionIds: policies.map((policy) => policy.versionId),
            })
          }
        >
          {acknowledge.isPending ? "Saving…" : "Continue to the portal"}
        </Button>
        {!allChecked ? (
          <span className="text-sm text-muted-foreground">
            {policies.length > 1
              ? "Respond to every document above to continue."
              : "Tick the box above to continue."}
          </span>
        ) : null}
      </div>
    </div>
  );
}
