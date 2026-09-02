import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/server/lib/cron-auth";
import { reconcileWorkspaceLinks } from "@/server/lib/workspace/reconcile-links";

/** Paced Directory API calls across many links add up; give the run room. */
export const maxDuration = 300;

/**
 * Nightly reconcile. Membership mutations only ever enqueue what they already
 * know about, so this pass is what notices everything that happened on the
 * Google side: manual additions (recorded as drift), manual removals (re-added
 * for `push` links), renames, and links whose queue quietly failed.
 */
async function handleReconcile(request: Request) {
  const authorization = authorizeCronRequest(request);

  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.message },
      { status: authorization.status },
    );
  }

  const result = await reconcileWorkspaceLinks();

  console.info("Reconciled workspace group links", result);

  return NextResponse.json(result);
}

export async function GET(request: Request) {
  return handleReconcile(request);
}

export async function POST(request: Request) {
  return handleReconcile(request);
}
