import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/server/lib/cron-auth";
import { drainWorkspaceSyncOperations } from "@/server/lib/workspace/sync-queue";

async function handleDrain(request: Request) {
  const authorization = authorizeCronRequest(request);

  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.message },
      { status: authorization.status },
    );
  }

  const result = await drainWorkspaceSyncOperations({ limit: 500 });

  console.info("Drained workspace sync operations", result);

  return NextResponse.json(result);
}

export async function GET(request: Request) {
  return handleDrain(request);
}

export async function POST(request: Request) {
  return handleDrain(request);
}
