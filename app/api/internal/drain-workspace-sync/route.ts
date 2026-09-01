import { NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env";
import { drainWorkspaceSyncOperations } from "@/server/lib/workspace/sync-queue";

function isAuthorized(request: Request) {
  const env = getServerEnv();
  const secret = env.WORKSPACE_SYNC_CRON_SECRET ?? process.env.CRON_SECRET?.trim();

  if (!secret) {
    return {
      ok: false as const,
      status: 503,
      message: "WORKSPACE_SYNC_CRON_SECRET or CRON_SECRET is not configured.",
    };
  }

  const authorization = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-spoleek-cron-secret");
  const providedSecret = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : headerSecret;

  if (providedSecret !== secret) {
    return {
      ok: false as const,
      status: 401,
      message: "Unauthorized.",
    };
  }

  return { ok: true as const };
}

async function handleDrain(request: Request) {
  const authorization = isAuthorized(request);

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
