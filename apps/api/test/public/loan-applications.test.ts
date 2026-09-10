import { describe, expect, it } from "vitest";

import { appRouter } from "../../src/router.js";
import {
  createTestContext,
  InMemoryLoanRepository,
  RecordingNotifier,
  secondUnderwriter,
  supportAgent,
  underwriter,
} from "../support/in-memory-repository.js";

describe("high-value confirmation workflow", () => {
  it("finalises an approval of exactly the threshold", async () => {
    const repository = new InMemoryLoanRepository();
    const caller = appRouter.createCaller(createTestContext(repository));

    const result = await caller.loanApplications.decide({
      applicationId: "app-at-threshold",
      decision: "APPROVED",
      approvedAmountMinor: 1_000_000,
      reason: "Within delegated authority",
    });

    expect(result.status).toBe("APPROVED");
    expect(result.approvedAmountMinor).toBe(1_000_000);
  });

  it("sends an approval one minor unit above the threshold for confirmation", async () => {
    const repository = new InMemoryLoanRepository();
    const notifier = new RecordingNotifier();
    const caller = appRouter.createCaller(
      createTestContext(repository, underwriter, undefined, notifier),
    );

    const result = await caller.loanApplications.decide({
      applicationId: "app-high-value",
      decision: "APPROVED",
      approvedAmountMinor: 1_000_001,
      reason: "Above delegated authority",
    });

    expect(result.status).toBe("PENDING_CONFIRMATION");
    expect(result.approvedAmountMinor).toBe(1_000_001);
    expect(notifier.sent).toEqual([{ applicationId: "app-high-value", type: "APPROVAL_PROPOSED" }]);
  });

  it("refuses to let the proposer confirm their own approval", async () => {
    const repository = new InMemoryLoanRepository();

    await appRouter
      .createCaller(createTestContext(repository, underwriter))
      .loanApplications.decide({
        applicationId: "app-high-value",
        decision: "APPROVED",
        approvedAmountMinor: 1_500_000,
        reason: "Above delegated authority",
      });

    await expect(
      appRouter.createCaller(createTestContext(repository, underwriter)).loanApplications.decide({
        applicationId: "app-high-value",
        decision: "CONFIRMED",
        reason: "Confirming my own proposal",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const application = await repository.findApplication("app-high-value");
    expect(application?.status).toBe("PENDING_CONFIRMATION");
  });

  it("lets a second underwriter confirm, preserving the proposed amount", async () => {
    const repository = new InMemoryLoanRepository();
    const notifier = new RecordingNotifier();

    await appRouter
      .createCaller(createTestContext(repository, underwriter, undefined, notifier))
      .loanApplications.decide({
        applicationId: "app-high-value",
        decision: "APPROVED",
        approvedAmountMinor: 1_500_000,
        reason: "Above delegated authority",
      });

    const result = await appRouter
      .createCaller(createTestContext(repository, secondUnderwriter, undefined, notifier))
      .loanApplications.decide({
        applicationId: "app-high-value",
        decision: "CONFIRMED",
        reason: "Independent review agrees",
      });

    expect(result.status).toBe("APPROVED");
    expect(result.approvedAmountMinor).toBe(1_500_000);
    expect(notifier.sent.map((entry) => entry.type)).toEqual(["APPROVAL_PROPOSED", "APPROVED"]);
    expect(repository.audits).toHaveLength(2);
  });

  it("treats a second confirmation of the same proposal as a conflict", async () => {
    const repository = new InMemoryLoanRepository();

    await appRouter
      .createCaller(createTestContext(repository, underwriter))
      .loanApplications.decide({
        applicationId: "app-high-value",
        decision: "APPROVED",
        approvedAmountMinor: 1_500_000,
        reason: "Above delegated authority",
      });

    await appRouter
      .createCaller(createTestContext(repository, secondUnderwriter))
      .loanApplications.decide({
        applicationId: "app-high-value",
        decision: "CONFIRMED",
        reason: "Independent review agrees",
      });

    await expect(
      appRouter
        .createCaller(createTestContext(repository, secondUnderwriter))
        .loanApplications.decide({
          applicationId: "app-high-value",
          decision: "CONFIRMED",
          reason: "Confirming again",
        }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("lets the original proposer reject their own proposal and clears the amount", async () => {
    const repository = new InMemoryLoanRepository();
    const notifier = new RecordingNotifier();

    await appRouter
      .createCaller(createTestContext(repository, underwriter, undefined, notifier))
      .loanApplications.decide({
        applicationId: "app-high-value",
        decision: "APPROVED",
        approvedAmountMinor: 1_500_000,
        reason: "Above delegated authority",
      });

    const result = await appRouter
      .createCaller(createTestContext(repository, underwriter, undefined, notifier))
      .loanApplications.decide({
        applicationId: "app-high-value",
        decision: "REJECTED",
        reason: "New information invalidates the proposal",
      });

    expect(result.status).toBe("REJECTED");
    expect(result.approvedAmountMinor).toBeNull();
    // The amount is cleared from the application but survives in the audit trail.
    expect(repository.audits[0]?.approvedAmountMinor).toBe(1_500_000);
  });
});

describe("decision guards", () => {
  it("refuses a decision from a support user", async () => {
    const caller = appRouter.createCaller(
      createTestContext(new InMemoryLoanRepository(), supportAgent),
    );

    await expect(
      caller.loanApplications.decide({
        applicationId: "app-pending",
        decision: "APPROVED",
        approvedAmountMinor: 400_000,
        reason: "Should never be recorded",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a non-positive approved amount at the input boundary", async () => {
    const caller = appRouter.createCaller(createTestContext());

    await expect(
      caller.loanApplications.decide({
        applicationId: "app-pending",
        decision: "APPROVED",
        approvedAmountMinor: -500_000,
        reason: "Negative amounts must not be persisted",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses an approval above the requested amount", async () => {
    const caller = appRouter.createCaller(createTestContext());

    await expect(
      caller.loanApplications.decide({
        applicationId: "app-pending",
        decision: "APPROVED",
        approvedAmountMinor: 500_001,
        reason: "Cannot approve more than requested",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses to confirm an application still awaiting initial review", async () => {
    const caller = appRouter.createCaller(createTestContext());

    await expect(
      caller.loanApplications.decide({
        applicationId: "app-pending",
        decision: "CONFIRMED",
        reason: "Nothing has been proposed yet",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("reports a missing application as NOT_FOUND rather than a generic failure", async () => {
    const caller = appRouter.createCaller(createTestContext());

    await expect(
      caller.loanApplications.decide({
        applicationId: "app-does-not-exist",
        decision: "REJECTED",
        reason: "No such application",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("leaves the application untouched when the audit write fails", async () => {
    const repository = new InMemoryLoanRepository();
    repository.failNextAudit = true;
    const caller = appRouter.createCaller(createTestContext(repository));

    await expect(
      caller.loanApplications.decide({
        applicationId: "app-pending",
        decision: "APPROVED",
        approvedAmountMinor: 400_000,
        reason: "Audit will fail",
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });

    const application = await repository.findApplication("app-pending");
    expect(application?.status).toBe("PENDING_REVIEW");
    expect(application?.approvedAmountMinor).toBeNull();
    expect(repository.audits).toHaveLength(0);
  });

  it("still records the decision when the notifier fails", async () => {
    const repository = new InMemoryLoanRepository();
    const notifier = new RecordingNotifier();
    notifier.failNextSend = true;
    const caller = appRouter.createCaller(
      createTestContext(repository, underwriter, undefined, notifier),
    );

    const result = await caller.loanApplications.decide({
      applicationId: "app-pending",
      decision: "APPROVED",
      approvedAmountMinor: 400_000,
      reason: "Notification delivery is not part of the decision",
    });

    expect(result.status).toBe("APPROVED");
    expect(repository.audits).toHaveLength(1);
  });
});
