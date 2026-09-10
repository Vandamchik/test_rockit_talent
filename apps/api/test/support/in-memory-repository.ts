import type {
  AppLogger,
  AuditRecordInput,
  LoanApplicationRecord,
  LoanRepository,
  RecordDecisionInput,
  RecordDecisionResult,
  RequestContext,
  SessionUser,
} from "../../src/domain.js";
import type { LoanNotification, LoanNotifier } from "../../src/notifier.js";

const seededApplications: LoanApplicationRecord[] = [
  {
    id: "app-pending",
    status: "PENDING_REVIEW",
    requestedAmountMinor: 500_000,
    approvedAmountMinor: null,
    proposedByUserId: null,
    customer: {
      fullName: "Olena Kovalenko",
      lastName: "Kovalenko",
      gender: "FEMALE",
      taxId: "TAX-72419831",
      email: "olena@example.test",
      phone: "+380501234567",
      nationalId: "ID-72419831",
      monthlyIncomeMinor: 180_000,
    },
  },
  {
    id: "app-at-threshold",
    status: "PENDING_REVIEW",
    requestedAmountMinor: 1_000_000,
    approvedAmountMinor: null,
    proposedByUserId: null,
    customer: {
      fullName: "Threshold Fixture",
      lastName: "Fixture",
      gender: "NON_BINARY",
      taxId: "TAX-THRESHOLD",
      email: "threshold@example.test",
      phone: "+380500000002",
      nationalId: "ID-THRESHOLD",
      monthlyIncomeMinor: 300_000,
    },
  },
  {
    id: "app-high-value",
    status: "PENDING_REVIEW",
    requestedAmountMinor: 2_000_000,
    approvedAmountMinor: null,
    proposedByUserId: null,
    customer: {
      fullName: "High Value Fixture",
      lastName: "Fixture",
      gender: "MALE",
      taxId: "TAX-HIGH-VALUE",
      email: "high-value@example.test",
      phone: "+380500000003",
      nationalId: "ID-HIGH-VALUE",
      monthlyIncomeMinor: 600_000,
    },
  },
];

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryLoanRepository implements LoanRepository {
  applications = clone(seededApplications);
  audits: AuditRecordInput[] = [];
  failNextAudit = false;

  get application(): LoanApplicationRecord {
    const first = this.applications[0];
    if (!first) {
      throw new Error("No applications seeded");
    }
    return first;
  }

  async findApplication(id: string): Promise<LoanApplicationRecord | null> {
    const found = this.applications.find((application) => application.id === id);
    return found ? clone(found) : null;
  }

  async listApplications(): Promise<LoanApplicationRecord[]> {
    return clone(this.applications);
  }

  async deleteApplication(id: string): Promise<LoanApplicationRecord> {
    const index = this.applications.findIndex((application) => application.id === id);
    const found = this.applications[index];
    if (index === -1 || !found) {
      throw new Error("Application not found");
    }
    this.applications.splice(index, 1);
    return clone(found);
  }

  async recordDecision(input: RecordDecisionInput): Promise<RecordDecisionResult> {
    const application = this.applications.find((entry) => entry.id === input.applicationId);

    if (!application) {
      return { outcome: "conflict" };
    }

    if (!input.expectedStatuses.includes(application.status)) {
      return { outcome: "conflict" };
    }

    if (
      input.rejectActorAsProposer &&
      (application.proposedByUserId === null || application.proposedByUserId === input.actorId)
    ) {
      return { outcome: "conflict" };
    }

    const previousStatus = application.status;
    const snapshot = clone(application);

    application.status = input.nextStatus;
    application.approvedAmountMinor = input.approvedAmountMinor;
    application.proposedByUserId = input.proposedByUserId;

    if (this.failNextAudit) {
      this.failNextAudit = false;
      Object.assign(application, snapshot); // the transaction rolls back
      throw new Error("Injected audit failure");
    }

    this.audits.push({
      applicationId: input.applicationId,
      actorId: input.actorId,
      previousStatus,
      newStatus: input.nextStatus,
      approvedAmountMinor: input.approvedAmountMinor,
      reason: input.reason,
    });

    return { outcome: "applied", application: clone(application) };
  }
}

export class RecordingNotifier implements LoanNotifier {
  sent: LoanNotification[] = [];
  failNextSend = false;

  async send(notification: LoanNotification): Promise<void> {
    if (this.failNextSend) {
      this.failNextSend = false;
      throw new Error("Injected notifier failure");
    }
    this.sent.push({ ...notification });
  }
}

export class CapturingLogger implements AppLogger {
  events: Array<{ level: "info" | "error"; context: Record<string, unknown>; message: string }> =
    [];

  info(context: Record<string, unknown>, message: string): void {
    this.events.push({ level: "info", context: safeClone(context), message });
  }

  error(context: Record<string, unknown>, message: string): void {
    this.events.push({ level: "error", context: safeClone(context), message });
  }
}

function safeClone(context: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(context)) {
    if (value instanceof Error) {
      result[key] = { name: value.name, message: value.message };
      continue;
    }

    try {
      result[key] = structuredClone(value);
    } catch {
      result[key] = String(value);
    }
  }

  return result;
}

export const underwriter: SessionUser = {
  id: "user-underwriter-1",
  name: "Ada Underwriter",
  role: "UNDERWRITER",
};

export const secondUnderwriter: SessionUser = {
  id: "user-underwriter-2",
  name: "Grace Underwriter",
  role: "UNDERWRITER",
};

export const supportAgent: SessionUser = {
  id: "user-support-1",
  name: "Sam Support",
  role: "SUPPORT",
};

export function createTestContext(
  repository = new InMemoryLoanRepository(),
  user: SessionUser = underwriter,
  logger = new CapturingLogger(),
  notifier = new RecordingNotifier(),
): RequestContext {
  return { repository, session: { user }, logger, notifier };
}

export function approvalInput(overrides: Record<string, unknown> = {}) {
  return {
    applicationId: "app-pending",
    decision: "APPROVED" as const,
    approvedAmountMinor: 400_000,
    reason: "Affordability checks passed",
    ...overrides,
  };
}
