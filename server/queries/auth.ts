import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/auth";

export async function getViewerSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}

export async function requireViewerSession() {
  const session = await getViewerSession();

  if (!session) {
    redirect("/");
  }

  return session;
}
