import cors from "@fastify/cors";
import { prisma } from "@loan-review/db";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import Fastify from "fastify";

import type { RequestContext, UserRole } from "./domain.js";
import { PrismaLoanRepository } from "./repository.js";
import { appRouter } from "./router.js";

const server = Fastify({ logger: true, routerOptions: { maxParamLength: 5_000 } });
const repository = new PrismaLoanRepository(prisma);

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
        },
      };
    },
  },
});

try {
  await server.listen({ port: 4000, host: "0.0.0.0" });
} catch (error: unknown) {
  server.log.error(error);
  process.exit(1);
}
