# Spoleek Core

Spoleek is a membership and operations platform for youth organizations, clubs, and scout troops. This repository now contains the first development slice:

- Next.js 16 App Router foundation
- PostgreSQL-only persistence with Drizzle ORM
- Better Auth for email/password and optional Google login
- `next-safe-action` for validated mutations
- Initial organization setup, member onboarding, and member administration flows

## Local development

1. Copy `.env.example` to `.env` and fill in the required secrets.
2. Start Postgres:

```bash
docker compose up -d db adminer
```

3. Generate and run database migrations:

```bash
pnpm db:generate
pnpm db:migrate
```

4. Start the app:

```bash
pnpm dev
```

The first authenticated user can complete `/setup` to bootstrap the organization.

## Scripts

- `pnpm dev` - run the app locally
- `pnpm build` - production build
- `pnpm lint` - lint the project
- `pnpm typecheck` - run TypeScript checks
- `pnpm db:generate` - generate Drizzle migrations from the schema
- `pnpm db:migrate` - apply Drizzle migrations
- `pnpm db:seed` - seed a demo organization when the database is empty

## Deployment notes

- Node.js runtime is the default target.
- `next.config.ts` uses `output: "standalone"` for self-hosted Docker/VPS deployments.
- The app is single-organization-first, but the schema and authorization helpers are written to remain SaaS-ready.

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
