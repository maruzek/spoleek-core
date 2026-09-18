import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * "N people are waiting on you" — amber with the same soft glow the drift
 * badge uses, so anything across the admin that wants a human decision looks
 * the same. Optionally deep-links to the group's Requests tab.
 */
export function PendingRequestsBadge({ count, href }: { count: number; href?: string }) {
  const label = count === 1 ? "1 join request waiting" : `${count} join requests waiting`;
  const badge = (
    <Badge className="border-amber-500/40 bg-amber-500/15 text-amber-700 shadow-[0_0_8px_rgba(245,158,11,0.35)] tabular-nums dark:text-amber-400">
      {count}
    </Badge>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {href ? (
          <Link href={href} aria-label={label} onClick={(event) => event.stopPropagation()}>
            {badge}
          </Link>
        ) : (
          <span aria-label={label}>{badge}</span>
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
