import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";

import {
  HIGH_VALUE_THRESHOLD_MINOR,
  type LoanApplicationRecord,
  type LoanApplicationStatus,
  type LoanApplicationView,
  type RecordDecisionInput,
  type RequestContext,
} from "./domain.js";
import type { LoanNotificationType } from "./notifier.js";

const t = initTRPC.context<RequestContext>().create({ transformer: superjson });

const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

export const underwriterProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.session.user.role !== "UNDERWRITER") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only underwriters may record decisions" });
  }
  return next({ ctx });
});

export const decideLoanApplicationSchema = z.discriminatedUnion("decision", [
  z.object({
    applicationId: z.string().min(1),
    decision: z.literal("APPROVED"),
    approvedAmountMinor: z.number().int().positive(),
    reason: z.string().trim().min(1),
  }),
  z.object({
    applicationId: z.string().min(1),
    decision: z.literal("REJECTED"),
    reason: z.string().trim().min(1),
  }),
  z.object({
    applicationId: z.string().min(1),
    decision: z.literal("CONFIRMED"),
    reason: z.string().trim().min(1),
  }),
]);

type DecideInput = z.infer<typeof decideLoanApplicationSchema>;

function toView(application: LoanApplicationRecord): LoanApplicationView {
  return {
    id: application.id,
    status: application.status,
    requestedAmountMinor: application.requestedAmountMinor,
    approvedAmountMinor: application.approvedAmountMinor,
    proposedByUserId: application.proposedByUserId,
    customer: {
      fullName: application.customer.fullName,
      lastName: application.customer.lastName,
      gender: application.customer.gender,
      taxId: application.customer.taxId,
      email: application.customer.email,
    },
  };
}

const NOTIFICATION_BY_STATUS: Partial<Record<LoanApplicationStatus, LoanNotificationType>> = {
  PENDING_CONFIRMATION: "APPROVAL_PROPOSED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
};

function planTransition(
  application: LoanApplicationRecord,
  input: DecideInput,
  actorId: string,
): Omit<RecordDecisionInput, "applicationId" | "actorId" | "reason"> {
  if (input.decision === "REJECTED") {
    return {
      expectedStatuses: ["PENDING_REVIEW", "PENDING_CONFIRMATION"],
      nextStatus: "REJECTED",
      approvedAmountMinor: null,
      proposedByUserId: null,
      rejectActorAsProposer: false,
    };
  }

  if (input.decision === "CONFIRMED") {
    if (application.approvedAmountMinor === null) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This application is not awaiting confirmation",
      });
    }

    return {
      expectedStatuses: ["PENDING_CONFIRMATION"],
      nextStatus: "APPROVED",
      approvedAmountMinor: application.approvedAmountMinor,
      proposedByUserId: application.proposedByUserId,
      rejectActorAsProposer: true,
    };
  }

  if (input.approvedAmountMinor > application.requestedAmountMinor) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The approved amount cannot exceed the requested amount",
    });
  }

  const isHighValue = input.approvedAmountMinor > HIGH_VALUE_THRESHOLD_MINOR;

  return {
    expectedStatuses: ["PENDING_REVIEW"],
    nextStatus: isHighValue ? "PENDING_CONFIRMATION" : "APPROVED",
    approvedAmountMinor: input.approvedAmountMinor,
    proposedByUserId: isHighValue ? actorId : null,
    rejectActorAsProposer: false,
  };
}

export const appRouter = t.router({
  loanApplications: t.router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const applications = await ctx.repository.listApplications();
      return applications.map(toView);
    }),

    delete: underwriterProcedure
      .input(z.object({ applicationId: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const application = await ctx.repository.deleteApplication(input.applicationId);
        return toView(application);
      }),

    getForReview: protectedProcedure
      .input(z.object({ applicationId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        const application = await ctx.repository.findApplication(input.applicationId);
        if (!application) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Application not found" });
        }
        return toView(application);
      }),

    decide: underwriterProcedure
      .input(decideLoanApplicationSchema)
      .mutation(async ({ ctx, input }) => {
        const actorId = ctx.session.user.id;

        try {
          const application = await ctx.repository.findApplication(input.applicationId);
          if (!application) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Application not found" });
          }
          ctx.logger.info(
            {
              applicationId: application.id,
              actorId,
              currentStatus: application.status,
              decision: input.decision,
            },
            "Processing loan decision",
          );

          const plan = planTransition(application, input, actorId);

          const result = await ctx.repository.recordDecision({
            ...plan,
            applicationId: application.id,
            actorId,
            reason: input.reason,
          });

          if (result.outcome === "conflict") {
            throw new TRPCError({
              code: "CONFLICT",
              message: "This decision is not available for the application's current state",
            });
          }

          const decided = result.application;
          const notification = NOTIFICATION_BY_STATUS[decided.status];
          if (notification) {
            try {
              await ctx.notifier.send({ applicationId: decided.id, type: notification });
            } catch (error: unknown) {
              ctx.logger.error(
                { applicationId: decided.id, notification, error },
                "Loan decision was recorded but its notification could not be delivered",
              );
            }
          }

          return {
            applicationId: decided.id,
            status: decided.status,
            approvedAmountMinor: decided.approvedAmountMinor,
          };
        } catch (error: unknown) {
          if (error instanceof TRPCError) {
            throw error;
          }

          ctx.logger.error(
            { applicationId: input.applicationId, actorId, error },
            "Unexpected failure while recording a loan decision",
          );

          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Decision failed" });
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
