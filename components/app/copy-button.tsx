"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";

import { useDictionary } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/utils/copy";

/**
 * The app's one way to hand a value to the clipboard: a Button that flips
 * to a tick for a moment. Used for emails, links and lists — nothing here
 * ever opens a mail client.
 */
export function CopyButton({
  value,
  label,
  copiedLabel,
  iconOnly = false,
  variant = "ghost",
  size = "sm",
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick" | "value" | "children"> & {
  value: string;
  /** Button text; defaults to "Copy". With `iconOnly`, becomes the accessible name. */
  label?: string;
  copiedLabel?: string;
  iconOnly?: boolean;
}) {
  const t = useDictionary().common;
  const [copied, setCopied] = useState(false);
  const text = label ?? t.copy;
  const doneText = copiedLabel ?? t.copied;

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  return (
    <Button
      type="button"
      variant={variant}
      size={iconOnly && size === "sm" ? "icon-sm" : size}
      aria-label={iconOnly ? (copied ? doneText : text) : undefined}
      title={iconOnly ? text : undefined}
      onClick={async () => {
        if (await copyToClipboard(value)) setCopied(true);
        else toast.error(t.copyFailed);
      }}
      {...props}
    >
      {copied ? (
        <CheckIcon data-icon={iconOnly ? undefined : "inline-start"} className="text-primary" />
      ) : (
        <CopyIcon data-icon={iconOnly ? undefined : "inline-start"} />
      )}
      {iconOnly ? null : copied ? doneText : text}
    </Button>
  );
}
