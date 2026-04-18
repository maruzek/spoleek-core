import { and, eq, isNull } from "drizzle-orm";

import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { db } from "@/server/db";
import { workspaceConnections } from "@/server/db/schema";
import { refreshWorkspaceAccessToken } from "@/server/lib/workspace/oauth";

const DIRECTORY_BASE = "https://admin.googleapis.com/admin/directory/v1";
const ACCESS_TOKEN_SKEW_MS = 60_000;

export class WorkspaceNotConnectedError extends Error {
  constructor() {
    super("Google Workspace is not connected for this organization.");
    this.name = "WorkspaceNotConnectedError";
  }
}

export class WorkspaceApiError extends Error {
  status: number;
  reason?: string;
  constructor(status: number, message: string, reason?: string) {
    super(message);
    this.name = "WorkspaceApiError";
    this.status = status;
    this.reason = reason;
  }
}

async function loadActiveConnection(orgId: string) {
  const [row] = await db
    .select()
    .from(workspaceConnections)
    .where(
      and(eq(workspaceConnections.orgId, orgId), isNull(workspaceConnections.revokedAt)),
    )
    .limit(1);
  return row ?? null;
}

export async function getAccessTokenForOrg(orgId: string) {
  const connection = await loadActiveConnection(orgId);
  if (!connection) {
    throw new WorkspaceNotConnectedError();
  }

  const now = Date.now();
  const expiresAt = connection.accessTokenExpiresAt
    ? new Date(connection.accessTokenExpiresAt).getTime()
    : 0;

  if (
    connection.accessToken &&
    expiresAt - ACCESS_TOKEN_SKEW_MS > now
  ) {
    return connection.accessToken;
  }

  const refreshToken = decryptSecret(connection.refreshTokenEncrypted);
  const refreshed = await refreshWorkspaceAccessToken(refreshToken);

  const nextExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
  const nextRefreshToken = refreshed.refresh_token ?? refreshToken;

  await db
    .update(workspaceConnections)
    .set({
      accessToken: refreshed.access_token,
      accessTokenExpiresAt: nextExpiresAt,
      scope: refreshed.scope,
      refreshTokenEncrypted:
        refreshed.refresh_token && refreshed.refresh_token !== refreshToken
          ? encryptSecret(refreshed.refresh_token)
          : connection.refreshTokenEncrypted,
      updatedAt: new Date(),
    })
    .where(eq(workspaceConnections.id, connection.id));

  // keep local var consistent in case we log later
  void nextRefreshToken;

  return refreshed.access_token;
}

async function directoryFetch(
  orgId: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const accessToken = await getAccessTokenForOrg(orgId);
  return fetch(`${DIRECTORY_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
  });
}

async function parseError(response: Response) {
  const text = await response.text();
  try {
    const json = JSON.parse(text) as {
      error?: { message?: string; errors?: { reason?: string }[] };
    };
    const reason = json.error?.errors?.[0]?.reason;
    const message = json.error?.message ?? text;
    return new WorkspaceApiError(response.status, message, reason);
  } catch {
    return new WorkspaceApiError(response.status, text);
  }
}

export type WorkspaceUserLookup = {
  exists: boolean;
  primaryEmail?: string;
  fullName?: string;
};

export async function checkWorkspaceUserExists(
  orgId: string,
  email: string,
): Promise<WorkspaceUserLookup> {
  const response = await directoryFetch(
    orgId,
    `/users/${encodeURIComponent(email)}`,
    { method: "GET" },
  );

  if (response.status === 404) {
    return { exists: false };
  }
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as {
    primaryEmail?: string;
    name?: { fullName?: string };
  };
  return {
    exists: true,
    primaryEmail: body.primaryEmail,
    fullName: body.name?.fullName,
  };
}

export type CreateWorkspaceUserInput = {
  primaryEmail: string;
  firstName: string;
  lastName: string;
  password: string;
};

export type CreateWorkspaceUserResult = {
  id: string;
  primaryEmail: string;
};

export async function createWorkspaceUser(
  orgId: string,
  input: CreateWorkspaceUserInput,
): Promise<CreateWorkspaceUserResult> {
  const response = await directoryFetch(orgId, "/users", {
    method: "POST",
    body: JSON.stringify({
      primaryEmail: input.primaryEmail,
      name: { givenName: input.firstName, familyName: input.lastName },
      password: input.password,
      changePasswordAtNextLogin: true,
    }),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  const body = (await response.json()) as {
    id: string;
    primaryEmail: string;
  };
  return { id: body.id, primaryEmail: body.primaryEmail };
}
