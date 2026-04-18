import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { buildAbsoluteAppUrl } from "@/lib/auth/urls";
import { encryptSecret } from "@/lib/crypto";
import { db } from "@/server/db";
import { organizations, workspaceConnections } from "@/server/db/schema";
import { requireOrgAdminAccess } from "@/server/queries/access";
import { getViewerSession } from "@/server/queries/auth";
import {
  exchangeAuthorizationCode,
  fetchGoogleUserInfo,
} from "@/server/lib/workspace/oauth";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "spoleek_workspace_oauth_state";
const SETTINGS_URL = "/admin/settings";

function redirectWithStatus(status: "ok" | "error", message?: string) {
  const url = new URL(buildAbsoluteAppUrl(SETTINGS_URL));
  url.searchParams.set("workspace", status);
  if (message) url.searchParams.set("workspaceMessage", message);
  return NextResponse.redirect(url.toString());
}

export async function GET(request: NextRequest) {
  const session = await getViewerSession();
  if (!session) {
    return NextResponse.redirect(buildAbsoluteAppUrl("/"));
  }

  const { organization } = await requireOrgAdminAccess(session.user.id);

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");
  const cookieState = request.cookies.get(STATE_COOKIE)?.value;

  const response = errorParam
    ? redirectWithStatus("error", errorParam)
    : await handleCallback({
        code,
        state,
        cookieState,
        orgId: organization.id,
        orgDomain: organization.workspaceDomain,
        userId: session.user.id,
      });

  response.cookies.set(STATE_COOKIE, "", {
    path: "/api/workspace/oauth",
    maxAge: 0,
  });
  return response;
}

async function handleCallback(params: {
  code: string | null;
  state: string | null;
  cookieState: string | undefined;
  orgId: string;
  orgDomain: string | null;
  userId: string;
}) {
  const { code, state, cookieState, orgId, orgDomain, userId } = params;

  if (!code || !state || !cookieState || state !== cookieState) {
    return redirectWithStatus("error", "invalid_state");
  }

  if (!orgDomain) {
    return redirectWithStatus("error", "domain_missing");
  }

  try {
    const tokens = await exchangeAuthorizationCode(code);
    if (!tokens.refresh_token) {
      return redirectWithStatus("error", "no_refresh_token");
    }

    const userInfo = await fetchGoogleUserInfo(tokens.access_token);
    const grantingDomain = (userInfo.hd ?? userInfo.email.split("@")[1] ?? "").toLowerCase();
    if (grantingDomain !== orgDomain.toLowerCase()) {
      return redirectWithStatus("error", "domain_mismatch");
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    const encryptedRefresh = encryptSecret(tokens.refresh_token);

    const [existing] = await db
      .select({ id: workspaceConnections.id })
      .from(workspaceConnections)
      .where(eq(workspaceConnections.orgId, orgId))
      .limit(1);

    if (existing) {
      await db
        .update(workspaceConnections)
        .set({
          refreshTokenEncrypted: encryptedRefresh,
          accessToken: tokens.access_token,
          accessTokenExpiresAt: expiresAt,
          scope: tokens.scope,
          grantedByUserId: userId,
          grantedByEmail: userInfo.email,
          grantedAt: new Date(),
          revokedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(workspaceConnections.id, existing.id));
    } else {
      await db.insert(workspaceConnections).values({
        id: randomUUID(),
        orgId,
        refreshTokenEncrypted: encryptedRefresh,
        accessToken: tokens.access_token,
        accessTokenExpiresAt: expiresAt,
        scope: tokens.scope,
        grantedByUserId: userId,
        grantedByEmail: userInfo.email,
      });
    }

    await db
      .update(organizations)
      .set({
        workspaceConnectedAt: new Date(),
        workspaceAdminEmail: userInfo.email,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, orgId));

    return redirectWithStatus("ok");
  } catch (error) {
    console.error("Workspace OAuth callback failed", error);
    return redirectWithStatus(
      "error",
      error instanceof Error ? error.message : "unknown_error",
    );
  }
}
