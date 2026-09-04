"use client";

import { useEffect, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { InfoIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { getEmailPreviewAction } from "@/server/actions/email-preview";

/**
 * The rendered message, fetched from Resend when the sheet opens.
 *
 * The HTML is dropped into a fully sandboxed iframe (`sandbox=""`, no
 * `allow-scripts`, no `allow-same-origin`): the body is provider-held content
 * we did not author at render time, so it must never execute or reach our
 * origin.
 */
export function EmailPreview({ emailActivityId }: { emailActivityId: string }) {
  const [mode, setMode] = useState<"html" | "text">("html");

  const { execute, result, isPending } = useAction(getEmailPreviewAction);

  useEffect(() => {
    execute({ emailActivityId });
    // Re-fetch only when the sheet moves to a different email.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailActivityId]);

  if (isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const preview = result.data;

  if (!preview || (!preview.html && !preview.text)) {
    return (
      <Alert>
        <InfoIcon />
        <AlertDescription>
          {preview?.unavailableReason ??
            result.serverError ??
            "The email preview could not be loaded."}
        </AlertDescription>
      </Alert>
    );
  }

  const hasBoth = Boolean(preview.html && preview.text);
  const effectiveMode = preview.html ? (preview.text ? mode : "html") : "text";

  return (
    <div className="flex flex-col gap-3">
      {hasBoth ? (
        <ToggleGroup
          type="single"
          value={effectiveMode}
          onValueChange={(value) => {
            if (value) setMode(value as "html" | "text");
          }}
          className="w-fit"
        >
          <ToggleGroupItem value="html">Rendered</ToggleGroupItem>
          <ToggleGroupItem value="text">Plain text</ToggleGroupItem>
        </ToggleGroup>
      ) : null}

      {effectiveMode === "html" && preview.html ? (
        <iframe
          // Nothing granted: no scripts, no same-origin, no forms.
          sandbox=""
          srcDoc={preview.html}
          title="Email preview"
          className="h-[28rem] w-full rounded-lg border bg-white"
        />
      ) : (
        <pre className="max-h-[28rem] overflow-auto rounded-lg border bg-muted/30 p-4 text-xs leading-relaxed whitespace-pre-wrap text-foreground">
          {preview.text}
        </pre>
      )}
    </div>
  );
}
