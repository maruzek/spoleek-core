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

function isDynamicId(segment: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment);
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
          const dynamicSegmentsBefore = segments
            .slice(0, index + 1)
            .filter((value) => isDynamicId(value)).length;
          const label = isDynamicId(segment)
            ? dynamicSegmentsBefore === 1
              ? "Category"
              : "Group"
            : getLabel(segment);

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
