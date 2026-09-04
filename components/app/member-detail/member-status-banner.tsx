"use client";

import type { ComponentType, ReactNode } from "react";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export type MemberBannerTone = "warning" | "danger";

/**
 * Every state banner on the member record renders through here, so "needs
 * approval" and "owes money" differ only in colour and icon rather than in
 * shape, padding, and where the action sits. Adding a third state means
 * picking a tone, not rebuilding a layout.
 */
const TONE_STYLES: Record<
  MemberBannerTone,
  { alert: string; title: string; icon: string }
> = {
  warning: {
    alert: "border-amber-500/30 bg-amber-500/5",
    title: "text-amber-700 dark:text-amber-500",
    icon: "text-amber-600 dark:text-amber-500",
  },
  danger: {
    alert: "border-destructive/30 bg-destructive/5",
    title: "text-destructive",
    icon: "text-destructive",
  },
};

export function MemberStatusBanner({
  tone,
  icon: Icon,
  title,
  description,
  action,
}: {
  tone: MemberBannerTone;
  icon: ComponentType<{ className?: string }>;
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
}) {
  const styles = TONE_STYLES[tone];

  return (
    <Alert className={cn("max-w-3xl px-4 py-3.5", styles.alert)}>
      <Icon className={styles.icon} />
      <AlertTitle className={cn("text-base", styles.title)}>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
      {action ? (
        <AlertAction className="top-3.5 right-3.5">{action}</AlertAction>
      ) : null}
    </Alert>
  );
}
