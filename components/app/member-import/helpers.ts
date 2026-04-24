import type { MemberCustomField } from "@/server/db/schema";

import type { FieldTarget, ParsedRow } from "./types";

export function buildFieldOptions(
  customFields: MemberCustomField[],
  workspaceReady: boolean,
) {
  const builtins: { value: FieldTarget; label: string }[] = [
    { value: "first_name", label: "First Name" },
    { value: "last_name", label: "Last Name" },
    { value: "email", label: "Email" },
  ];

  if (workspaceReady) {
    builtins.push({
      value: "workspace_email",
      label: "Workspace Email",
    });
  }

  builtins.push(
    { value: "role", label: "Role" },
    { value: "status", label: "Status" },
  );

  const customs: { value: FieldTarget; label: string }[] = customFields.map(
    (f) => ({
      value: `custom:${f.key}` as FieldTarget,
      label: f.label,
    }),
  );

  return [...builtins, ...customs];
}

export function buildWorkspaceQuery(
  row: ParsedRow,
  columnKeys: string[],
): string {
  const parts: string[] = [];
  for (const key of columnKeys) {
    const val = (row[key] ?? "").trim();
    if (val) parts.push(val);
  }
  return parts.join(" ");
}
