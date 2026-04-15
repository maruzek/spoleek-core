"use client";

import { Fragment } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useSelectedLayoutSegments } from "next/navigation";

const SEGMENT_LABELS: Record<string, string> = {
  admin: "Admin",
  events: "Events",
  forms: "Forms",
  "group-categories": "Group categories",
  groups: "Groups",
  members: "Members",
  payments: "Payments",
  portal: "Portal",
  profile: "Profile",
  "custom-fields": "Custom fields",
  settings: "Settings",
};

function toHref(segments: string[], index: number) {
  return `/${segments.slice(0, index + 1).join("/")}`;
}

function getLabel(segment: string) {
  return SEGMENT_LABELS[segment] ?? segment.replace(/-/g, " ");
}

export function AppBreadcrumbs() {
  const segments = useSelectedLayoutSegments().filter(
    (segment) => !segment.startsWith("("),
  );

  if (segments.length === 0) {
    return null;
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;
          const label = getLabel(segment);

          return (
            <Fragment key={segment}>
              <BreadcrumbItem key={segment}>
                {isLast ? (
                  <BreadcrumbPage className="capitalize">{label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    href={toHref(segments, index)}
                    className="capitalize"
                  >
                    {label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast ? (
                <BreadcrumbSeparator key={`${segment}-separator`} />
              ) : null}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
