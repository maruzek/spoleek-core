import { NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env";
import { purgeDeletedMembers } from "@/server/lib/member-lifecycle";

function isAuthorized(request: Request) {
  const env = getServerEnv();
  const secret = env.PURGE_CRON_SECRET ?? process.env.CRON_SECRET?.trim();

  if (!secret) {
    return {
      ok: false as const,
      status: 503,
      message: "PURGE_CRON_SECRET or CRON_SECRET is not configured.",
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

  return {
    ok: true as const,
  };
}

async function handlePurge(request: Request) {
  const authorization = isAuthorized(request);

  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.message },
      { status: authorization.status },
    );
  }

  const result = await purgeDeletedMembers();

  console.info("Purged deleted members", result);

  // Stalled members are the one outcome that needs a human: their Workspace
  // account could not be deleted after repeated tries, so the record is being
  // held past its retention period until somebody looks. Logged separately so
  // it is not buried in an info line that reads as success.
  if (result.stalledMemberIds.length > 0) {
    console.error(
      `${result.stalledMemberIds.length} member(s) could not be purged: Workspace account deletion keeps failing.`,
      { memberIds: result.stalledMemberIds },
    );
  }

  return NextResponse.json(result);
}

export async function GET(request: Request) {
  return handlePurge(request);
}

export async function POST(request: Request) {
  return handlePurge(request);
}
