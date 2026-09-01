import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { buildAbsoluteAppUrl } from "@/lib/auth/urls";
import { getViewerSession } from "@/server/queries/auth";
import { requireOrgAdminAccess } from "@/server/queries/access";
import {
  buildWorkspaceAuthUrl,
  generateOAuthState,
} from "@/server/lib/workspace/oauth";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "spoleek_workspace_oauth_state";
const STATE_TTL_SECONDS = 600;
const SETUP_ORIGIN_SUFFIX = ".setup";

export async function GET(request: NextRequest) {
  const session = await getViewerSession();
  if (!session) {
    return NextResponse.redirect(buildAbsoluteAppUrl("/"));
  }

  const { organization } = await requireOrgAdminAccess(session.user.id);
  // The origin travels inside the state value itself, so the callback can send
  // the admin back to the first-run wizard rather than to settings.
  const state =
    new URL(request.url).searchParams.get("origin") === "setup"
      ? `${generateOAuthState()}${SETUP_ORIGIN_SUFFIX}`
      : generateOAuthState();
  const authUrl = buildWorkspaceAuthUrl({
    state,
    loginHintDomain: organization.workspaceDomain,
  });

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/workspace/oauth",
    maxAge: STATE_TTL_SECONDS,
  });
  // Touch cookies() for Next.js to recognise dynamic access.
  void (await cookies());
  return response;
}
