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

/**
 * Text colour for the same variants, for counts and labels that stand beside a
 * badge. Keeping it next to the dot map is what stops a summary count from
 * drifting to a colour its badge never used.
 */
export const STATUS_TEXT_CLASSES: Record<StatusDotVariant, string> = {
  default: "text-foreground",
  success: "text-green-700 dark:text-green-400",
  error: "text-destructive",
  warning: "text-orange-600 dark:text-orange-400",
  info: "text-blue-600 dark:text-blue-400",
};
