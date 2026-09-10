import { describe, expect, it } from "vitest";

import { appRouter } from "../../src/router.js";
import {
  approvalInput,
  createTestContext,
  InMemoryLoanRepository,
} from "../support/in-memory-repository.js";

describe("loan application public examples", () => {
  it("returns the seeded pending application for review", async () => {
    const caller = appRouter.createCaller(createTestContext());

    const result = await caller.loanApplications.getForReview({ applicationId: "app-pending" });

    expect(result).toMatchObject({
      id: "app-pending",
      status: "PENDING_REVIEW",
      requestedAmountMinor: 500_000,
      customer: { fullName: "Olena Kovalenko" },
    });
    expect(result.customer).not.toHaveProperty("nationalId");
  });

  it("approves an eligible application", async () => {
    const repository = new InMemoryLoanRepository();
    const caller = appRouter.createCaller(createTestContext(repository));

    const result = await caller.loanApplications.decide(approvalInput());

    expect(result).toMatchObject({
      applicationId: "app-pending",
      status: "APPROVED",
      approvedAmountMinor: 400_000,
    });
    expect(repository.audits).toHaveLength(1);
  });

  it("rejects an application without an approved amount", async () => {
    const repository = new InMemoryLoanRepository();
    const caller = appRouter.createCaller(createTestContext(repository));

    const result = await caller.loanApplications.decide({
      applicationId: "app-pending",
      decision: "REJECTED",
      reason: "The submitted income cannot be verified",
    });

    expect(result.status).toBe("REJECTED");
    expect(result.approvedAmountMinor).toBeNull();
  });

  it("rejects an obviously empty reason at the input boundary", async () => {
    const caller = appRouter.createCaller(createTestContext());

    await expect(
      caller.loanApplications.decide(approvalInput({ reason: "" })),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
