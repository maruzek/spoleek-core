"use client";

import type { ComponentType, ReactNode } from "react";

import { Notice, type NoticeTone } from "@/components/ui/notice";

export type MemberBannerTone = "warning" | "danger";

const TONE: Record<MemberBannerTone, NoticeTone> = { warning: "attention", danger: "danger" };

/**
 * Every state banner on the member record renders through here, so "needs
 * approval" and "owes money" differ only in tone and icon. It is a thin
 * naming layer over `Notice`; the shape lives there.
 */
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
  return (
    <Notice
      className="max-w-4xl"
      tone={TONE[tone]}
      icon={<Icon />}
      title={title}
      description={description}
      action={action}
    />
  );
}
