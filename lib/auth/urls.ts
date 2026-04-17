import { getServerEnv } from "@/lib/env";

export function buildAbsoluteAppUrl(path: string) {
  const env = getServerEnv();
  return new URL(path, env.APP_URL).toString();
}

export function buildAbsoluteCallbackUrl(path: string, origin?: string) {
  if (origin) {
    return new URL(path, origin).toString();
  }

  if (typeof window !== "undefined") {
    return new URL(path, window.location.origin).toString();
  }

  return buildAbsoluteAppUrl(path);
}
