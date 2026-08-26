import type { MemberCustomField } from "@/server/db/schema";

import type { FieldTarget, ParsedRow } from "./types";

// Normalizes text for loose header/label matching: case, whitespace (including
// doubled/irregular internal spacing, not just leading/trailing), and Unicode
// composition (a CSV's diacritics can arrive as decomposed code points — e.g.
// "e" + combining caron — that look identical to a precomposed "ě" but aren't
// string-equal even after lowercasing).
export function normalizeForMatch(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

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

function escapeWorkspaceQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// The Admin SDK Directory API's `query` param requires field-scoped operators
// (e.g. `givenName:'John' familyName:'Doe'`) — a bare unstructured string like
// "John Doe" isn't valid query syntax and silently matches nothing.
export function buildWorkspaceQuery(
  row: ParsedRow,
  columnKeys: string[],
  columnMappings: Record<string, FieldTarget | null> = {},
): string {
  const terms: string[] = [];
  for (const key of columnKeys) {
    const val = (row[key] ?? "").trim();
    if (!val) continue;

    const target = columnMappings[key];
    const field =
      target === "first_name"
        ? "givenName"
        : target === "last_name"
          ? "familyName"
          : target === "email" || target === "workspace_email"
            ? "email"
            : "name";

    terms.push(`${field}:'${escapeWorkspaceQueryValue(val)}'`);
  }
  return terms.join(" ");
}
