import type {
  AppLogger,
  AuditRecordInput,
  LoanApplicationRecord,
  LoanDecision,
  LoanRepository,
  RequestContext,
  SessionUser,
} from "../../src/domain.js";

const seededApplication: LoanApplicationRecord = {
  id: "app-pending",
  status: "PENDING_REVIEW",
  requestedAmountMinor: 500_000,
  approvedAmountMinor: null,
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
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryLoanRepository implements LoanRepository {
  application = clone(seededApplication);
  audits: AuditRecordInput[] = [];
  failNextAudit = false;

  async findApplication(id: string): Promise<LoanApplicationRecord | null> {
    return id === this.application.id ? clone(this.application) : null;
  }

  async listApplications(): Promise<LoanApplicationRecord[]> {
    return [clone(this.application)];
  }

  async deleteApplication(id: string): Promise<LoanApplicationRecord> {
    if (id !== this.application.id) {
      throw new Error("Application not found");
    }
    return clone(this.application);
  }

  async updateApplication(
    id: string,
    decision: LoanDecision,
    approvedAmountMinor: number | null,
  ): Promise<LoanApplicationRecord> {
    if (id !== this.application.id) {
      throw new Error("Application not found");
    }
    this.application.status = decision;
    this.application.approvedAmountMinor = approvedAmountMinor;
    return clone(this.application);
  }

  async createAudit(input: AuditRecordInput): Promise<void> {
    if (this.failNextAudit) {
      this.failNextAudit = false;
      throw new Error("Injected audit failure");
    }
    this.audits.push(clone(input));
  }
}

export class CapturingLogger implements AppLogger {
  events: Array<{ context: Record<string, unknown>; message: string }> = [];

  info(context: Record<string, unknown>, message: string): void {
    this.events.push({ context: clone(context), message });
  }
}

export const underwriter: SessionUser = {
  id: "user-underwriter-1",
  name: "Ada Underwriter",
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
): RequestContext {
  return { repository, session: { user }, logger };
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
