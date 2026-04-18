@AGENTS.md

# Repo quick facts

- Package manager: **pnpm** (not npm/yarn). Node runtime.
- Framework: **Next.js 16** App Router + React 19. Webpack build (`next build --webpack`).
- DB: PostgreSQL via **Drizzle ORM**; migrations in `server/db/migrations/` (generated, do not hand-edit).
- Auth: **Better Auth** (`lib/auth/auth.ts`, client in `lib/auth/client.ts`).
- Mutations: **next-safe-action** — always use the pre-configured clients, never raw server actions.

# Commands

- `pnpm dev` — dev server
- `pnpm build` — production build (webpack)
- `pnpm lint` — ESLint
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm db:generate` — generate migration from `server/db/schema.ts`
- `pnpm db:migrate` — apply migrations
- `pnpm db:seed` — seed demo org
- `docker compose up -d db adminer` — local Postgres + Adminer

Run `pnpm typecheck` and `pnpm lint` before declaring a task done.

# Layout

- `app/` — routes. `admin/` (org admin), `portal/` (member self-service), `setup/` (first-run wizard), `auth/`, `join/`, `api/`.
- `components/ui/` — shadcn primitives. **Reuse these first**; only add new ones via the shadcn CLI.
- `components/app/` — feature components (sheets, forms, admin panels).
- `server/actions/` — safe-action mutations (grouped by domain).
- `server/queries/` — read-side DB helpers. `access.ts` holds RBAC guards (`requireOrgAdminAccess`, etc.).
- `server/db/schema.ts` — single source of truth for the DB. Edit here, then `pnpm db:generate`.
- `lib/` — cross-cutting helpers (`safe-action.ts`, `safe-action-auth.ts`, `env.ts`, `i18n/`, `slugify.ts`).
- `emails/` — React Email templates sent via Resend.

# Conventions

- **Safe actions**: import from `lib/safe-action-auth.ts`:
  - `authActionClient` — requires an authenticated session.
  - `orgAdminActionClient` — requires `system_admin` OR org admin (via `requireOrgAdminAccess`).
  - Always call `.metadata({ actionName: "..." })` and validate input with Zod.
- **Forms**: TanStack Form. **Tables**: TanStack Table. See existing usages before rolling your own.
- **RBAC**: never check roles inline in a route; use the guards in `server/queries/access.ts` or the right action client.
- **Multi-tenancy**: every query over tenant data must filter by `orgId`. `tenant_members.userId` is nullable (shadow accounts) — treat it accordingly.
- **Schema changes**: edit `server/db/schema.ts` → `pnpm db:generate` → review the generated SQL → commit both.
- **i18n**: user-facing strings go through `lib/i18n/messages.ts`. English is primary, Czech secondary.
- **Env**: read through `lib/env.ts` (typed), not `process.env` directly.

# Gotchas

- Next.js 16 has breaking changes vs. training data — consult `node_modules/next/dist/docs/` when in doubt (see AGENTS.md).
- `next.config.ts` sets `output: "standalone"` for Docker/VPS; don't break that.
- Don't import from `server/` into client components. Server-only code includes anything touching `db`, `auth`, or `server/queries/*`.
- Lucide icons: `lucide-react` v1 — some icon names differ from older v0.x.
