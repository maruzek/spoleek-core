import { randomBytes } from "node:crypto";

import { buildAbsoluteAppUrl } from "@/lib/auth/urls";
import { getServerEnv } from "@/lib/env";

export const WORKSPACE_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/admin.directory.user",
  "https://www.googleapis.com/auth/admin.directory.group",
  "https://www.googleapis.com/auth/admin.directory.orgunit",
] as const;

export const WORKSPACE_OAUTH_CALLBACK_PATH = "/api/workspace/oauth/callback";

export type WorkspaceTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token?: string;
};

export function getWorkspaceOAuthCredentials() {
  const env = getServerEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error(
      "Google OAuth credentials are not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    );
  }
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: buildAbsoluteAppUrl(WORKSPACE_OAUTH_CALLBACK_PATH),
  };
}

export function generateOAuthState() {
  return randomBytes(32).toString("base64url");
}

export function buildWorkspaceAuthUrl(params: {
  state: string;
  loginHintDomain?: string | null;
}) {
  const { clientId, redirectUri } = getWorkspaceOAuthCredentials();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", WORKSPACE_OAUTH_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", params.state);
  if (params.loginHintDomain) {
    url.searchParams.set("hd", params.loginHintDomain);
  }
  return url.toString();
}

export async function exchangeAuthorizationCode(code: string) {
  const { clientId, clientSecret, redirectUri } =
    getWorkspaceOAuthCredentials();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to exchange Google authorization code: ${text}`);
  }
  return (await response.json()) as WorkspaceTokenResponse;
}

export async function refreshWorkspaceAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = getWorkspaceOAuthCredentials();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to refresh Google access token: ${text}`);
  }
  return (await response.json()) as WorkspaceTokenResponse;
}

export async function revokeWorkspaceToken(token: string) {
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
}

export async function fetchGoogleUserInfo(accessToken: string) {
  const response = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: { authorization: `Bearer ${accessToken}` },
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch Google userinfo: ${text}`);
  }
  return (await response.json()) as {
    sub: string;
    email: string;
    email_verified?: boolean;
    name?: string;
    hd?: string;
  };
}
