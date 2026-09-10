# Loan Decision Workbench

Loan Decision Workbench is a small underwriting application used as a senior full-stack engineering exercise. It contains a Next.js review interface, a Fastify API exposed through tRPC, and a PostgreSQL data model managed by Prisma.

The repository is intentionally a realistic starter rather than a finished reference implementation. If you are completing the exercise, read [TASK.md](./TASK.md) before changing the code.

## Technology

- TypeScript 5, pnpm workspaces, and Turborepo
- Next.js App Router and React
- Fastify and tRPC
- Prisma and PostgreSQL
- Redis development service
- Vitest, Testing Library, ESLint, and Prettier

## Quick start with a dev container

The recommended setup is VS Code or another editor that supports the [Development Containers specification](https://containers.dev/).

1. Install Docker and the Dev Containers extension.
2. Open this repository and choose **Reopen in Container**.
3. Wait for pnpm installation, Prisma migrations, and seed data to finish.
4. Run `pnpm dev` in the workspace container terminal.
5. Open <http://localhost:3000> and select the seeded application.

The devcontainer supplies Node.js, pnpm, PostgreSQL, and Redis. Turborepo runs the web and API processes inside the workspace container; they are not separate Compose services. Ports 3000 and 4000 are forwarded automatically.

## Run on the host

Requirements: Node.js 24+, pnpm 10+, and Docker. Corepack reads the pinned pnpm version from `package.json`.

```bash
corepack enable
cp .env.example .env
pnpm install --frozen-lockfile
docker compose -f docker-compose.dev.yaml up -d postgres redis
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Docker Compose runs infrastructure only. Turborepo starts Next.js and Fastify on the host, watches both applications, and prefixes their output. The web application is available at <http://localhost:3000>, the API at <http://localhost:4000/trpc>, and the health endpoint at <http://localhost:4000/health>.

Stop application processes with `Ctrl+C`, then stop infrastructure without deleting its data:

```bash
docker compose -f docker-compose.dev.yaml down
```

Add `--volumes` only when you intentionally want to discard the local PostgreSQL and Redis data.

To create a production build and run the built web and API processes locally:

```bash
pnpm build
pnpm start
```

## Quality checks

```bash
pnpm test
pnpm lint
pnpm format:check
pnpm build
```

## Repository layout

```text
apps/api/          Fastify server, tRPC router, and API public tests
apps/web/          Next.js application, decision form, and UI public tests
packages/config/   Shared TypeScript, ESLint, and Prettier configuration
packages/db/       Prisma client, schema, migration, and seed
```

## Useful commands

| Command           | Purpose                                                    |
| ----------------- | ---------------------------------------------------------- |
| `pnpm dev`        | Run web and API development tasks through Turborepo        |
| `pnpm test`       | Run app-local public tests through Turborepo               |
| `pnpm db:migrate` | Apply committed Prisma migrations                          |
| `pnpm db:seed`    | Load development users and workflow fixtures               |
| `pnpm lint`       | Run shared ESLint configuration in each workspace          |
| `pnpm format`     | Apply the shared Prettier configuration                    |
| `pnpm build`      | Generate Prisma and build all workspaces through Turborepo |
