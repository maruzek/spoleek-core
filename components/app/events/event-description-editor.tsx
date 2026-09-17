"use client";

import { PolicyEditor } from "@/components/app/policy-editor";

/**
 * The event description editor is the policy editor: same extension set, same
 * sanitizer on write, so nothing the toolbar offers is stripped on save.
 */
export function EventDescriptionEditor({
  initialHtml,
  onChange,
}: {
  initialHtml: string;
  onChange: (html: string) => void;
}) {
  return <PolicyEditor initialHtml={initialHtml} onChange={onChange} className="min-h-40" />;
}
