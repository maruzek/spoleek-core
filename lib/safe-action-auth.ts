import { betterAuth } from "@next-safe-action/adapter-better-auth";
import { forbidden } from "next/navigation";
import { createMiddleware } from "next-safe-action";

import { isFullAdmin, type Viewer } from "@/lib/access/viewer";
import { auth } from "@/lib/auth/auth";
import { actionClient } from "@/lib/safe-action";
import { loadViewer } from "@/server/queries/viewer";

/**
 * Session only. For the first-run wizard, which runs before an organization
 * exists; everything else uses `authActionClient`.
 */
export const sessionActionClient = actionClient.use(betterAuth(auth));

const viewerMiddleware = createMiddleware<{
  ctx: {
    auth: typeof auth.$Infer.Session;
  };
}>().define(async ({ ctx, next }) => {
  const viewer = await loadViewer(ctx.auth.user.id);

  if (!viewer) {
    throw new Error("The organization is not set up yet.");
  }

  return next({ ctx: { viewer } });
});

/**
 * Signed in, organization exists: `ctx.viewer` is the resolved Viewer
 * (CONTEXT.md). Guards in `server/queries/access.ts` take it as their first
 * argument, so an action body never resolves the viewer again.
 */
export const authActionClient = sessionActionClient.use(viewerMiddleware);

const orgAdminMiddleware = createMiddleware<{ ctx: { viewer: Viewer } }>().define(
  async ({ ctx, next }) => {
    if (!isFullAdmin(ctx.viewer)) {
      forbidden();
    }

    return next();
  },
);

export const orgAdminActionClient = authActionClient.use(orgAdminMiddleware);
