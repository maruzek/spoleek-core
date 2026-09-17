/**
 * The dot colour for each `Status` badge variant, so a filter's coloured dots
 * and the table's badges are one mapping. Shared by every entity that has a
 * status column (members, event responses, …).
 */
export type StatusDotVariant = "default" | "success" | "error" | "warning" | "info";

export const STATUS_DOT_CLASSES: Record<StatusDotVariant, string> = {
  default: "bg-muted-foreground",
  success: "bg-green-600 dark:bg-green-400",
  error: "bg-destructive",
  warning: "bg-orange-600 dark:bg-orange-400",
  info: "bg-blue-600 dark:bg-blue-400",
};
