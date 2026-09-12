import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/server/lib/cron-auth";
import { reconcileWorkspaceLinks } from "@/server/lib/workspace/reconcile-links";

/**
 * Paced Directory API calls across many links add up, and 300s is what a real
 * reconcile pass wants. Capped at 60 because that is the Vercel Hobby ceiling
 * and the deploy is rejected outright above it.
 *
 * Dormant today: WORKSPACE_SYNC_ENABLED is false and `vercel.json` no longer
 * schedules this route. Before enabling Workspace sync, either move to a plan
 * that allows the longer duration or make the pass resumable across runs — 60s
 * will not finish a full reconcile over a large directory.
 */
export const maxDuration = 60;

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
