"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { slugify } from "@/lib/slugify";
import { createPolicyDocumentAction } from "@/server/actions/policies";

type Kind = "terms" | "privacy" | "other";

/**
 * Creating a document is where `requiresAcceptance` is decided, so the dialog
 * explains the distinction rather than exposing a bare switch: terms are an
 * agreement you accept, a privacy notice is a disclosure you confirm reading.
 * Both gate the portal; only the wording differs.
 */
export function PolicyDocumentCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("terms");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  const create = useAction(createPolicyDocumentAction, {
    onSuccess() {
      toast.success("Document created.");
      onOpenChange(false);
      setTitle("");
      setSlug("");
      setSlugEdited(false);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not create the document.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New legal document</DialogTitle>
          <DialogDescription>
            The slug is fixed once created — a legal document&rsquo;s URL gets
            quoted in emails and acknowledgement records, so it must not rot.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="policy-kind">Type</FieldLabel>
            <FieldContent>
              <Select value={kind} onValueChange={(value) => setKind(value as Kind)}>
                <SelectTrigger id="policy-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="terms">Terms — members accept it</SelectItem>
                  <SelectItem value="privacy">
                    Privacy notice — members confirm they read it
                  </SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>
                {kind === "privacy"
                  ? "A disclosure. Nobody can agree to a statement of fact, so members are asked to confirm they have read it."
                  : "An agreement. Members are asked to accept it before using the portal."}
              </FieldDescription>
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="policy-title">Title</FieldLabel>
            <FieldContent>
              <Input
                id="policy-title"
                value={title}
                autoComplete="off"
                onChange={(event) => {
                  setTitle(event.target.value);
                  if (!slugEdited) {
                    setSlug(slugify(event.target.value));
                  }
                }}
              />
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="policy-slug">URL slug</FieldLabel>
            <FieldContent>
              <Input
                id="policy-slug"
                value={slug}
                autoComplete="off"
                onChange={(event) => {
                  setSlug(event.target.value);
                  setSlugEdited(true);
                }}
              />
              <FieldDescription>/legal/{slug || "…"}</FieldDescription>
            </FieldContent>
          </Field>
        </FieldGroup>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={create.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={create.isPending || title.trim() === "" || slug.trim() === ""}
            onClick={() =>
              create.execute({
                kind,
                title: title.trim(),
                slug: slug.trim(),
                // Only a privacy notice is a disclosure; everything else is an
                // agreement until an admin says otherwise.
                requiresAcceptance: kind !== "privacy",
              })
            }
          >
            {create.isPending ? "Creating…" : "Create document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
