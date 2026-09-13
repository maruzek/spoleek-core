import { NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env";
import { authorizeCronRequest } from "@/server/lib/cron-auth";
import { shredEventGuestData } from "@/server/lib/events/retention";

async function handleShred(request: Request) {
  // Same secret family as the member purge: both are retention jobs.
  const authorization = authorizeCronRequest(request, {
    secret: getServerEnv().PURGE_CRON_SECRET,
    secretName: "PURGE_CRON_SECRET",
  });

  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.message },
      { status: authorization.status },
    );
  }

  const result = await shredEventGuestData();

  console.info("Shredded event guest data", result);

  return NextResponse.json(result);
}

export async function GET(request: Request) {
  return handleShred(request);
}

export async function POST(request: Request) {
  return handleShred(request);
}
