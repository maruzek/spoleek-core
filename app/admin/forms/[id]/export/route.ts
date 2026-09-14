import { slugify } from "@/lib/slugify";
import { requireFormManagementAccess } from "@/server/queries/access";
import { exportFormSubmissionsCsv } from "@/server/queries/forms";

/** CSV of the submissions table as the viewer sees it; withheld cells say so. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { context, form } = await requireFormManagementAccess(id);
  const includeSensitive = new URL(request.url).searchParams.get("sensitive") === "1";

  const csv = await exportFormSubmissionsCsv(
    context.organization.id,
    form.id,
    context.adminAccessLevel === "full" ? "full" : "scoped",
    { includeSensitive },
  );

  const filename = `${slugify(form.title) || "form"}-submissions.csv`;
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
