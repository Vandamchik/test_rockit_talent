import cors from "@fastify/cors";
import { prisma } from "@loan-review/db";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import Fastify from "fastify";

import type { RequestContext, UserRole } from "./domain.js";
import type { LoanNotification, LoanNotifier } from "./notifier.js";
import { PrismaLoanRepository } from "./repository.js";
import { appRouter } from "./router.js";

const server = Fastify({ logger: true, routerOptions: { maxParamLength: 5_000 } });
const repository = new PrismaLoanRepository(prisma);

const notifier: LoanNotifier = {
  async send(notification: LoanNotification): Promise<void> {
    server.log.info(
      { applicationId: notification.applicationId, type: notification.type },
      "Loan notification dispatched",
    );
  },
};

await server.register(cors, {
  origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  credentials: true,
});

server.get("/health", async () => ({ status: "ok" }));

await server.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: {
    router: appRouter,
    createContext({ req }: CreateFastifyContextOptions): RequestContext {
      const roleHeader = req.headers["x-user-role"];
      const role: UserRole = roleHeader === "SUPPORT" ? "SUPPORT" : "UNDERWRITER";
      return {
        repository,
        notifier,
        session: {
          user: {
            id: req.headers["x-user-id"]?.toString() ?? "user-underwriter-1",
            name: "Development User",
            role,
          },
        },
        logger: {
          info(context, message) {
            server.log.info(context, message);
          },
          error(context, message) {
            server.log.error(context, message);
          },
        },
      };
    },
  },
});

const port = Number(process.env.API_PORT ?? 4000);

if (!Number.isInteger(port) || port <= 0) {
  server.log.error({ configuredPort: process.env.API_PORT }, "API_PORT is not a valid port number");
  process.exit(1);
}

try {
  await server.listen({ port, host: "0.0.0.0" });
} catch (error: unknown) {
  server.log.error(error);
  process.exit(1);
}
