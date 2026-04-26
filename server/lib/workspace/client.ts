import { and, eq, isNull } from "drizzle-orm";

import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { db } from "@/server/db";
import { workspaceConnections } from "@/server/db/schema";
import {
  buildGoogleApiExtraFields,
  type WorkspaceFieldValues,
} from "@/server/lib/workspace/field-catalog";
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
      and(
        eq(workspaceConnections.orgId, orgId),
        isNull(workspaceConnections.revokedAt),
      ),
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

  if (connection.accessToken && expiresAt - ACCESS_TOKEN_SKEW_MS > now) {
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

export type WorkspaceUser = {
  id: string;
  primaryEmail: string;
  fullName: string;
};

export async function getWorkspaceUser(
  orgId: string,
  email: string,
): Promise<WorkspaceUser | null> {
  const response = await directoryFetch(
    orgId,
    `/users/${encodeURIComponent(email)}`,
    { method: "GET" },
  );

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as {
    id: string;
    primaryEmail: string;
    name?: { fullName?: string };
  };
  return {
    id: body.id,
    primaryEmail: body.primaryEmail,
    fullName: body.name?.fullName ?? "",
  };
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
  extraFields?: WorkspaceFieldValues;
};

export type CreateWorkspaceUserResult = {
  id: string;
  primaryEmail: string;
};

export async function createWorkspaceUser(
  orgId: string,
  input: CreateWorkspaceUserInput,
): Promise<CreateWorkspaceUserResult> {
  const base: Record<string, unknown> = {
    primaryEmail: input.primaryEmail,
    name: { givenName: input.firstName, familyName: input.lastName },
    password: input.password,
    changePasswordAtNextLogin: true,
  };

  if (input.extraFields && Object.keys(input.extraFields).length > 0) {
    const extra = buildGoogleApiExtraFields(input.extraFields);
    Object.assign(base, extra);
  }

  const response = await directoryFetch(orgId, "/users", {
    method: "POST",
    body: JSON.stringify(base),
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

export async function searchWorkspaceUsers(
  orgId: string,
  query: string,
  maxResults = 5,
): Promise<WorkspaceUser[]> {
  const params = new URLSearchParams({
    customer: "my_customer",
    query,
    maxResults: String(maxResults),
    fields: "users(id,primaryEmail,name/fullName)",
  });
  const response = await directoryFetch(orgId, `/users?${params.toString()}`);

  if (response.status === 404) {
    return [];
  }
  if (!response.ok) {
    throw await parseError(response);
  }

  const body = (await response.json()) as {
    users?: {
      id: string;
      primaryEmail: string;
      name?: { fullName?: string };
    }[];
  };

  return (body.users ?? []).map((u) => ({
    id: u.id,
    primaryEmail: u.primaryEmail,
    fullName: u.name?.fullName ?? "",
  }));
}

export type WorkspaceGroup = {
  id: string;
  email: string;
  name: string;
};

export async function searchWorkspaceGroups(
  orgId: string,
  query: string,
  maxResults = 50,
): Promise<WorkspaceGroup[]> {
  const params = new URLSearchParams({
    customer: "my_customer",
    maxResults: String(maxResults),
  });
  if (query.trim()) {
    // Directory API prefix search: `email:prefix*` — the prefix must be the local part only.
    // If the user typed "user@domain.c", the prefix is "user" (everything before @).
    const prefix = query.trim().split("@")[0];
    params.set("query", `email:${prefix}*`);
  }
  const response = await directoryFetch(orgId, `/groups?${params.toString()}`);

  if (response.status === 404) {
    return [];
  }
  if (!response.ok) {
    throw await parseError(response);
  }

  const body = (await response.json()) as {
    groups?: { id: string; email: string; name?: string }[];
  };

  return (body.groups ?? []).map((g) => ({
    id: g.id,
    email: g.email,
    name: g.name ?? g.email,
  }));
}

export type WorkspaceOrgUnit = {
  name: string;
  orgUnitPath: string;
  parentOrgUnitPath: string;
};

export async function searchWorkspaceOrgUnits(
  orgId: string,
): Promise<WorkspaceOrgUnit[]> {
  const params = new URLSearchParams({
    type: "all",
  });
  const response = await directoryFetch(
    orgId,
    `/customer/my_customer/orgunits?${params.toString()}`,
  );

  if (response.status === 404) {
    return [];
  }
  if (!response.ok) {
    throw await parseError(response);
  }

  const body = (await response.json()) as {
    organizationUnits?: WorkspaceOrgUnit[];
  };

  return body.organizationUnits ?? [];
}

export async function addWorkspaceGroupMember(
  orgId: string,
  groupEmail: string,
  userEmail: string,
): Promise<void> {
  const response = await directoryFetch(
    orgId,
    `/groups/${encodeURIComponent(groupEmail)}/members`,
    {
      method: "POST",
      body: JSON.stringify({ email: userEmail, role: "MEMBER" }),
    },
  );

  // Ignore if already a member
  if (response.status === 409) {
    return;
  }
  if (!response.ok) {
    throw await parseError(response);
  }
}

export async function removeWorkspaceGroupMember(
  orgId: string,
  groupEmail: string,
  userEmail: string,
): Promise<void> {
  const response = await directoryFetch(
    orgId,
    `/groups/${encodeURIComponent(groupEmail)}/members/${encodeURIComponent(userEmail)}`,
    {
      method: "DELETE",
    },
  );

  // Ignore if not a member or group doesn't exist
  if (response.status === 404 || response.status === 400) {
    return;
  }
  if (!response.ok) {
    throw await parseError(response);
  }
}

export async function updateWorkspaceUserOrgUnit(
  orgId: string,
  userEmail: string,
  orgUnitPath: string,
): Promise<void> {
  const response = await directoryFetch(
    orgId,
    `/users/${encodeURIComponent(userEmail)}`,
    {
      method: "PUT",
      body: JSON.stringify({ orgUnitPath }),
    },
  );

  if (!response.ok) {
    throw await parseError(response);
  }
}
